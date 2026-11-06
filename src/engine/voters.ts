// The voter model. Each constituency is a mix of segments. For every segment we compute
// a utility for every party on the ballot, turn utilities into preference shares with a
// softmax, then multiply by a separate turnout propensity per party's supporters. That
// keeps persuasion (preferences) and mobilisation (turnout) as distinct levers.
//
// Utility = historical baseline (log share + calibration offset)
//         + issue fit relative to segment priorities
//         + national leadership effect (scaled by how presidential the campaign is)
//         + candidate appeal
//         + state mood + air war + local campaign persuasion
//         + party national popularity stock
//         + incumbency (local visibility) and anti-incumbency for the governing party
// Alliance partners who stand down are kept as "ghosts": their supporters partly
// transfer, partly abstain and partly drift elsewhere, depending on alliance trust and
// ideological distance. Strategic desertion of hopeless third parties is applied last.

import { SEGMENT_BY_ID, POLICY_BY_ID } from './data/catalog.ts';
import { clamp } from './rng.ts';
import type { Rng } from './rng.ts';
import type { Constituency, GameState, Issue, Party, SegmentId, SeatResult } from './types.ts';
import { sentimentShift } from './traits.ts';

export const K_FIT = 0.9;
export const K_LEADER = 0.7;
export const K_CAND = 0.55;
export const K_CAND_ISSUE = 0.3; // candidate's personal credibility on what this seat's voters care about
export const K_SENTIMENT = 0.35; // change in issue satisfaction, for the governing parties

export function ideoDistance(a: Party, b: Party): number {
  const i = a.ideology, j = b.ideology;
  return Math.sqrt((i.econ - j.econ) ** 2 + (i.social - j.social) ** 2 * 1.3 + (i.federal - j.federal) ** 2 * 0.6) / 2.2;
}

export function candidateAppeal(c: Constituency, party: string): number {
  const k = c.candidates[party];
  if (!k) return 0.5;
  let a = 0.35 * k.localRep + 0.25 * k.communication + 0.15 * k.organisation + 0.15 * k.ethics + 0.1 * k.admin;
  if (k.incumbent) a += (k.admin - 0.5) * 0.15; // a record cuts both ways
  return clamp(a);
}

export function salienceFor(state: GameState, c: Constituency, seg: SegmentId, issue: Issue): number {
  const sd = SEGMENT_BY_ID[seg];
  const base = sd.salience[issue] ?? 0.05;
  const nat = state.salience[issue] ?? 0.5;
  const st = state.states[c.state].salience[issue] ?? 0;
  const local = c.localIssues.includes(issue) ? 0.35 : 0;
  return base * (0.4 + nat) + st * 0.5 + local;
}

// How well a party's credibility on issues and its manifesto fit what a segment cares about.
export function issueFit(state: GameState, c: Constituency, seg: SegmentId, p: Party): number {
  const sd = SEGMENT_BY_ID[seg];
  let fit = 0, tot = 0;
  const cred = state.states[c.state].cred?.[p.id];
  for (const issue of Object.keys(p.issueOwn) as Issue[]) {
    const w = salienceFor(state, c, seg, issue);
    fit += w * (p.issueOwn[issue] + (cred?.[issue] ?? 0) - 0.5);
    tot += w;
  }
  fit = tot > 0 ? fit / tot : 0;
  // manifesto promises only move people in proportion to how believable they are
  let pol = 0;
  for (const id of p.manifesto.policies) {
    const def = POLICY_BY_ID[id];
    if (def) pol += (def.appeal[seg] ?? 0) * 0.06;
  }
  pol *= 0.3 + 0.7 * p.manifesto.credibility;
  const ideo = -0.12 * Math.abs(sd.econPref - p.ideology.econ) + 0.12 * (sd.welfarePref - 0.5) * (p.ideology.welfare - 0.5) * 2;
  return fit + pol + ideo;
}

