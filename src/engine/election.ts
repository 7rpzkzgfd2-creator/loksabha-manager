// Polling day, counting and the autopsy.

import { seatFactors } from './statecampaign.ts';
import { STATE_BY_CODE, MAJORITY } from './setup.ts';
import { clamp } from './rng.ts';
import type { Rng } from './rng.ts';
import type { AutopsyItem, ElectionResult, GameState, SeatResult } from './types.ts';
import { buildSeatModel, evaluateSeat, toSeatResult } from './voters.ts';

export function runPolling(state: GameState, rng: Rng) {
  const final: Record<string, SeatResult> = {};
  const nat: Record<string, number> = {};
  // late swing: momentum carries into polling day, plus genuine uncertainty
  for (const p of state.partyOrder) nat[p] = rng.normal(0, 0.06) + state.parties[p].stats.momentum * 0.04;
  const stShock: Record<string, Record<string, number>> = {};
  const seatRounds: Record<string, number> = {};
  for (const c of state.seats) {
    if (!stShock[c.state]) { stShock[c.state] = {}; for (const p of state.partyOrder) stShock[c.state][p] = rng.normal(0, 0.05); }
    const m = buildSeatModel(state, c);
    const shock = { party: {} as Record<string, number>, turnout: rng.normal(0, 0.02) };
    for (const p of m.all) shock.party[p] = nat[p] + stShock[c.state][p] + rng.normal(0, 0.08);
    const ev = evaluateSeat(state, m, shock);
    final[c.id] = toSeatResult(state, c, ev.shares, ev.turnout, rng);
    seatRounds[c.id] = rng.int(12, 24);
  }
  state.counting = { round: 0, totalRounds: 24, seatRounds, final };
  state.phase = 'counting';
}

// What the counting screen shows after `round` rounds. Early rounds are noisy because
// booths are counted in batches that are not representative.
export function countingView(state: GameState, round: number) {
  const ct = state.counting!;
  const seats: Record<string, { leader: string; shares: Record<string, number>; declared: boolean; progress: number; margin: number }> = {};
  const leads: Record<string, number> = {}, won: Record<string, number> = {};
  for (const c of state.seats) {
    const fin = ct.final[c.id];
    const need = ct.seatRounds[c.id];
    const progress = clamp(round / need);
    const declared = progress >= 1;
    let shares: Record<string, number>;
    if (declared) shares = fin.shares;
    else {
      shares = {};
      const h = (c.id.charCodeAt(0) * 31 + c.id.charCodeAt(3) * 17 + round * 13) % 97;
      let tot = 0;
      for (const [p, v] of Object.entries(fin.shares)) {
        const wobble = Math.sin(h * 0.37 + p.length * 1.7 + p.charCodeAt(0)) * 0.12 * (1 - progress);
        shares[p] = Math.max(0, v * (1 + wobble)); tot += shares[p];
      }
      for (const p of Object.keys(shares)) shares[p] /= tot;
    }
    const ranked = Object.entries(shares).sort((a, b) => b[1] - a[1]);
    const leader = progress === 0 ? '' : ranked[0][0];
    seats[c.id] = { leader, shares, declared, progress, margin: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : 1 };
    if (!leader) continue;
    if (declared) won[leader] = (won[leader] ?? 0) + 1;
    else leads[leader] = (leads[leader] ?? 0) + 1;
  }
  return { seats, leads, won, round };
}

export function finaliseElection(state: GameState): ElectionResult {
  const ct = state.counting!;
  const partySeats: Record<string, number> = {};
  const partyVotes: Record<string, number> = {};
  let totalVotes = 0, electors = 0, polled = 0;
  for (const c of state.seats) {
    const r = ct.final[c.id];
    partySeats[r.winner] = (partySeats[r.winner] ?? 0) + 1;
    for (const [p, v] of Object.entries(r.votes)) { partyVotes[p] = (partyVotes[p] ?? 0) + v; totalVotes += v; }
    electors += c.electors; polled += c.electors * r.turnout;
  }
  const voteShare: Record<string, number> = {};
  for (const [p, v] of Object.entries(partyVotes)) voteShare[p] = v / totalVotes;
  const blocSeats: Record<string, number> = {};
  for (const a of state.alliances) blocSeats[a.id] = a.members.reduce((t, m) => t + (partySeats[m] ?? 0), 0);
  const last = state.polls[state.polls.length - 1];
  const forecastAtPoll: Record<string, number> = {};
  for (const p of state.partyOrder) forecastAtPoll[p] = last?.seats[p]?.[1] ?? 0;
  const res: ElectionResult = {
    cycle: state.cycle, year: state.year, seats: ct.final, partySeats, partyVotes, voteShare,
    turnout: polled / electors, blocSeats, forecastAtPoll, autopsy: [],
  };
  res.autopsy = autopsy(state, res, state.playerParty);
  return res;
}

