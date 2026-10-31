// Forecasting. Runs a Monte Carlo over the voter model with correlated national, state and
// local errors. Polls carry a hidden, persistent bias per party (state.pollBias) that a
// data analyst and research spending can shrink, so forecasts are informative but never
// an exact preview of the result.

import { makeRng } from './rng.ts';
import type { GameState, PollPoint, SeatForecast } from './types.ts';
import { buildSeatModel, evaluateSeat } from './voters.ts';

export function analystSkill(state: GameState, party: string): number {
  const p = state.parties[party];
  const a = p.staff.filter((s) => s.role === 'data_analyst').reduce((m, s) => Math.max(m, s.skill), 0);
  return a / 100;
}

let defaultSims = 90;
// Batch balancing runs use fewer simulations per forecast to save time.
export function setForecastSims(n: number) { defaultSims = n; }

export function computeForecast(state: GameState, turnsLeft: number, sims = defaultSims, viewer?: string): PollPoint {
  const rng = makeRng((state.rng ^ (state.turn * 7919)) >>> 0);
  const models = state.seats.map((c) => buildSeatModel(state, c));
  const partyIds = state.partyOrder;
  const biasScale = viewer ? 1 - 0.6 * analystSkill(state, viewer) : 1;
  const seatsDist: Record<string, number[]> = Object.fromEntries(partyIds.map((p) => [p, []]));
  const winCounts: Record<string, Record<string, number>> = {};
  const shareSums: Record<string, Record<string, number>> = {};
  const voteTot: Record<string, number> = Object.fromEntries(partyIds.map((p) => [p, 0]));
  let allVotes = 0;
  const natSd = 0.05 + 0.012 * turnsLeft;
  for (let s = 0; s < sims; s++) {
    const nat: Record<string, number> = {};
    for (const p of partyIds) nat[p] = rng.normal(0, natSd) + (state.pollBias[p] ?? 0) * biasScale;
    const stShock: Record<string, Record<string, number>> = {};
    const count: Record<string, number> = {};
    for (const m of models) {
      const st = m.c.state;
      if (!stShock[st]) { stShock[st] = {}; for (const p of partyIds) stShock[st][p] = rng.normal(0, 0.06); }
      const shock = { party: {} as Record<string, number>, turnout: rng.normal(0, 0.015) };
      for (const p of m.all) shock.party[p] = nat[p] + stShock[st][p] + rng.normal(0, 0.07);
      const ev = evaluateSeat(state, m, shock);
      let best = '', bv = -1;
      const ws = winCounts[m.c.id] ?? (winCounts[m.c.id] = {});
      const ss = shareSums[m.c.id] ?? (shareSums[m.c.id] = {});
      for (const [p, v] of Object.entries(ev.shares)) {
        if (v > bv) { bv = v; best = p; }
        ss[p] = (ss[p] ?? 0) + v;
        const votes = v * ev.turnout * m.c.electors;
        voteTot[p] += votes; allVotes += votes;
      }
      ws[best] = (ws[best] ?? 0) + 1;
      count[best] = (count[best] ?? 0) + 1;
    }
    for (const p of partyIds) seatsDist[p].push(count[p] ?? 0);
  }
  const q = (arr: number[], f: number) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };
  const seats: PollPoint['seats'] = {};
  for (const p of partyIds) seats[p] = [q(seatsDist[p], 0.1), q(seatsDist[p], 0.5), q(seatsDist[p], 0.9)];
  const shares: Record<string, number> = {};
  for (const p of partyIds) shares[p] = voteTot[p] / Math.max(allVotes, 1);
  const bloc: Record<string, number> = {};
  for (const a of state.alliances) bloc[a.id] = a.members.reduce((t, m) => t + (seats[m]?.[1] ?? 0), 0);

  const seatFc: Record<string, SeatForecast> = {};
  for (const c of state.seats) {
    const ws = winCounts[c.id] ?? {};
    const probs: Record<string, number> = {};
    let leader = '', lp = -1;
    for (const [p, n] of Object.entries(ws)) { probs[p] = n / sims; if (n > lp) { lp = n; leader = p; } }
    const sh: Record<string, number> = {};
    for (const [p, v] of Object.entries(shareSums[c.id] ?? {})) sh[p] = v / sims;
    const top = probs[leader] ?? 0;
    seatFc[c.id] = { id: c.id, leader, probs, shares: sh, rating: top > 0.92 ? 'safe' : top > 0.75 ? 'likely' : top > 0.6 ? 'lean' : 'tossup' };
  }
  state.seatForecast = seatFc;
  return { turn: state.turn, seats, shares, bloc };
}