// Static part used for calibration at setup.
export function structuralUtility(state: GameState, c: Constituency, seg: SegmentId, p: Party): number {
  const sd = SEGMENT_BY_ID[seg];
  return Math.log(Math.max(c.base[p.id] ?? 0.004, 0.004))
    + K_FIT * issueFit(state, c, seg, p)
    + K_LEADER * (p.stats.leaderPop - 0.5) * p.stats.leaderCentrality * sd.leaderSens;
}

// How well a candidate's own strong and weak issues match what this segment in this seat
// cares about. Separate from the party's credibility: a candidate strong on jobs helps
// most where jobs matter and barely at all where they do not.
export function candidateIssueFit(state: GameState, c: Constituency, seg: SegmentId, party: string): number {
  const k = c.candidates[party];
  if (!k || (!k.strong?.length && !k.weak?.length)) return 0;
  let fit = 0, tot = 0;
  for (const t of k.strong ?? []) fit += t.level * salienceFor(state, c, seg, t.issue);
  for (const t of k.weak ?? []) fit -= t.level * salienceFor(state, c, seg, t.issue);
  for (const i of Object.keys(state.salience) as Issue[]) tot += salienceFor(state, c, seg, i);
  return tot > 0 ? clamp(fit / tot * 2, -0.4, 0.4) : 0;
}

// Difficulty and home-state pull for human parties. A new party needs a real foothold at
// home or it can never break through first-past-the-post, whatever the player does.
const DIFF_EDGE = { easy: 0.16, normal: 0.05, hard: 0 } as const;
export function playerEdge(state: GameState, c: Constituency, p: Party): number {
  if (p.controlledBy !== 'human') return 0;
  let e = DIFF_EDGE[state.config.difficulty] ?? 0;
  if (p.custom && p.homeStates.includes(c.state)) e += 0.1;
  return e;
}

export function dynamicUtility(state: GameState, c: Constituency, seg: SegmentId, p: Party): number {
  const sd = SEGMENT_BY_ID[seg];
  const st = state.states[c.state];
  let u = p.stats.popularity;
  u += K_CAND * (candidateAppeal(c, p.id) - 0.5);
  u += K_CAND_ISSUE * candidateIssueFit(state, c, seg, p.id);
  u += st.mood[p.id] ?? 0;
  u += (st.airwar[p.id] ?? 0) * sd.digital;
  u += (c.persuasion[p.id] ?? 0) * sd.ground;
  if (c.incumbent === p.id) u += 0.03;
  u += playerEdge(state, c, p);
  const gov = state.government;
  if (gov && (gov.pmParty === p.id || gov.partners.includes(p.id))) {
    const weight = gov.pmParty === p.id ? 1 : 0.5;
    u += weight * 0.5 * (gov.approval - 0.5);
    u += weight * K_SENTIMENT * sentimentShift(st);
  }
  return u;
}

export interface SeatModel {
  c: Constituency;
  parties: string[]; // on the ballot
  ghosts: { party: string; to: string; transfer: number }[];
  all: string[]; // parties + ghost parties (for softmax)
  U: number[][]; // [segment][all]
  T: number[][]; // [segment][parties] turnout propensity
  w: number[];
  strategicLoyalty: Record<string, number>;
}

export function contestants(c: Constituency): string[] {
  return Object.keys(c.candidates);
}