export function autopsy(state: GameState, res: ElectionResult, pid: string): AutopsyItem[] {
  const out: AutopsyItem[] = [];
  const p = state.parties[pid];
  const seats = res.partySeats[pid] ?? 0;
  const vs = res.voteShare[pid] ?? 0;
  const ss = seats / 543;
  out.push({ party: pid, heading: `${seats} seats on ${(vs * 100).toFixed(1)}% of the vote`, detail: ss > vs * 1.15 ? `Your vote was efficient: a ${(ss * 100).toFixed(1)}% seat share from ${(vs * 100).toFixed(1)}% of votes. Concentrated support in winnable seats paid off under first-past-the-post.` : ss < vs * 0.8 ? `Your vote was inefficient: ${(vs * 100).toFixed(1)}% of votes became only ${(ss * 100).toFixed(1)}% of seats. Support was spread across seats you came second or third in.` : 'Seat share roughly tracked vote share.', confidence: 'strong' });
  const prevSeats = state.seats.filter((c) => c.prev?.winner === pid).length;
  const gained = state.seats.filter((c) => res.seats[c.id].winner === pid && c.prev?.winner !== pid);
  const lost = state.seats.filter((c) => res.seats[c.id].winner !== pid && c.prev?.winner === pid);
  out.push({ party: pid, heading: `${gained.length} gained, ${lost.length} lost`, detail: `Compared with the previous (simulated) contest, where you held ${prevSeats}. ${gained.slice(0, 4).map((c) => c.name).join(', ')}${gained.length > 4 ? '…' : ''}${lost.length ? ` Lost: ${lost.slice(0, 4).map((c) => c.name).join(', ')}${lost.length > 4 ? '…' : ''}` : ''}`, confidence: 'strong' });
  const fc = res.forecastAtPoll[pid] ?? 0;
  if (Math.abs(fc - seats) > 8) out.push({ party: pid, heading: `Forecast ${fc > seats ? 'overestimated' : 'underestimated'} you by ${Math.abs(fc - seats)} seats`, detail: `Our final projection had ${fc}. Part of that is late swing and polling error (we only partly corrected our polling bias${state.parties[pid].staff.some((s) => s.role === 'data_analyst') ? '' : ', and we had no data analyst'}).`, confidence: 'plausible' });
  // state picture
  const byState: Record<string, { won: number; total: number }> = {};
  for (const c of state.seats) {
    if (!c.candidates[pid]) continue;
    const b = byState[c.state] ?? (byState[c.state] = { won: 0, total: 0 });
    b.total++; if (res.seats[c.id].winner === pid) b.won++;
  }
  const ranked = Object.entries(byState).filter(([, v]) => v.total >= 3).sort((a, b) => b[1].won / b[1].total - a[1].won / a[1].total);
  if (ranked.length) out.push({ party: pid, heading: `Best: ${STATE_BY_CODE[ranked[0][0]].name}. Worst: ${STATE_BY_CODE[ranked[ranked.length - 1][0]].name}`, detail: `Won ${ranked[0][1].won} of ${ranked[0][1].total} in ${STATE_BY_CODE[ranked[0][0]].name}; ${ranked[ranked.length - 1][1].won} of ${ranked[ranked.length - 1][1].total} in ${STATE_BY_CODE[ranked[ranked.length - 1][0]].name}.`, confidence: 'strong' });
  // spend allocation
  let spendClose = 0, spendSafe = 0, spendHopeless = 0, spendAll = 0;
  for (const c of state.seats) {
    const sp = c.spend[pid] ?? 0;
    if (!sp) continue;
    spendAll += sp;
    const r = res.seats[c.id];
    const mine = r.shares[pid] ?? 0;
    const best = Math.max(...Object.entries(r.shares).filter(([k]) => k !== pid).map(([, v]) => v));
    if (Math.abs(mine - best) < 0.05) spendClose += sp; else if (mine - best > 0.12) spendSafe += sp; else if (best - mine > 0.15) spendHopeless += sp;
  }
  if (spendAll > 0) out.push({ party: pid, heading: `${Math.round(spendClose / spendAll * 100)}% of local spending went to seats decided by under 5 points`, detail: `${Math.round(spendSafe / spendAll * 100)}% went to seats you won comfortably and ${Math.round(spendHopeless / spendAll * 100)}% to seats you lost badly. Safe-seat spending can still lift turnout and morale, so this is not automatically waste.`, confidence: 'plausible' });
  // rebels
  const rebelLosses = state.seats.filter((c) => c.rebelFrom === pid && res.seats[c.id].winner !== pid && res.seats[c.id].runnerUp === pid && res.seats[c.id].margin < c.rebel * (res.seats[c.id].shares[pid] ?? 0) * 1.5);
  if (rebelLosses.length) out.push({ party: pid, heading: `Rebels may have cost you ${rebelLosses.length} seat${rebelLosses.length > 1 ? 's' : ''}`, detail: `In ${rebelLosses.map((c) => c.name).join(', ')}, a rebel independent took more votes than the margin of defeat.`, confidence: 'plausible' });
  // close calls
  const close = state.seats.filter((c) => res.seats[c.id].margin < 0.02 && (res.seats[c.id].winner === pid || res.seats[c.id].runnerUp === pid));
  if (close.length) out.push({ party: pid, heading: `${close.length} seats decided by under 2 points`, detail: `Won ${close.filter((c) => res.seats[c.id].winner === pid).length}, lost ${close.filter((c) => res.seats[c.id].winner !== pid).length}. At these margins, a single rally, candidate or turnout drive can plausibly have tipped the result either way.`, confidence: 'uncertain' });
  // alliance
  const a = state.alliances.find((x) => x.members.includes(pid));
  if (a) {
    const partnerSeats = a.members.filter((m) => m !== pid).reduce((t, m) => t + (res.partySeats[m] ?? 0), 0);
    out.push({ party: pid, heading: `Alliance partners won ${partnerSeats} seats`, detail: `The ${a.name} won ${res.blocSeats[a.id] ?? 0} in total. Transfers between partners were partial: some supporters of parties that stood down abstained or voted elsewhere, depending on alliance trust (${Math.round(a.trust * 100)}%).`, confidence: 'plausible' });
  }
  // defections
  const bought = state.shadow.filter((d) => d.party === pid && d.kind === 'poach' && d.success && d.turn >= state.turn - state.config.campaignTurns - 2);
  if (bought.length) {
    const wonBought = bought.filter((d) => d.seat && res.seats[d.seat]?.winner === pid).length;
    out.push({ party: pid, heading: `Defectors: ${wonBought} of ${bought.length} won`, detail: 'Candidates you brought over from rivals carried part of their personal vote with them.', confidence: 'plausible' });
  }
  if (state.memory.some((m) => m.party === pid && m.kind === 'finance' && m.cycle === state.cycle)) out.push({ party: pid, heading: 'The funding scandal hung over the campaign', detail: 'Exposure of off-the-books money cut trust and the leader’s standing. How many seats it cost cannot be separated cleanly from everything else.', confidence: 'uncertain' });
  if (p.stats.cohesion < 0.5) out.push({ party: pid, heading: 'A divided party', detail: `Cohesion was ${Math.round(p.stats.cohesion * 100)}% by polling day. Division weakens strategic loyalty: your supporters were likelier to desert you in seats where you looked out of contention.`, confidence: 'plausible' });
  // why the closest seats went the way they did, from the same factors the vote model used
  const keySeats = state.seats.filter((c) => c.candidates[pid] && (res.seats[c.id].winner === pid || res.seats[c.id].runnerUp === pid))
    .sort((x, y) => res.seats[x.id].margin - res.seats[y.id].margin).slice(0, 4);
  for (const c of keySeats) {
    const r = res.seats[c.id];
    const won = r.winner === pid;
    const rival = won ? r.runnerUp : r.winner;
    if (!rival) continue;
    const f = seatFactors(state, c, pid, rival).slice(0, 3);
    if (!f.length) continue;
    const why = f.map((x) => `${x.label.toLowerCase()} ${x.value > 0 ? 'helped us' : 'helped ' + state.parties[rival].short}`).join('; ');
    out.push({ party: pid, heading: `${won ? 'Held' : 'Lost'} ${c.name} by ${(r.margin * 100).toFixed(1)} points against ${state.parties[rival].short}`, detail: `Biggest modelled factors: ${why}.`, confidence: r.margin < 0.02 ? 'uncertain' : 'plausible' });
  }
  const maj = seats >= MAJORITY;
  out.unshift({ party: pid, heading: maj ? 'Outright majority' : seats >= 200 ? 'Largest-party territory, short of a majority' : seats >= 50 ? 'A significant parliamentary force' : seats > 0 ? 'A foothold in Parliament' : 'Shut out', detail: maj ? 'You can form a government on your own.' : 'Government formation will depend on negotiations.', confidence: 'strong' });
  return out;
}
