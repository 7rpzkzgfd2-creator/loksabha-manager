import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, advanceTurn, completeCounting, advanceFormation, applyCommand, validateAction, clone, MAJORITY, ACTIONS, actionCost, blocTotals,
} from '../src/engine/index.ts';
import type { CampaignAction, GameState, ScenarioConfig } from '../src/engine/index.ts';
import { makeRng } from '../src/engine/rng.ts';
import { toSeatResult, seatExpectation, buildSeatModel, evaluateSeat } from '../src/engine/voters.ts';
import { resolveAction } from '../src/engine/actions.ts';
import { attemptPoach, takeBackdoorFunds, poachQuote } from '../src/engine/shadow.ts';

const cfg = (o: Partial<ScenarioConfig> = {}): ScenarioConfig => ({ scenarioId: 'ls2029', mode: 'quick', difficulty: 'normal', playerParty: 'INC', seed: 1234, campaignTurns: 6, eventFrequency: 1, ...o });
const base = createGame(cfg());
const fresh = () => clone(base);
function playOut(g: GameState): GameState {
  while (g.phase === 'campaign') g = advanceTurn(g, {});
  return completeCounting(g);
}
const finished = playOut(fresh());
const act = (g: GameState, o: Partial<CampaignAction>): CampaignAction => ({ id: Math.random().toString(36), party: g.playerParty, type: 'rally', ...o } as CampaignAction);

// --- electoral mathematics
test('543 constituencies', () => assert.equal(base.seats.length, 543));

test('constituency vote shares sum to 100% and votes are non-negative', () => {
  for (const c of finished.seats) {
    const r = finished.results[0].seats[c.id];
    const tot = Object.values(r.shares).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(tot - 1) < 1e-9, `${c.name} shares sum to ${tot}`);
    for (const v of Object.values(r.votes)) assert.ok(v >= 0);
  }
});

test('winner is the candidate with the most votes', () => {
  for (const r of Object.values(finished.results[0].seats)) {
    const best = Object.entries(r.shares).sort((a, b) => b[1] - a[1])[0][0];
    if (!r.tieBroken) assert.equal(r.winner, best);
  }
});

test('national seat totals equal the sum of constituency outcomes', () => {
  const r = finished.results[0];
  const counted: Record<string, number> = {};
  for (const s of Object.values(r.seats)) counted[s.winner] = (counted[s.winner] ?? 0) + 1;
  assert.deepEqual(counted, r.partySeats);
  assert.equal(Object.values(r.partySeats).reduce((a, b) => a + b, 0), 543);
});

test('vote share and seat share are distinct quantities', () => {
  const r = finished.results[0];
  const gaps = Object.keys(r.partySeats).map((p) => Math.abs(r.partySeats[p] / 543 - (r.voteShare[p] ?? 0)));
  assert.ok(Math.max(...gaps) > 0.05, 'first-past-the-post should distort seats away from votes');
});

test('coalition seat totals add up member seats', () => {
  const g = clone(finished);
  const blocs = blocTotals(g);
  const res = g.results[0];
  for (const [leader, n] of Object.entries(blocs)) {
    const members = Object.entries(g.formation!.commitments).filter(([, l]) => l === leader).map(([p]) => p);
    assert.equal(n, members.reduce((a, m) => a + (res.partySeats[m] ?? 0), 0));
  }
});

test('exact ties are broken by lot, reproducibly', () => {
  const c = base.seats[0];
  const a = toSeatResult(base, c, { INC: 0.4, BJP: 0.4, OTH: 0.2 }, 0.6, makeRng(1));
  const b = toSeatResult(base, c, { INC: 0.4, BJP: 0.4, OTH: 0.2 }, 0.6, makeRng(1));
  assert.ok(a.tieBroken);
  assert.equal(a.winner, b.winner);
});

test('lost deposits are parties under one-sixth of the vote', () => {
  const c = base.seats[0];
  const r = toSeatResult(base, c, { INC: 0.5, BJP: 0.38, SP: 0.12 }, 0.6, makeRng(2));
  assert.deepEqual(r.lostDeposits, ['SP']);
});

