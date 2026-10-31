// Balance batch for state-level campaigning. Plays a scripted INC through 2024 with
// different state strategies over many seeds and writes docs/STATE_BALANCE.md.
// Run: node scripts/statebalance.ts [runsPerStrategy]

import { writeFileSync } from 'node:fs';
import {
  createGame, advanceTurn, completeCounting, applyCommand, clone, stateIntel, aspirants, candidateFit, candidateAppeal, newActionId,
} from '../src/engine/index.ts';
import type { GameState, Issue, ScenarioConfig, StateCampaignMode } from '../src/engine/index.ts';
import { makeRng } from '../src/engine/rng.ts';

const RUNS = Number(process.argv[2] ?? 10);
const ME = 'INC';
type Strat = { name: string; desc: string; setup?: (g: GameState) => void; cfg?: Partial<ScenarioConfig>; week: (g: GameState, rng: ReturnType<typeof makeRng>) => void };

const queue = (g: GameState, a: Record<string, unknown>, rng: ReturnType<typeof makeRng>) =>
  applyCommand(g, ME, { type: 'queue_action', action: { id: newActionId(rng), party: ME, ...a } as never });

function topIssue(g: GameState, code: string): Issue { return g.states[code].primary ?? 'jobs'; }

function spendAllocated(g: GameState, rng: ReturnType<typeof makeRng>, opts: { mode?: StateCampaignMode; prio?: boolean; issue?: (code: string) => Issue } = {}) {
  const p = g.parties[ME];
  const weeksLeft = Math.max(1, g.config.campaignTurns - g.campaignTurn + 1);
  const intel = stateIntel(g, ME);
  for (const [code, alloc] of Object.entries(p.stateBudget ?? {})) {
    const left = alloc - (p.stateSpent?.[code] ?? 0);
    const b = Math.min(60, Math.max(2, Math.round(left / weeksLeft)));
    if (left < 2) continue;
    const mode = opts.mode ?? (g.stage === 'preparation' ? 'offices' : g.stage === 'final_push' ? 'ground' : 'rallies');
    const s = intel.find((x) => x.code === code)!;
    queue(g, { type: 'state_campaign', state: code, mode, issue: opts.issue ? opts.issue(code) : topIssue(g, code), budget: Math.min(b, left), seats: opts.prio ? s.competitive.slice(0, 3) : undefined }, rng);
  }
}

function toursTo(g: GameState, rng: ReturnType<typeof makeRng>, pick: (home: string) => string | undefined) {
  for (const l of g.parties[ME].leaders ?? []) for (let d = 0; d < l.days; d++) {
    const code = pick(l.home);
    if (code) queue(g, { type: 'leader_tour', state: code, leaderId: l.id, issue: l.strong[0], tour: 'statewide' }, rng);
  }
}

function pickCandidates(g: GameState, by: 'fit' | 'popularity') {
  for (const c of g.seats) {
    const k = c.candidates[ME];
    if (!k || k.real || k.incumbent) continue;
    const opts = aspirants(g, c.id, ME).map((a, i) => ({ i, v: by === 'fit' ? candidateFit(g, c, a).seatFit : candidateAppeal({ ...c, candidates: { ...c.candidates, [ME]: a } }, ME) }));
    const cur = by === 'fit' ? candidateFit(g, c, k).seatFit : candidateAppeal(c, ME);
    const best = opts.sort((a, b) => b.v - a.v)[0];
    if (best && best.v > cur) applyCommand(g, ME, { type: 'pick_candidate', seat: c.id, index: best.i });
  }
}

const alloc = (strategy: 'competitive' | 'even' | 'defend' | 'focus', frac = 0.85) => (g: GameState) => {
  if (g.campaignTurn === 1) applyCommand(g, ME, { type: 'auto_allocate', total: g.parties[ME].stats.funds * frac, strategy });
};
const homeTours = (g: GameState, rng: ReturnType<typeof makeRng>) => toursTo(g, rng, (home) => (g.seats.some((c) => c.state === home && c.candidates[ME]) ? home : stateIntel(g, ME).sort((a, b) => b.perTen - a.perTen)[0]?.code));