export function buildSeatModel(state: GameState, c: Constituency): SeatModel {
  const parties = contestants(c);
  const ghosts: SeatModel['ghosts'] = [];
  for (const a of state.alliances) {
    const contester = a.seatAlloc[c.id];
    if (!contester || !parties.includes(contester)) continue;
    for (const m of a.members) {
      if (m === contester || parties.includes(m)) continue;
      if ((c.base[m] ?? 0) < 0.01) continue;
      const pm = state.parties[m], pc = state.parties[contester];
      if (!pm || !pc) continue;
      const compat = 1 - ideoDistance(pm, pc);
      const resent = 1 - pm.stats.cohesion;
      const transfer = clamp(0.35 + 0.35 * a.trust + 0.3 * compat - 0.25 * resent, 0.25, 0.92);
      ghosts.push({ party: m, to: contester, transfer });
    }
  }
  const all = [...parties, ...ghosts.map((g) => g.party)];
  const U: number[][] = [], T: number[][] = [], w: number[] = [];
  const st = state.states[c.state];
  for (const sm of c.segments) {
    const row: number[] = [];
    for (const pid of all) {
      const p = state.parties[pid];
      row.push(structuralUtility(state, c, sm.id, p) + (c.offsets[pid]?.[sm.id] ?? 0) + dynamicUtility(state, c, sm.id, p));
    }
    U.push(row);
    const trow: number[] = [];
    const segT = SEGMENT_BY_ID[sm.id].turnout * (c.turnoutBase / 0.65);
    for (const pid of parties) {
      const p = state.parties[pid];
      trow.push(clamp(segT + p.stats.enthusiasm + (c.mobilisation[pid] ?? 0) + 0.08 * ((c.org[pid] ?? 0) - 0.4) - st.disaster * 0.06, 0.2, 0.95));
    }
    T.push(trow);
    w.push(sm.w);
  }
  const strategicLoyalty: Record<string, number> = {};
  for (const pid of parties) strategicLoyalty[pid] = state.parties[pid].stats.cohesion;
  return { c, parties, ghosts, all, U, T, w, strategicLoyalty };
}

export interface Shock { party: Record<string, number>; turnout: number }

// Evaluate a seat model into vote shares. `shock` adds correlated noise for simulations.
export function evaluateSeat(state: GameState, m: SeatModel, shock?: Shock, localNoise = 0, rng?: Rng): { shares: Record<string, number>; turnout: number } {
  const n = m.all.length, np = m.parties.length;
  const votes = new Array(np).fill(0);
  let abstainFromGhost = 0;
  const local = m.all.map((pid) => (shock?.party[pid] ?? 0) + (rng && localNoise ? rng.normal(0, localNoise) : 0));
  for (let s = 0; s < m.U.length; s++) {
    const row = m.U[s];
    let max = -Infinity;
    const ex = new Array(n);
    for (let i = 0; i < n; i++) { ex[i] = row[i] + local[i]; if (ex[i] > max) max = ex[i]; }
    let tot = 0;
    for (let i = 0; i < n; i++) { ex[i] = Math.exp(ex[i] - max); tot += ex[i]; }
    const pref = ex.map((e) => e / tot);
    // ghost transfers
    for (let g = 0; g < m.ghosts.length; g++) {
      const gi = np + g;
      const share = pref[gi];
      const to = m.parties.indexOf(m.ghosts[g].to);
      const tr = m.ghosts[g].transfer;
      const rest = share * (1 - tr);
      abstainFromGhost += rest * 0.5 * m.w[s];
      let others = 0;
      for (let i = 0; i < np; i++) if (i !== to) others += pref[i];
      for (let i = 0; i < np; i++) if (i !== to && others > 0) pref[i] += rest * 0.5 * (pref[i] / others);
      pref[to] += share * tr;
      pref[gi] = 0;
    }
    for (let i = 0; i < np; i++) {
      const t = clamp(m.T[s][i] + (shock?.turnout ?? 0));
      votes[i] += m.w[s] * pref[i] * t;
    }
  }
  // rebels: a denied aspirant running as an independent takes a slice from the official candidate
  const c = m.c;
  if (c.rebel > 0 && c.rebelFrom) {
    const fi = m.parties.indexOf(c.rebelFrom);
    const oi = m.parties.indexOf('OTH');
    if (fi >= 0 && oi >= 0) {
      const moved = votes[fi] * c.rebel;
      votes[fi] -= moved; votes[oi] += moved;
    }
  }
  let total = votes.reduce((a, b) => a + b, 0);
  const turnout = total; // fraction of electorate (ghost abstention already excluded)
  void abstainFromGhost;
  // strategic voting: supporters of a hopeless candidate partly move to the closer of the top two
  const order = votes.map((v, i) => i).sort((a, b) => votes[b] - votes[a]);
  if (order.length > 2) {
    const L = order[0], S = order[1];
    for (const i of order.slice(2)) {
      if (votes[i] / total < 0.15 && votes[i] < 0.55 * votes[S]) {
        const pid = m.parties[i];
        if (pid === 'OTH') continue;
        const loyal = m.strategicLoyalty[pid] ?? 0.5;
        const moved = votes[i] * 0.16 * (1 - loyal);
        const p = state.parties[pid];
        const dl = ideoDistance(p, state.parties[m.parties[L]]);
        const ds = ideoDistance(p, state.parties[m.parties[S]]);
        votes[i] -= moved;
        votes[dl < ds ? L : S] += moved;
      }
    }
  }
  total = votes.reduce((a, b) => a + b, 0);
  const shares: Record<string, number> = {};
  m.parties.forEach((pid, i) => { shares[pid] = votes[i] / total; });
  return { shares, turnout };
}