// --- campaign actions
test('actions deduct their cost', () => {
  const g = fresh();
  const p = g.parties.INC;
  const before = p.stats.funds;
  const a = act(g, { type: 'town_hall', constituency: g.seats.find((c) => c.candidates.INC)!.id, issue: 'jobs' });
  resolveAction(g, a, makeRng(3));
  assert.ok(Math.abs(p.stats.funds - (before - actionCost(a, p))) < 1e-6);
});

test('unaffordable actions are rejected', () => {
  const g = fresh();
  g.parties.INC.stats.funds = 1;
  const seat = g.seats.find((c) => c.candidates.INC)!.id;
  assert.match(validateAction(g, act(g, { constituency: seat, issue: 'jobs', speaker: 'leader' }))!, /money/);
});

test('actions respect the calendar and capacity', () => {
  const g = clone(finished);
  const seat = g.seats.find((c) => c.candidates.INC)!.id;
  assert.match(validateAction(g, act(g, { constituency: seat, issue: 'jobs', speaker: 'leader' }))!, /campaign/);
  const h = fresh();
  const list: CampaignAction[] = [];
  for (let i = 0; i < 10; i++) list.push(act(h, { constituency: seat, issue: 'jobs', speaker: 'leader' }));
  const errs = list.map((a, i) => validateAction(h, a, list.slice(0, i)));
  assert.ok(errs.some((e) => e && /leader|team/.test(e)), 'leader days or team capacity must run out');
});

test('invalid targets and policy announcements in preparation are rejected', () => {
  const g = fresh();
  assert.ok(validateAction(g, act(g, { constituency: 'XX-99', issue: 'jobs' })));
  assert.ok(validateAction(g, act(g, { type: 'digital', state: 'ZZ', issue: 'jobs', budget: 5 })));
  assert.match(validateAction(g, act(g, { type: 'policy_announce', policy: 'apprentice' }))!, /preparation/);
});

test('rallies do not give a fixed bonus and can backfire', () => {
  const qualities = new Set<string>();
  let negative = 0;
  for (let i = 0; i < 60; i++) {
    const g = fresh();
    const seat = g.seats.filter((c) => c.candidates.INC)[i % 40];
    const o = resolveAction(g, act(g, { constituency: seat.id, issue: i % 2 ? 'identity' : 'jobs', speaker: i % 3 ? 'leader' : 'candidate' }), makeRng(100 + i));
    qualities.add(o.quality.toFixed(3));
    if ((g.seats.find((c) => c.id === seat.id)!.pending.INC ?? 0) < 0) negative++;
  }
  assert.ok(qualities.size > 30, 'rally outcomes should vary');
  assert.ok(negative > 0, 'some rallies should hurt');
});

test('repeat rallies in one seat hit diminishing returns', () => {
  const g = fresh();
  const seat = g.seats.find((c) => c.candidates.INC && (c.org.INC ?? 0) > 0.2)!;
  const gains: number[] = [];
  for (let i = 0; i < 5; i++) {
    const before = seat.pending.INC ?? 0;
    g.parties.INC.stats.funds = 500;
    resolveAction(g, act(g, { constituency: seat.id, issue: seat.localIssues[0], speaker: 'candidate' }), makeRng(7));
    gains.push((seat.pending.INC ?? 0) - before);
  }
  assert.ok(gains[4] < gains[0], `later rallies should do less (${gains.map((x) => x.toFixed(4)).join(', ')})`);
});

test('delayed organisation effects land in later turns', () => {
  let g = fresh();
  applyCommand(g, 'INC', { type: 'queue_action', action: act(g, { type: 'org_build', state: 'MP', budget: 30 }) });
  g = advanceTurn(g, {});
  assert.ok(g.delayed.some((d) => d.kind === 'org_growth' && d.party === 'INC'));
  const mp = () => g.seats.filter((c) => c.state === 'MP').reduce((a, c) => a + (c.org.INC ?? 0), 0);
  const after1 = mp();
  g = advanceTurn(g, {}); g = advanceTurn(g, {});
  assert.ok(mp() > after1, 'org should keep growing after the spend');
});