const STRATS: Strat[] = [
  { name: 'Idle', desc: 'No campaigning at all (baseline).', week: () => {} },
  { name: 'One state', desc: 'Whole budget into the three best states.', week: (g, r) => { alloc('focus')(g); spendAllocated(g, r); homeTours(g, r); } },
  { name: 'Spread nationally', desc: 'Budget split by seats contested.', week: (g, r) => { alloc('even')(g); spendAllocated(g, r); homeTours(g, r); } },
  { name: 'Competitive seats', desc: 'Budget where seats are close, priority seats picked.', week: (g, r) => { alloc('competitive')(g); spendAllocated(g, r, { prio: true }); homeTours(g, r); } },
  { name: 'Issue-fit tickets', desc: 'Competitive plan plus candidates picked for seat fit.', week: (g, r) => { if (g.campaignTurn === 1) pickCandidates(g, 'fit'); alloc('competitive')(g); spendAllocated(g, r, { prio: true }); homeTours(g, r); } },
  { name: 'Popular tickets', desc: 'Competitive plan plus candidates picked for personal appeal only.', week: (g, r) => { if (g.campaignTurn === 1) pickCandidates(g, 'popularity'); alloc('competitive')(g); spendAllocated(g, r, { prio: true }); homeTours(g, r); } },
  { name: 'Strong tickets, weak brand', desc: 'Issue-fit tickets but national popularity −0.25.', setup: (g) => { g.parties[ME].stats.popularity -= 0.25; }, week: (g, r) => { if (g.campaignTurn === 1) pickCandidates(g, 'fit'); alloc('competitive')(g); spendAllocated(g, r, { prio: true }); } },
  { name: 'Weak tickets, strong brand', desc: 'Candidates degraded, popularity +0.25.', setup: (g) => { g.parties[ME].stats.popularity += 0.25; for (const c of g.seats) { const k = c.candidates[ME]; if (k && !k.real) { k.localRep *= 0.6; k.communication *= 0.6; } } }, week: (g, r) => { alloc('competitive')(g); spendAllocated(g, r, { prio: true }); } },
  { name: 'Limited budget', desc: 'Competitive plan with 30% of the money.', setup: (g) => { g.parties[ME].stats.funds *= 0.3; g.parties[ME].stats.income *= 0.3; }, week: (g, r) => { alloc('competitive')(g); spendAllocated(g, r, { prio: true }); homeTours(g, r); } },
  { name: 'Hard opposition', desc: 'Competitive plan on Hard difficulty.', cfg: { difficulty: 'hard' }, week: (g, r) => { alloc('competitive')(g); spendAllocated(g, r, { prio: true }); homeTours(g, r); } },
  { name: 'Leaders misplaced', desc: 'Competitive plan, every leader sent to the weakest state.', week: (g, r) => { alloc('competitive')(g); spendAllocated(g, r, { prio: true }); toursTo(g, r, () => stateIntel(g, ME).filter((s) => s.contesting).sort((a, b) => a.perTen - b.perTen)[0]?.code); } },
  { name: 'Media only', desc: 'Competitive budget, statewide media only, off-message issue.', week: (g, r) => { alloc('competitive')(g); spendAllocated(g, r, { mode: 'media', issue: () => 'environment' }); homeTours(g, r); } },
];

const rows: { name: string; desc: string; seats: number[]; vote: number[] }[] = [];
const t0 = Date.now();
for (const s of STRATS) {
  const seats: number[] = [], vote: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    let g = createGame({ scenarioId: 'ls2024', mode: 'quick', difficulty: 'normal', playerParty: ME, seed: 1000 + i * 7919, campaignTurns: 6, eventFrequency: 1, ...s.cfg });
    s.setup?.(g);
    const rng = makeRng(42 + i);
    while (g.phase === 'campaign') { g = clone(g); s.week(g, rng); g = advanceTurn(g, {}); }
    g = completeCounting(g);
    seats.push(g.results[0].partySeats[ME] ?? 0);
    vote.push(g.results[0].voteShare[ME] ?? 0);
  }
  rows.push({ name: s.name, desc: s.desc, seats, vote });
  console.log(s.name.padEnd(28), (seats.reduce((a, b) => a + b, 0) / RUNS).toFixed(1));
}
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const sd = (x: number[]) => Math.sqrt(mean(x.map((v) => (v - mean(x)) ** 2)));
const idle = mean(rows[0].seats);
const md = [
  '# State campaign balance batch', '',
  `Scripted INC in the 2024 scenario, ${RUNS} seeds per strategy, 6-week campaigns, Normal difficulty unless stated. Generated by \`node scripts/statebalance.ts\` in ${Math.round((Date.now() - t0) / 1000)}s.`, '',
  '| Strategy | What it does | Mean seats | SD | Min–max | vs idle | Vote share |', '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.desc} | ${mean(r.seats).toFixed(1)} | ${sd(r.seats).toFixed(1)} | ${Math.min(...r.seats)}–${Math.max(...r.seats)} | ${(mean(r.seats) - idle >= 0 ? '+' : '')}${(mean(r.seats) - idle).toFixed(1)} | ${(mean(r.vote) * 100).toFixed(1)}% |`),
  '', 'Read the spread as well as the mean: no strategy wins every seed, and seed-to-seed swings come from events, polling day noise and rival AI choices.',
];
writeFileSync(new URL('../docs/STATE_BALANCE.md', import.meta.url), md.join('\n') + '\n');
console.log('wrote docs/STATE_BALANCE.md');
