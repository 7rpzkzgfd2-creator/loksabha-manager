import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, advanceTurn, completeCounting, applyCommand, validateAction, clone, stateIntel, recommendations, seatFactors, candidateFit,
  migrateState, ensureTraits, STATE_BY_CODE, poachQuote,
} from '../src/engine/index.ts';
import type { CampaignAction, GameState, ScenarioConfig } from '../src/engine/index.ts';
import { makeRng } from '../src/engine/rng.ts';
import { resolveAction } from '../src/engine/actions.ts';
import { seatExpectation } from '../src/engine/voters.ts';

const cfg = (o: Partial<ScenarioConfig> = {}): ScenarioConfig => ({ scenarioId: 'ls2024', mode: 'quick', difficulty: 'normal', playerParty: 'INC', seed: 77, campaignTurns: 6, eventFrequency: 1, ...o });
const base = createGame(cfg());
const fresh = () => clone(base);
const act = (g: GameState, o: Partial<CampaignAction>): CampaignAction => ({ id: Math.random().toString(36), party: g.playerParty, type: 'state_campaign', ...o } as CampaignAction);
const sumPending = (g: GameState, code: string, party: string) => g.seats.filter((c) => c.state === code).reduce((a, c) => a + (c.pending[party] ?? 0), 0);

// --- candidates
test('every candidate has 1-5 strong and 1-5 weak issues that never overlap', () => {
  for (const c of base.seats) for (const k of Object.values(c.candidates)) {
    assert.ok(k.strong && k.strong.length >= 1 && k.strong.length <= 5, `${k.name} strong ${k.strong?.length}`);
    assert.ok(k.weak && k.weak.length >= 1 && k.weak.length <= 5, `${k.name} weak ${k.weak?.length}`);
    const s = new Set(k.strong.map((t) => t.issue));
    for (const t of k.weak) assert.ok(!s.has(t.issue), `${k.name} is both strong and weak on ${t.issue}`);
    for (const t of [...k.strong, ...k.weak]) assert.ok(t.level >= 0.25 && t.level <= 1);
  }
});

test('traits persist through save/load and are not rerolled by migration', () => {
  const g = fresh();
  const before = JSON.stringify(g.seats.map((c) => Object.values(c.candidates).map((k) => [k.strong, k.weak])));
  const loaded = JSON.parse(JSON.stringify(g)) as GameState;
  migrateState(loaded, STATE_BY_CODE);
  const after = JSON.stringify(loaded.seats.map((c) => Object.values(c.candidates).map((k) => [k.strong, k.weak])));
  assert.equal(after, before);
});

test('old saves without traits get the same traits every time they load', () => {
  const strip = () => { const g = fresh(); for (const c of g.seats) for (const k of Object.values(c.candidates)) { delete k.strong; delete k.weak; } return g; };
  const a = strip(), b = strip();
  ensureTraits(a); ensureTraits(b);
  assert.deepEqual(a.seats[100].candidates, b.seats[100].candidates);
  assert.ok(Object.values(a.seats[100].candidates).every((k) => k.strong!.length >= 1));
});

test('candidate issue fit changes the projected vote', () => {
  const g = fresh();
  const c = g.seats.find((x) => x.candidates.INC && x.state === 'RJ')!;
  const top = g.states[c.state].primary!;
  const k = c.candidates.INC;
  k.strong = [{ issue: top, level: 1 }, { issue: c.localIssues[0], level: 1 }]; k.weak = [{ issue: top === 'environment' ? 'security' : 'environment', level: 0.3 }];
  const good = seatExpectation(g, c).shares.INC;
  k.strong = [{ issue: top === 'environment' ? 'security' : 'environment', level: 0.3 }]; k.weak = [{ issue: top, level: 1 }, { issue: c.localIssues[0], level: 1 }];
  const bad = seatExpectation(g, c).shares.INC;
  assert.ok(good > bad + 0.01, `fit should matter: ${good} vs ${bad}`);
});

test('a candidate fit estimate weighs the seat more than the state', () => {
  const c = base.seats.find((x) => x.candidates.INC)!;
  const f = candidateFit(base, c, c.candidates.INC);
  assert.ok(Number.isFinite(f.stateFit) && Number.isFinite(f.seatFit));
  assert.ok(f.suitability >= 0 && f.suitability <= 1);
});

// --- real people, branding, factions
test('2024 places real candidates in their recorded seats, with real alliance seat-sharing', () => {
  const vns = base.seats.find((c) => c.name === 'Varanasi')!;
  assert.equal(vns.candidates.BJP.name, 'Narendra Modi');
  const rb = base.seats.find((c) => c.name === 'Rae Bareli')!;
  assert.equal(rb.candidates.INC.name, 'Rahul Gandhi');
  assert.ok(!rb.candidates.SP, 'SP stands down for INC in Rae Bareli');
});