// --- dynamic simulation
test('different decisions produce different outcomes', () => {
  // compare expected shares going into polling day, before election-day noise
  const run = (heavy: boolean) => {
    let g = fresh();
    g.parties.INC.stats.funds = 2000;
    while (g.phase === 'campaign' && g.campaignTurn < g.config.campaignTurns) {
      if (heavy) {
        for (const c of g.seats.filter((x) => x.candidates.INC && x.state === 'RJ').slice(0, 5)) applyCommand(g, 'INC', { type: 'queue_action', action: act(g, { type: 'town_hall', constituency: c.id, issue: c.localIssues[0] }) });
        applyCommand(g, 'INC', { type: 'queue_action', action: act(g, { type: 'digital', state: 'RJ', issue: 'jobs', budget: 40 }) });
      }
      g = advanceTurn(g, {});
    }
    const rj = g.seats.filter((c) => c.state === 'RJ');
    return rj.reduce((a, c) => a + (seatExpectation(g, c).shares.INC ?? 0), 0) / rj.length;
  };
  const quiet = run(false), busy = run(true);
  assert.ok(busy > quiet + 0.003, `campaigning in Rajasthan should lift INC there (${quiet.toFixed(4)} -> ${busy.toFixed(4)})`);
  assert.ok(busy < quiet + 0.06, 'but not by an implausible amount');
});

test('the same action plays differently in different contexts', () => {
  const g = fresh();
  const strong = g.seats.filter((c) => c.candidates.INC).sort((a, b) => (b.org.INC ?? 0) - (a.org.INC ?? 0))[0];
  const weak = g.seats.filter((c) => c.candidates.INC).sort((a, b) => (a.org.INC ?? 0) - (b.org.INC ?? 0))[0];
  const o1 = resolveAction(g, act(g, { constituency: strong.id, issue: 'jobs', speaker: 'leader' }), makeRng(9));
  const o2 = resolveAction(g, act(g, { constituency: weak.id, issue: 'jobs', speaker: 'leader' }), makeRng(9));
  assert.ok((o1.attendance ?? 0) > (o2.attendance ?? 0), 'organisation should draw bigger crowds');
});

test('rivals react to the player’s public campaigning', () => {
  const visits = (playerActs: boolean, difficulty: 'normal' | 'hard') => {
    let g = createGame(cfg({ difficulty, seed: 77 }));
    const target = g.seats.filter((c) => c.candidates.INC && c.candidates.BJP).sort((a, b) => Math.abs((g.seatForecast[a.id]?.probs.INC ?? 0) - 0.5) - Math.abs((g.seatForecast[b.id]?.probs.INC ?? 0) - 0.5)).slice(0, 4);
    for (let t = 0; t < 4; t++) {
      if (playerActs) for (const c of target) applyCommand(g, 'INC', { type: 'queue_action', action: act(g, { type: 'town_hall', constituency: c.id, issue: 'jobs' }) });
      g = advanceTurn(g, {});
    }
    return target.reduce((a, c) => a + (g.seats.find((x) => x.id === c.id)!.visits.BJP ?? 0), 0);
  };
  assert.ok(visits(true, 'hard') >= visits(false, 'hard'), 'BJP should not ignore seats where the player campaigns');
});

test('alliances have benefits and costs', () => {
  const g = fresh();
  const india = g.alliances.find((a) => a.id === 'INDIA')!;
  const seat = g.seats.find((c) => india.seatAlloc[c.id] && buildSeatModel(g, c).ghosts.length > 0)!;
  const m = buildSeatModel(g, seat);
  const ghost = m.ghosts[0];
  const contester = india.seatAlloc[seat.id];
  assert.ok(ghost.transfer > 0.25 && ghost.transfer < 0.95, 'partner votes transfer only partly');
  const before = evaluateSeat(g, m).shares[contester];
  const g2 = clone(g); g2.alliances.find((a) => a.id === 'INDIA')!.trust = 0.05;
  const after = evaluateSeat(g2, buildSeatModel(g2, g2.seats.find((c) => c.id === seat.id)!)).shares[contester];
  assert.ok(after < before, 'low trust should leak more of the partner vote');
});