export function seatExpectation(state: GameState, c: Constituency) {
  return evaluateSeat(state, buildSeatModel(state, c));
}

export function toSeatResult(state: GameState, c: Constituency, shares: Record<string, number>, turnout: number, rng: Rng): SeatResult {
  const ranked = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  let tieBroken = false;
  // exact ties are resolved by drawing lots, as under Section 65 of the RP Act 1951
  if (ranked.length > 1 && Math.abs(ranked[0][1] - ranked[1][1]) < 1e-9) {
    tieBroken = true;
    if (rng.chance(0.5)) [ranked[0], ranked[1]] = [ranked[1], ranked[0]];
  }
  const polled = Math.round(c.electors * turnout);
  const votes: Record<string, number> = {};
  for (const [p, sh] of ranked) votes[p] = Math.max(0, Math.round(polled * sh));
  const winner = ranked[0][0];
  return {
    shares, votes, turnout,
    winner,
    runnerUp: ranked[1]?.[0] ?? '',
    margin: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : ranked[0][1],
    winnerCandidate: c.candidates[winner]?.name ?? 'Independent',
    lostDeposits: ranked.filter(([p, sh]) => sh < 1 / 6 && p !== 'OTH').map(([p]) => p),
    tieBroken,
  };
}

// One-off calibration so that at t0 the segment mix reproduces each seat's baseline.
export function calibrateSeat(state: GameState, c: Constituency) {
  // include parties that stood down for an ally so their "ghost" voters are calibrated too
  const parties = Object.keys(c.base).filter((p) => state.parties[p] && (c.candidates[p] || (c.base[p] ?? 0) >= 0.012));
  c.offsets = {};
  for (const pid of parties) c.offsets[pid] = {} as Record<SegmentId, number>;
  for (const pid of parties) for (const sm of c.segments) c.offsets[pid][sm.id] = 0;
  const targetTot = parties.reduce((a, p) => a + (c.base[p] ?? 0.004), 0);
  for (let iter = 0; iter < 6; iter++) {
    const agg: Record<string, number> = {};
    for (const pid of parties) agg[pid] = 0;
    for (const sm of c.segments) {
      const us = parties.map((pid) => structuralUtility(state, c, sm.id, state.parties[pid]) + c.offsets[pid][sm.id]);
      const mx = Math.max(...us);
      const ex = us.map((u) => Math.exp(u - mx));
      const tot = ex.reduce((a, b) => a + b, 0);
      parties.forEach((pid, i) => { agg[pid] += sm.w * ex[i] / tot; });
    }
    for (const pid of parties) {
      const target = (c.base[pid] ?? 0.004) / targetTot;
      const adj = Math.log(Math.max(target, 1e-4) / Math.max(agg[pid], 1e-4));
      for (const sm of c.segments) c.offsets[pid][sm.id] += adj;
    }
  }
}