test('real politicians never carry scandal risk and cannot be bribed', () => {
  for (const c of base.seats) for (const [pid, k] of Object.entries(c.candidates)) {
    if (!k.real) continue;
    assert.equal(k.controversy, 0);
    assert.equal(poachQuote(base, 'INC', c.id, pid), null);
  }
});

test('factions and names follow the scenario', () => {
  const g19 = createGame(cfg({ scenarioId: 'ls2019', playerParty: 'BJP' }));
  assert.ok(g19.parties.SHS.leaders!.some((l) => l.name === 'Uddhav Thackeray'));
  assert.ok(!g19.parties.SSUBT);
  assert.ok(base.parties.SSUBT.leaders!.some((l) => l.name === 'Uddhav Thackeray'));
  assert.ok(base.parties.SHS.leaders!.some((l) => l.name === 'Eknath Shinde'));
  assert.equal(g19.parties.BRS.short, 'TRS');
  assert.equal(base.parties.BRS.short, 'BRS');
});

test('every party has its election symbol name for the scenario', () => {
  for (const p of Object.values(base.parties)) if (p.id !== 'CUSTOM') assert.ok(p.displaySymbol, `${p.id} has no symbol`);
  assert.equal(base.parties.BJP.displaySymbol, 'Lotus');
  assert.equal(base.parties.INC.displaySymbol, 'Hand');
});

// --- state campaigns
test('state campaigns need a state budget and respect it', () => {
  const g = fresh();
  g.stage = 'campaign';
  const a = act(g, { state: 'RJ', mode: 'rallies', issue: 'jobs', budget: 10 });
  assert.match(validateAction(g, a) ?? '', /budget/i);
  assert.ok(applyCommand(g, 'INC', { type: 'set_state_budget', state: 'RJ', amount: 8 }).ok);
  assert.match(validateAction(g, a) ?? '', /left/);
  assert.ok(applyCommand(g, 'INC', { type: 'set_state_budget', state: 'RJ', amount: 20 }).ok);
  assert.equal(validateAction(g, a), null);
  assert.ok(!applyCommand(g, 'INC', { type: 'set_state_budget', state: 'UP', amount: 1e6 }).ok, 'cannot allocate more than the war chest');
});

test('one state campaign moves many seats, by different amounts', () => {
  const g = fresh();
  g.stage = 'campaign';
  const a = act(g, { state: 'MH', mode: 'rallies', issue: 'agriculture', budget: 30 });
  resolveAction(g, a, makeRng(5));
  const moves = g.seats.filter((c) => c.state === 'MH' && c.candidates.INC).map((c) => c.pending.INC ?? 0);
  assert.ok(moves.filter((m) => m > 0).length >= 3, 'several seats affected');
  assert.ok(Math.max(...moves) > Math.min(...moves) * 1.5, 'effects differ by seat');
});

test('the local share is conserved: no double counting across seats', () => {
  const g = fresh();
  const a = act(g, { state: 'KA', mode: 'rallies', issue: 'welfare', budget: 20 });
  const n = g.seats.filter((c) => c.state === 'KA' && c.candidates.INC).length;
  const moodBefore = g.states.KA.mood.INC ?? 0;
  resolveAction(g, a, makeRng(9));
  const stateShare = (g.states.KA.mood.INC ?? 0) - moodBefore; // P * 0.35
  const local = sumPending(g, 'KA', 'INC'); // P * 0.65 * n
  const P = stateShare / 0.35;
  assert.ok(Math.abs(local - P * 0.65 * n) < 1e-9, `local ${local} vs expected ${P * 0.65 * n}`);
});

test('state spending has diminishing returns', () => {
  const run = (budget: number) => { const g = fresh(); resolveAction(g, act(g, { state: 'MP', mode: 'rallies', issue: 'jobs', budget }), makeRng(3)); return sumPending(g, 'MP', 'INC'); };
  const e10 = run(10), e40 = run(40);
  assert.ok(e40 > e10, 'more money does more');
  assert.ok(e40 < e10 * 3, 'but four times the money does much less than four times as much');
  const g = fresh();
  resolveAction(g, act(g, { state: 'MP', mode: 'rallies', issue: 'jobs', budget: 20 }), makeRng(3));
  const first = sumPending(g, 'MP', 'INC');
  resolveAction(g, act(g, { state: 'MP', mode: 'rallies', issue: 'jobs', budget: 20 }), makeRng(3));
  const second = sumPending(g, 'MP', 'INC') - first;
  assert.ok(second < first * 0.9, `saturation: ${second} vs ${first}`);
});

