// Vote-share tracking. Each week we take a noise-free reading of every seat's expected
// vote share (using the same public polling bias everyone sees), compare it with last
// week's, and tell each human party how its numbers moved where it campaigned.

import type { ActionOutcome, GameState } from './types.ts';
import { buildSeatModel, evaluateSeat } from './voters.ts';
import { STATE_BY_CODE } from './setup.ts';

export type ShareTable = Record<string, Record<string, number>>; // seat id -> party -> share

export function seatShares(state: GameState): ShareTable {
  const out: ShareTable = {};
  for (const c of state.seats) {
    const m = buildSeatModel(state, c);
    const party: Record<string, number> = {};
    for (const p of m.all) party[p] = state.pollBias[p] ?? 0;
    const ev = evaluateSeat(state, m, { party, turnout: 0 });
    const row: Record<string, number> = {};
    for (const [p, v] of Object.entries(ev.shares)) row[p] = Math.round(v * 10000) / 10000;
    out[c.id] = row;
  }
  return out;
}

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const pp = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1) + ' pts';

// Writes one "vote share report" per human party. Returns the mails' bodies for tests.
export function shareReports(state: GameState, before: ShareTable, after: ShareTable, outcomes: ActionOutcome[], send: (party: string, subject: string, body: string) => void) {
  for (const pid of state.partyOrder) {
    const p = state.parties[pid];
    if (p.controlledBy !== 'human') continue;
    const mine = outcomes.filter((o) => o.party === pid);
    const seatIds = new Set<string>();
    const statesHit = new Set<string>();
    for (const o of mine) {
      if (o.constituency) seatIds.add(o.constituency);
      else if (o.state) statesHit.add(o.state);
    }
    const rows: { id: string; name: string; st: string; b: number; a: number; d: number }[] = [];
    for (const c of state.seats) {
      if (!c.candidates[pid]) continue;
      const b = before[c.id]?.[pid] ?? 0, a = after[c.id]?.[pid] ?? 0;
      rows.push({ id: c.id, name: c.name, st: c.state, b, a, d: a - b });
    }
    if (!rows.length) continue;
    const lines: string[] = [];
    const total = rows.reduce((t, r) => t + r.d, 0) / rows.length;
    lines.push(`Average change across the ${rows.length} seats you contest: ${pp(total)}.`);
    const direct = rows.filter((r) => seatIds.has(r.id)).sort((x, y) => y.d - x.d);
    if (direct.length) {
      lines.push('', 'Seats where you campaigned this week:');
      for (const r of direct) lines.push(`• ${r.name} (${STATE_BY_CODE[r.st]?.name ?? r.st}): ${pct(r.b)} → ${pct(r.a)} (${pp(r.d)})`);
    }
    for (const st of statesHit) {
      const inSt = rows.filter((r) => r.st === st);
      if (!inSt.length) continue;
      const avg = inSt.reduce((t, r) => t + r.d, 0) / inSt.length;
      const up = inSt.filter((r) => r.d > 0.0005).length;
      lines.push('', `${STATE_BY_CODE[st]?.name ?? st} (state-wide work): average ${pp(avg)} across ${inSt.length} seats, up in ${up}.`);
    }
    const sorted = rows.slice().sort((x, y) => y.d - x.d);
    const gains = sorted.filter((r) => r.d > 0.0005).slice(0, 5);
    const losses = sorted.filter((r) => r.d < -0.0005).slice(-5).reverse();
    if (gains.length) { lines.push('', 'Biggest gains anywhere:'); for (const r of gains) lines.push(`• ${r.name}: ${pct(r.a)} (${pp(r.d)})`); }
    if (losses.length) { lines.push('', 'Biggest falls anywhere:'); for (const r of losses) lines.push(`• ${r.name}: ${pct(r.a)} (${pp(r.d)})`); }
    lines.push('', 'Rival campaigns and news also move these numbers, not only your own events. Open "Vote share tracker" for every seat.');
    send(pid, `Vote share report: ${pp(total)} on average`, lines.join('\n'));
  }
}