test('candidate quality affects the constituency outcome', () => {
  const g = fresh();
  const c = g.seats.find((x) => x.candidates.INC && x.candidates.BJP)!;
  const before = seatExpectation(g, c).shares.INC;
  Object.assign(c.candidates.INC, { localRep: 0.95, communication: 0.95, organisation: 0.95, ethics: 0.95, admin: 0.95 });
  const better = seatExpectation(g, c).shares.INC;
  Object.assign(c.candidates.INC, { localRep: 0.1, communication: 0.1, organisation: 0.1, ethics: 0.1, admin: 0.1 });
  const worse = seatExpectation(g, c).shares.INC;
  assert.ok(better > before && before > worse);
});

test('turnout and persuasion are separate levers', () => {
  const g = fresh();
  const c = g.seats.find((x) => x.candidates.INC && x.candidates.BJP)!;
  const base0 = seatExpectation(g, c);
  c.mobilisation.INC = 0.08;
  const mob = seatExpectation(g, c);
  c.mobilisation.INC = 0; c.persuasion.INC = 0.08;
  const per = seatExpectation(g, c);
  assert.ok(mob.turnout > base0.turnout, 'mobilisation raises turnout');
  assert.ok(Math.abs(per.turnout - base0.turnout) < Math.abs(mob.turnout - base0.turnout), 'persuasion barely moves turnout');
  assert.ok(per.shares.INC > base0.shares.INC, 'persuasion raises share');
});

test('crisis decisions can schedule delayed consequences', () => {
  let g = fresh();
  let found = false;
  for (let i = 0; i < 6 && !found; i++) {
    const ev = g.events.find((e) => e.party === 'INC' && !e.resolved && e.template === 'candidate_controversy');
    if (ev) { applyCommand(g, 'INC', { type: 'respond_event', eventId: ev.id, option: 'investigate' }); found = g.delayed.some((d) => d.kind === 'inquiry_result'); break; }
    g.config.eventFrequency = 3;
    g = advanceTurn(g, {});
  }
  if (!found) {
    // force one to test the mechanism itself
    g.events.push({ id: 'e1', template: 'candidate_controversy', turn: g.turn, party: 'INC', title: 't', body: 'b', severity: 0.5, visibility: 'public', params: { seat: g.seats.find((c) => c.candidates.INC)!.id, cand: 'x', evidence: 0.8, docs: 1, what: 'x' }, options: [{ id: 'investigate', label: 'i', detail: '', risk: '' }], deadline: g.turn });
    applyCommand(g, 'INC', { type: 'respond_event', eventId: 'e1', option: 'investigate' });
  }
  assert.ok(g.delayed.some((d) => d.kind === 'inquiry_result'));
});

test('the simulation does not force predetermined winners', () => {
  const winners = new Set<string>();
  for (const seed of [1, 2, 3, 4]) {
    const r = playOut(createGame(cfg({ seed }))).results[0];
    winners.add(Object.entries(r.partySeats).map(([p, n]) => `${p}${n}`).sort().join());
  }
  assert.equal(winners.size, 4, 'different seeds must produce different seat tallies');
});

test('same seed and same inputs replay identically', () => {
  const a = playOut(createGame(cfg({ seed: 99 }))).results[0].partySeats;
  const b = playOut(createGame(cfg({ seed: 99 }))).results[0].partySeats;
  assert.deepEqual(a, b);
});

test('government formation produces a government with confidence', () => {
  const g = clone(finished);
  const rng = makeRng(5);
  while (g.phase === 'formation') advanceFormation(g, rng);
  assert.ok(g.government);
  const support = [g.government!.pmParty, ...g.government!.partners].reduce((a, p) => a + (g.results[0].partySeats[p] ?? 0), 0);
  assert.ok(support > 0 && support <= 543);
  assert.ok(support >= MAJORITY || g.government!.stability <= 0.3, 'minority governments must be marked fragile');
});