test('priority seats get a bigger share', () => {
  const g = fresh();
  const seats = g.seats.filter((c) => c.state === 'RJ' && c.candidates.INC);
  const target = seats[seats.length - 1];
  const g2 = fresh();
  resolveAction(g, act(g, { state: 'RJ', mode: 'rallies', issue: 'jobs', budget: 20 }), makeRng(4));
  resolveAction(g2, act(g2, { state: 'RJ', mode: 'rallies', issue: 'jobs', budget: 20, seats: [target.id] }), makeRng(4));
  const t1 = g.seats.find((c) => c.id === target.id)!.pending.INC ?? 0;
  const t2 = g2.seats.find((c) => c.id === target.id)!.pending.INC ?? 0;
  assert.ok(t2 > t1 * 1.5);
});

test('leaders have limited days and pull hardest at home', () => {
  const g = fresh();
  const rahul = g.parties.INC.leaders!.find((l) => l.name === 'Rahul Gandhi')!;
  const tours: CampaignAction[] = [];
  for (let i = 0; i < rahul.days; i++) tours.push(act(g, { type: 'leader_tour', leaderId: rahul.id, state: 'UP', issue: 'jobs', tour: 'statewide' }));
  for (let i = 0; i < tours.length; i++) assert.equal(validateAction(g, tours[i], tours.slice(0, i)), null);
  assert.match(validateAction(g, act(g, { type: 'leader_tour', leaderId: rahul.id, state: 'UP', issue: 'jobs', tour: 'statewide' }), tours) ?? '', /no free days/);
  const sidd = g.parties.INC.leaders!.find((l) => l.name === 'Siddaramaiah')!;
  const home = fresh(); resolveAction(home, act(home, { type: 'leader_tour', leaderId: sidd.id, state: 'KA', issue: 'welfare', tour: 'statewide' }), makeRng(2));
  const away = fresh(); resolveAction(away, act(away, { type: 'leader_tour', leaderId: sidd.id, state: 'RJ', issue: 'welfare', tour: 'statewide' }), makeRng(2));
  const per = (g: GameState, s: string) => sumPending(g, s, 'INC') / g.seats.filter((c) => c.state === s && c.candidates.INC).length;
  assert.ok(per(home, 'KA') > per(away, 'RJ') * 1.5);
});

test('intel and recommendations come from the simulation', () => {
  const intel = stateIntel(base, 'INC');
  assert.equal(intel.length, Object.keys(base.states).length);
  const up = intel.find((s) => s.code === 'UP')!;
  const sumCats = Object.values(up.categories).reduce((a, b) => a + b, 0);
  assert.equal(sumCats, up.contesting);
  const recs = recommendations(base, 'INC', intel);
  assert.ok(recs.length > 0);
  for (const r of recs) assert.ok(intel.find((s) => s.code === r.state)!.contesting > 0);
});

test('the AI campaigns at state level and sends leaders on tour', () => {
  const g = advanceTurn(fresh(), {});
  const ai = g.outcomes.filter((o) => o.party !== 'INC');
  assert.ok(ai.some((o) => o.type === 'state_campaign'));
  assert.ok(ai.some((o) => o.type === 'leader_tour'));
});

test('a full 2024 election: 543 winners, totals add up, and close-seat explanations exist', () => {
  let g = fresh();
  while (g.phase === 'campaign') g = advanceTurn(g, {});
  g = completeCounting(g);
  const r = g.results[0];
  assert.equal(Object.keys(r.seats).length, 543);
  assert.equal(Object.values(r.partySeats).reduce((a, b) => a + b, 0), 543);
  const c = g.seats.find((x) => x.candidates.INC && r.seats[x.id].winner !== 'INC')!;
  const f = seatFactors(g, c, 'INC', r.seats[c.id].winner);
  assert.ok(f.length > 0 && f.every((x) => Number.isFinite(x.value)));
  assert.ok(r.autopsy.some((a) => /^(Held|Lost) /.test(a.heading)));
});

test('no real person is ever tagged weak on corruption', () => {
  for (const p of Object.values(base.parties)) for (const l of p.leaders ?? []) if (l.real) assert.ok(!l.weak.includes('corruption'), l.name);
  for (const c of base.seats) for (const k of Object.values(c.candidates)) if (k.real) assert.ok(!k.weak?.some((t) => t.issue === 'corruption'), k.name);
});
