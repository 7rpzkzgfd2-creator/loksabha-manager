// Candidate issue traits, state issue profiles and campaigner rosters. Everything here is
// generated once (at setup, or once on load for older saves) from seeded randomness and
// then stored in the game state, so traits never reroll when a screen is reopened.

import { clamp, hash, makeRng } from './rng.ts';
import type { Rng } from './rng.ts';
import type { Candidate, GameState, Issue, IssueTrait, Party, PartyLeader, StateRuntime } from './types.ts';
import type { StateDef } from './data/states.ts';
import { LEADER_BY_ID, leadersFor, symbolFor, SCENARIO_NAMES } from './data/politicians.ts';
import type { ScenarioId } from './data/politicians.ts';

export const ISSUE_LIST: Issue[] = ['economy', 'inflation', 'jobs', 'agriculture', 'welfare', 'security', 'corruption', 'infrastructure', 'identity', 'federalism', 'health_edu', 'environment'];

// Which issues each candidate type tends to be credible on (only a bias in the draw).
const PROFILE_LEAN: Record<Candidate['profile'], Partial<Record<Issue, number>>> = {
  local_notable: { agriculture: 1.5, infrastructure: 1.4, welfare: 1.3 },
  party_organiser: { welfare: 1.4, identity: 1.3 },
  firebrand: { identity: 1.8, security: 1.5, corruption: 1.3 },
  technocrat: { economy: 1.8, infrastructure: 1.6, health_edu: 1.5 },
  dynast: { welfare: 1.3, identity: 1.2 },
  turncoat: { infrastructure: 1.2 },
};

const COUNT_WEIGHTS = [3, 4, 3, 2, 1]; // 1..5 issues, most candidates have two or three

function pickCount(rng: Rng): number {
  return rng.weighted([1, 2, 3, 4, 5], (n) => COUNT_WEIGHTS[n - 1]);
}