// --- shadow politics
test('buying a defector costs money and moves their personal vote', () => {
  const g = fresh();
  g.parties.INC.stats.funds = 500;
  const c = g.seats.find((x) => x.candidates.INC && x.candidates.BJP && (x.base.BJP ?? 0) > 0.3)!;
  c.candidates.BJP.loyalty = 0.05; g.parties.BJP.stats.cohesion = 0.2; // an easy target
  const q = poachQuote(g, 'INC', c.id, 'BJP')!;
  const before = { funds: g.parties.INC.stats.funds, inc: c.base.INC, bjp: c.base.BJP };
  const text = attemptPoach(g, 'INC', c.id, 'BJP', 2, makeRng(1));
  assert.ok(g.parties.INC.stats.funds < before.funds, text);
  assert.ok(g.parties.INC.stats.shadowExposure > 0);
  if (text.includes('crossed over')) {
    assert.equal(c.candidates.INC.name, q.name);
    assert.ok(c.base.BJP < before.bjp && c.base.INC > before.inc);
  }
});

test('backdoor funds add cash and hidden exposure; exposure can be caught', () => {
  let g = fresh();
  const f0 = g.parties.INC.stats.funds;
  takeBackdoorFunds(g, 'INC', 100, makeRng(1));
  assert.equal(g.parties.INC.stats.funds, f0 + 100);
  assert.ok(g.parties.INC.stats.shadowExposure > 0.5);
  g.parties.INC.stats.shadowExposure = 1;
  const trust0 = g.parties.INC.stats.trust;
  let caught = false;
  for (let i = 0; i < 5 && !caught; i++) { g.parties.INC.stats.shadowExposure = Math.max(g.parties.INC.stats.shadowExposure, 0.95); g = advanceTurn(g, {}); caught = g.memory.some((m) => m.party === 'INC' && m.kind === 'finance'); }
  assert.ok(caught, 'very high exposure should be discovered within a few weeks');
  assert.ok(g.parties.INC.stats.trust < trust0);
});

// --- commands
test('players cannot act for parties they do not control', () => {
  const g = fresh();
  const r = applyCommand(g, 'BJP', { type: 'backdoor', amount: 50 });
  assert.equal(r.ok, false);
});

test('a queued action names the commanding party, whatever the client sent', () => {
  const g = fresh();
  const seat = g.seats.find((c) => c.candidates.INC)!.id;
  applyCommand(g, 'INC', { type: 'queue_action', action: { ...act(g, { type: 'town_hall', constituency: seat, issue: 'jobs' }), party: 'BJP' } });
  assert.equal(g.queued.INC?.[0].party, 'INC');
  assert.equal(g.queued.BJP, undefined);
});

test('duplicate action ids are refused', () => {
  const g = fresh();
  const seat = g.seats.find((c) => c.candidates.INC)!.id;
  const a = act(g, { type: 'town_hall', constituency: seat, issue: 'jobs' });
  assert.ok(applyCommand(g, 'INC', { type: 'queue_action', action: a }).ok);
  assert.equal(applyCommand(g, 'INC', { type: 'queue_action', action: a }).ok, false);
});

test('all action types are defined with costs', () => {
  for (const spec of Object.values(ACTIONS)) assert.ok(spec.baseCost >= 0 && spec.desc.length > 10);
});

test('custom parties pay for advantages', () => {
  const custom = { name: 'Test', short: 'TST', color: '#123456', color2: '#ffffff', symbol: 'star', ideology: { econ: 0, social: 0, federal: 0.5, welfare: 0.5 }, homeState: 'MH', leaderName: 'X', leaderStyle: 'technocratic' as const, structure: 'centralised' as const, recruitment: 'cadre' as const, focusIssues: ['jobs' as const], startingFunds: 240, recognition: 0.6 };
  const g = createGame(cfg({ playerParty: 'CUSTOM', customParty: custom }));
  assert.ok(g.parties.CUSTOM.stats.funds < 240, 'overspending the launch budget is clawed back');
  assert.ok(g.seats.some((c) => c.candidates.CUSTOM), 'custom party contests its home state');
});