// 1-5 strong and 1-5 weak issues, never overlapping, intensities that scale with quality.
export function generateTraits(rng: Rng, quality: number, profile: Candidate['profile'], prefer: Issue[] = [], avoid: Issue[] = [], real = false): { strong: IssueTrait[]; weak: IssueTrait[] } {
  const lean = PROFILE_LEAN[profile] ?? {};
  const pool = ISSUE_LIST.slice();
  const strong: IssueTrait[] = [];
  const weak: IssueTrait[] = [];
  const nS = pickCount(rng), nW = pickCount(rng);
  const take = (weightFn: (i: Issue) => number) => {
    const i = rng.weighted(pool, weightFn);
    pool.splice(pool.indexOf(i), 1);
    return i;
  };
  for (let n = 0; n < nS && pool.length; n++) {
    const i = take((x) => (lean[x] ?? 1) * (prefer.includes(x) ? 4 : 1) * (avoid.includes(x) ? 0.2 : 1));
    strong.push({ issue: i, level: round2(clamp(rng.normal(0.5 + (quality - 0.5) * 0.7, 0.18), 0.25, 1)) });
  }
  // real people never get corruption as a weakness: it could read as an allegation
  if (real && pool.includes('corruption')) pool.splice(pool.indexOf('corruption'), 1);
  for (let n = 0; n < nW && pool.length; n++) {
    const i = take((x) => (avoid.includes(x) ? 4 : 1) / (lean[x] ?? 1));
    weak.push({ issue: i, level: round2(clamp(rng.normal(0.5 - (quality - 0.5) * 0.7, 0.18), 0.25, 1)) });
  }
  return { strong, weak };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function traitLevel(k: Candidate | undefined, issue: Issue): number {
  if (!k) return 0;
  const s = k.strong?.find((t) => t.issue === issue)?.level ?? 0;
  const w = k.weak?.find((t) => t.issue === issue)?.level ?? 0;
  return s - w;
}

// Fill in traits for candidates from saves made before traits existed. Deterministic from
// the candidate id, so loading the same save twice gives the same traits.
export function ensureTraits(state: GameState) {
  for (const c of state.seats) {
    for (const k of Object.values(c.candidates)) {
      if (k.strong && k.weak) continue;
      const rng = makeRng(hash('traits:' + k.id));
      const q = (k.localRep + k.communication + k.admin) / 3;
      Object.assign(k, generateTraits(rng, q, k.profile));
    }
  }
}

// ---- state issue profiles -------------------------------------------------------------

// Starting importance of each issue in a state, built from the state's recorded emphases
// and coarse economic structure. A game estimate; it changes during play.
export function baseImportance(st: StateDef, national: Partial<Record<Issue, number>>): Record<Issue, number> {
  const out = {} as Record<Issue, number>;
  const h = makeRng(hash('imp:' + st.code));
  for (const i of ISSUE_LIST) {
    let v = 0.1 + (st.issues[i] ?? 0);
    if (i === 'agriculture') v += st.agri * 0.45;
    if (i === 'welfare') v += st.agri * 0.15 + (1 - st.income) * 0.2;
    if (i === 'inflation') v += st.agri * 0.1 + (1 - st.income) * 0.15;
    if (i === 'jobs') v += (1 - st.income) * 0.25 + st.urban * 0.1;
    if (i === 'infrastructure') v += st.urban * 0.3;
    if (i === 'economy') v += st.urban * 0.25 + st.income * 0.1;
    if (i === 'environment') v += st.urban * 0.12;
    if (i === 'corruption') v += st.urban * 0.08;
    if (i === 'health_edu') v += (1 - st.income) * 0.1 + st.income * 0.08;
    v += ((national[i] ?? 0.45) - 0.45) * 0.6;
    v += h.normal(0, 0.04);
    out[i] = round2(clamp(v, 0.05, 1.2));
  }
  return out;
}

export function rankIssues(st: StateRuntime): void {
  const sal = st.salience as Record<Issue, number>;
  const order = ISSUE_LIST.slice().sort((a, b) => (sal[b] ?? 0) - (sal[a] ?? 0));
  st.primary = order[0];
  const top = sal[order[0]] ?? 0.1;
  const sec = order.slice(1).filter((i) => (sal[i] ?? 0) >= top * 0.55);
  st.secondary = order.slice(1, 1 + Math.max(3, Math.min(5, sec.length)));
}

export function initStateIssues(st: StateRuntime, def: StateDef, national: Partial<Record<Issue, number>>, economy: number) {
  st.salience = baseImportance(def, national);
  const h = makeRng(hash('sent:' + def.code));
  const sent: Partial<Record<Issue, number>> = {};
  for (const i of ISSUE_LIST) {
    const econLinked = i === 'economy' || i === 'jobs' || i === 'inflation';
    sent[i] = round2(clamp((econLinked ? economy * 0.4 : 0) + h.normal(0, 0.15), -1, 1));
  }
  st.sentiment = sent;
  st.sentiment0 = { ...sent };
  st.cred = {};
  st.campSat = {};
  st.spendLog = {};
  rankIssues(st);
}

// Satisfaction with how issues are handled, weighted by importance, relative to the start
// (the starting baseline already includes the starting mood). Feeds the governing parties.
export function sentimentShift(st: StateRuntime): number {
  if (!st.sentiment || !st.sentiment0) return 0;
  let s = 0, w = 0;
  for (const i of ISSUE_LIST) {
    const imp = st.salience[i] ?? 0.1;
    s += imp * ((st.sentiment[i] ?? 0) - (st.sentiment0[i] ?? 0));
    w += imp;
  }
  return w ? s / w : 0;
}

// ---- campaigners and branding ---------------------------------------------------------

export function buildLeaders(p: Party, scenario: string): PartyLeader[] {
  const defs = leadersFor(scenario, p.id);
  if (defs.length) {
    return defs.map((d) => ({
      id: d.id, name: d.name, role: d.role[scenario as ScenarioId] ?? '', home: d.home, reach: d.reach,
      recognition: d.recognition, homePop: d.homePop, awayPop: d.awayPop, effect: d.effect,
      strong: d.strong, weak: d.weak, days: d.days, real: true, visits: {},
    }));
  }
  if (p.id === 'OTH') return [];
  const strong = (Object.entries(p.issueOwn) as [Issue, number][]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([i]) => i);
  const weak = (Object.entries(p.issueOwn) as [Issue, number][]).sort((a, b) => a[1] - b[1]).slice(0, 1).map(([i]) => i);
  return [{
    id: `${p.id}-leader`, name: p.leader, role: 'Party leader (fictional)', home: p.homeStates[0] ?? 'DL', reach: p.national ? 'national' : 'regional',
    recognition: clamp(p.stats.leaderPop + 0.1), homePop: p.stats.leaderPop, awayPop: p.stats.leaderPop * (p.national ? 0.8 : 0.3), effect: p.stats.campaignSkill,
    strong, weak, days: 2, real: false, visits: {},
  }];
}

export function applyBranding(p: Party, scenario: string) {
  const sym = symbolFor(p.id, scenario);
  if (sym) p.displaySymbol = sym;
  const nm = SCENARIO_NAMES[p.id]?.[scenario as ScenarioId];
  if (nm) { p.name = nm.name; p.short = nm.short; }
  const face = leadersFor(scenario, p.id)[0];
  if (face) p.leader = face.name;
}

// Older saves: add whatever the new systems need without touching existing numbers.
export function migrateState(state: GameState, defs: Record<string, StateDef>) {
  ensureTraits(state);
  for (const p of Object.values(state.parties)) {
    if (!p.leaders && !p.custom) { applyBranding(p, state.config.scenarioId); p.leaders = buildLeaders(p, state.config.scenarioId); }
    if (!p.leaders) p.leaders = buildLeaders(p, state.config.scenarioId);
    p.stateBudget ??= {};
    p.stateSpent ??= {};
    for (const l of p.leaders) if (l.real) l.weak = l.weak.filter((i) => i !== 'corruption');
  }
  for (const c of state.seats) for (const k of Object.values(c.candidates)) if (k.real && k.weak) {
    k.weak = k.weak.filter((t) => t.issue !== 'corruption');
    if (!k.weak.length) k.weak = [{ issue: k.strong?.some((t) => t.issue === 'environment') ? 'security' : 'environment', level: 0.3 }];
  }
  for (const st of Object.values(state.states)) {
    if (st.sentiment) continue;
    const def = defs[st.code];
    if (!def) continue;
    // keep the existing salience numbers so saved projections do not jump
    const h = makeRng(hash('sent:' + def.code));
    const sent: Partial<Record<Issue, number>> = {};
    for (const i of ISSUE_LIST) sent[i] = round2(clamp(h.normal(0, 0.15), -1, 1));
    st.sentiment = sent; st.sentiment0 = { ...sent }; st.cred = {}; st.campSat = {}; st.spendLog = {};
    for (const i of ISSUE_LIST) st.salience[i] ??= 0.05;
    rankIssues(st);
  }
}

export { LEADER_BY_ID };
