// Turn processing: the heart of the causal loop. A turn resolves every party's actions,
// lets the world react, applies delayed consequences, rolls new events and refreshes the
// forecast.

import { STATE_BY_CODE } from './setup.ts';
import { clamp, makeRng } from './rng.ts';
import type { Rng } from './rng.ts';
import type { CampaignAction, GameState } from './types.ts';
import { resolveAction, validateAction } from './actions.ts';
import { aiPickManifesto, manifestoCredibility, planAITurn } from './ai.ts';
import { computeForecast } from './forecast.ts';
import { rollEvents, settleEvents } from './events.ts';
import { aiShadowMoves, shadowScrutiny } from './shadow.ts';
import { aiDiplomacy } from './alliances.ts';
import { finaliseElection, runPolling } from './election.ts';
import { milestone, startFormation } from './coalition.ts';
import { payroll, recomputeCohesion, staffSkill } from './party.ts';
import { log, mail, remember, report } from './world.ts';
import { calibrateSeat } from './voters.ts';
import { makeCandidate } from './setup.ts';
import { allocateSeats } from './setup.ts';

export function clone<T>(x: T): T {
  return structuredClone(x);
}

function turnsLeft(state: GameState) {
  return Math.max(0, state.config.campaignTurns - state.campaignTurn);
}

export function stageFor(campaignTurn: number, total: number): GameState['stage'] {
  if (campaignTurn <= 2) return 'preparation';
  if (campaignTurn >= total - 1) return 'final_push';
  return 'campaign';
}

export function advanceTurn(prev: GameState, submitted: Record<string, CampaignAction[]> = {}): GameState {
  if (prev.phase !== 'campaign') return prev;
  const state = clone(prev);
  const rng = makeRng(state.rng);
  const summary: string[] = [];
  const player = state.playerParty;

  for (const p of Object.values(state.parties)) for (const s of p.staff) s.workload = 0;
  settleEvents(state, rng);

  // collect actions: humans' submitted lists are revalidated server-side; AIs plan now
  const all: CampaignAction[] = [];
  const rejected: string[] = [];
  for (const pid of state.partyOrder) {
    const p = state.parties[pid];
    let list: CampaignAction[] = [];
    if (p.controlledBy === 'human') {
      const incoming = submitted[pid] ?? state.queued[pid] ?? [];
      for (const a of incoming) {
        const fixed = { ...a, party: pid }; // never trust the party field from a client
        const err = validateAction(state, fixed, list);
        if (err) rejected.push(`${pid}: ${err}`); else list.push(fixed);
      }
    } else {
      if (state.campaignTurn === 1 && !p.manifesto.policies.length) aiPickManifesto(state, p, rng);
      list = planAITurn(state, pid, rng);
      aiShadowMoves(state, pid, rng);
    }
    all.push(...list);
  }
  if (rejected.length) log(state, `Rejected actions: ${rejected.join('; ')}`);
  // interleave so nobody systematically moves first
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  const outcomes = all.map((a) => resolveAction(state, a, rng));
  state.outcomes.push(...outcomes);
  if (state.outcomes.length > 3000) state.outcomes.splice(0, state.outcomes.length - 3000);
  state.queued = {};

  aiDiplomacy(state, rng);
  worldDynamics(state, rng);
  applyDelayed(state, rng);
  shadowScrutiny(state, rng);

  // lock preparation-stage decisions
  if (state.campaignTurn === 2) {
    for (const p of Object.values(state.parties)) {
      if (!p.manifesto.policies.length && p.controlledBy === 'ai') aiPickManifesto(state, p, rng);
      p.manifesto.locked = true;
      p.manifesto.credibility = manifestoCredibility(state, p);
      for (const pol of p.manifesto.policies) remember(state, rng, { kind: 'promise', party: p.id, text: `Manifesto promise: ${pol}.`, weight: 0.3 });
    }
    summary.push('Tickets, manifestos and alliances are now locked.');
  }

  const oldMedian = state.polls[state.polls.length - 1]?.seats[player]?.[1] ?? 0;
  state.turn++;
  state.campaignTurn++;

  if (state.campaignTurn > state.config.campaignTurns) {
    runPolling(state, rng);
    summary.unshift('Polling day. The country has voted; counting begins.');
    state.rng = rng.state();
    state.turnSummary = summary;
    return state;
  }
  state.stage = stageFor(state.campaignTurn, state.config.campaignTurns);
  rollEvents(state, rng);
  state.rng = rng.state();
  const poll = computeForecast(state, turnsLeft(state));
  // the public poll is everyone's shared, imperfect view
  state.polls.push(poll);
  for (const pid of state.partyOrder) {
    const p = state.parties[pid];
    const prevMedian = state.polls[state.polls.length - 2]?.seats[pid]?.[1] ?? 0;
    const delta = (poll.seats[pid]?.[1] ?? 0) - prevMedian;
    p.stats.momentum = clamp(p.stats.momentum * 0.6 + clamp(delta / Math.max(8, prevMedian * 0.15), -1, 1) * 0.4, -1, 1);
    p.stats.enthusiasm = clamp(p.stats.momentum * 0.03 + (p.stats.volunteerMorale - 0.6) * 0.04, -0.06, 0.06);
  }

  const mine = outcomes.filter((o) => o.party === player);
  const newMedian = poll.seats[player]?.[1] ?? 0;
  summary.unshift(`Projection: ${newMedian} seats (${poll.seats[player][0]}–${poll.seats[player][2]}), ${newMedian >= oldMedian ? 'up' : 'down'} ${Math.abs(newMedian - oldMedian)} on last week.`);
  if (mine.length) {
    const best = mine.slice().sort((a, b) => b.quality - a.quality)[0];
    const worst = mine.slice().sort((a, b) => a.quality - b.quality)[0];
    summary.push(`${mine.length} campaign events run. Best: ${best.type.replace('_', ' ')} in ${best.where}. Weakest: ${worst.type.replace('_', ' ')} in ${worst.where}.`);
    mail(state, rng, { party: player, from: 'Campaign manager', subject: `Week ${state.campaignTurn - 1} report`, importance: 'normal', kind: 'report', body: mine.map((o) => `• ${o.where} (${o.type.replace('_', ' ')}, ₹${o.cost} cr): ${o.reported}${o.notes.length ? ' ' + o.notes.join(' ') : ''}`).join('\n') });
  }
  const rivalsMoved = Object.values(state.parties).filter((p) => p.id !== player && p.controlledBy === 'ai').sort((a, b) => b.stats.momentum - a.stats.momentum)[0];
  if (rivalsMoved && rivalsMoved.stats.momentum > 0.15) summary.push(`${rivalsMoved.short} has momentum this week.`);
  const fresh = state.events.filter((e) => e.turn === state.turn && e.party === player);
  if (fresh.length) summary.push(`${fresh.length} new development${fresh.length > 1 ? 's need' : ' needs'} your decision.`);
  if (state.stage === 'final_push') summary.push('Final push: late events move votes, and there is little time left to recover from mistakes.');
  state.turnSummary = summary;
  return state;
}

function worldDynamics(state: GameState, rng: Rng) {
  for (const c of state.seats) {
    for (const pid of Object.keys(c.pending)) {
      c.persuasion[pid] = (c.persuasion[pid] ?? 0) + c.pending[pid];
    }
    c.pending = {};
    for (const pid of Object.keys(c.persuasion)) c.persuasion[pid] *= 0.9;
    for (const pid of Object.keys(c.mobilisation)) c.mobilisation[pid] *= 0.85;
    for (const pid of Object.keys(c.saturation)) c.saturation[pid] *= 0.7;
  }
  for (const st of Object.values(state.states)) {
    for (const pid of Object.keys(st.airwar)) st.airwar[pid] *= 0.85;
    for (const pid of Object.keys(st.mood)) st.mood[pid] *= 0.93;
    st.disaster *= 0.5;
  }
  state.economy = clamp(state.economy + rng.normal(0, 0.04), -1, 1);
  for (const k of Object.keys(state.salience) as (keyof typeof state.salience)[]) state.salience[k] = state.salience[k] * 0.96 + 0.45 * 0.04;
  if (state.government) state.government.approval = clamp(state.government.approval + state.economy * 0.01 + rng.normal(0, 0.005));
  for (const p of Object.values(state.parties)) {
    if (p.id === 'OTH') continue;
    p.stats.popularity *= 0.97;
    const fin = staffSkill(p, 'finance');
    const income = p.stats.income * (1 + p.stats.momentum * 0.3 + p.stats.media * 0.2 + fin * 0.4);
    p.stats.funds = Math.round((p.stats.funds + income - payroll(p)) * 100) / 100;
    if (p.stats.funds < 0 && p.controlledBy === 'human') mail(state, rng, { party: p.id, from: 'Treasurer', subject: 'We are in debt', importance: 'critical', kind: 'warning', body: `The war chest is at ₹${p.stats.funds} crore. Staff will start leaving and creditors will talk to the press.` });
    if (p.stats.funds < 0) { p.stats.volunteerMorale = clamp(p.stats.volunteerMorale - 0.04); p.stats.trust = clamp(p.stats.trust - 0.01); }
    p.stats.leaderPop = clamp(p.stats.leaderPop + p.stats.momentum * 0.01 + (p.stats.trust - 0.5) * 0.004);
    for (const f of p.factions) f.satisfaction = clamp(f.satisfaction + p.stats.momentum * 0.02 + (0.6 - f.satisfaction) * 0.03);
    recomputeCohesion(p);
    // staff morale and departures
    for (const s of [...p.staff]) {
      s.experience += 0.25;
      if (s.workload > 7) s.morale = clamp(s.morale - 0.06);
      else s.morale = clamp(s.morale + 0.02);
      if (p.stats.funds < 0) s.morale = clamp(s.morale - 0.08);
      if (s.morale < 0.3 && rng.chance(s.trait === 'ambitious' ? 0.5 : 0.25)) {
        p.staff = p.staff.filter((x) => x !== s);
        mail(state, rng, { party: p.id, from: s.name, subject: 'Resignation', importance: 'high', kind: 'warning', body: `${s.name} has resigned. "I can't keep working like this." Morale had been low for weeks.` });
      }
    }
  }
  for (const a of state.alliances) {
    const members = a.members.map((m) => state.parties[m]);
    const avgRel = members.length > 1 ? members.reduce((t, m) => t + members.reduce((u, n) => u + (m === n ? 0 : (state.relations[m.id]?.[n.id] ?? 0)), 0), 0) / (members.length * (members.length - 1)) : 0;
    a.trust = clamp(a.trust + (avgRel - 0.2) * 0.02);
  }
}

function applyDelayed(state: GameState, rng: Rng) {
  const due = state.delayed.filter((d) => d.dueTurn <= state.turn);
  state.delayed = state.delayed.filter((d) => d.dueTurn > state.turn);
  for (const d of due) {
    const p = state.parties[d.party];
    if (!p) continue;
    if (d.kind === 'org_growth') {
      for (const c of state.seats) if (c.state === d.params.state) c.org[p.id] = clamp((c.org[p.id] ?? 0) + Number(d.params.amount) * 0.3);
    } else if (d.kind === 'scandal_escalation') {
      const c = state.seats.find((x) => x.id === d.params.seat);
      if (c) state.states[c.state].mood[p.id] = (state.states[c.state].mood[p.id] ?? 0) - Number(d.params.amount);
      p.stats.trust = clamp(p.stats.trust - 0.02);
      mail(state, rng, { party: p.id, from: 'Media cell', subject: d.note, importance: 'high', kind: 'warning', body: 'The story we defended has new details today. It is now a state-level issue.' });
    } else if (d.kind === 'inquiry_result') {
      const c = state.seats.find((x) => x.id === d.params.seat);
      const ev = Number(d.params.evidence);
      if (c && c.candidates[p.id]) {
        if (ev > 0.55) {
          const k = c.candidates[p.id];
          c.candidates[p.id] = makeCandidate(rng, p, c.state, p.stats.candidateQuality - 0.08);
          p.stats.trust = clamp(p.stats.trust + 0.01);
          mail(state, rng, { party: p.id, from: 'Disciplinary committee', subject: d.note, importance: 'high', kind: 'report', body: `The inquiry found substance in the allegations. ${k.name} has been replaced by ${c.candidates[p.id].name}.` });
        } else {
          c.candidates[p.id].localRep = clamp(c.candidates[p.id].localRep + 0.05);
          mail(state, rng, { party: p.id, from: 'Disciplinary committee', subject: d.note, importance: 'normal', kind: 'report', body: 'The inquiry cleared our candidate. They come out of it stronger.' });
        }
      }
    } else if (d.kind === 'defection_wave') {
      const n = Number(d.params.n);
      const seats = state.seats.filter((c) => c.candidates[p.id] && c.candidates[p.id].faction === d.params.faction).slice(0, n);
      const rival = Object.values(state.parties).filter((x) => x.id !== p.id && x.id !== 'OTH').sort((a, b) => b.stats.momentum - a.stats.momentum)[0];
      for (const c of seats) {
        const k = c.candidates[p.id];
        c.candidates[p.id] = makeCandidate(rng, p, c.state, p.stats.candidateQuality - 0.1);
        c.base[p.id] = Math.max(0.004, (c.base[p.id] ?? 0) - k.localRep * 0.03);
        c.base[rival.id] = (c.base[rival.id] ?? 0.004) + k.localRep * 0.02;
        calibrateSeat(state, c);
      }
      if (seats.length) {
        remember(state, rng, { kind: 'faction', party: p.id, other: rival.id, text: `${seats.length} leaders defected to ${rival.short} after suspensions.`, weight: 0.6 });
        report(state, rng, { headline: `${seats.length} ${p.short} leaders cross over to ${rival.short}`, fact: `${seats.length} ${p.short} leaders joined ${rival.short}.`, parties: [p.id, rival.id], tone: -0.5 });
      }
    } else if (d.kind === 'relief_goodwill') {
      state.states[String(d.params.state)].mood[p.id] = (state.states[String(d.params.state)].mood[p.id] ?? 0) + Number(d.params.amount);
      mail(state, rng, { party: p.id, from: 'State unit', subject: d.note, importance: 'normal', kind: 'report', body: 'Families helped in the relief camps are talking about us.' });
    } else if (d.kind === 'ec_notice') {
      p.stats.trust = clamp(p.stats.trust - Number(d.params.amount));
      mail(state, rng, { party: p.id, from: 'Legal cell', subject: d.note, importance: 'high', kind: 'warning', body: 'The Election Commission has issued a formal notice on our spending. It is in the papers.' });
    } else if (d.kind === 'alliance_exit_risk') {
      const a = state.alliances.find((x) => x.id === d.params.alliance);
      if (a && a.trust < 0.35 && rng.chance(0.5) && state.stage === 'preparation') {
        a.members = a.members.filter((m) => m !== p.id);
        for (const [cid, who] of Object.entries(a.seatAlloc)) if (who === p.id) delete a.seatAlloc[cid];
        remember(state, rng, { kind: 'alliance_broken', party: a.leader, other: p.id, text: `${p.short} walked out of the ${a.name}.`, weight: 0.7 });
        report(state, rng, { headline: `${p.short} walks out of the ${a.name}`, fact: `${p.name} left the ${a.name}.`, parties: [p.id, a.leader], tone: -0.2 });
        for (const c of state.seats) if ((c.base[p.id] ?? 0) >= 0.012 && !c.candidates[p.id]) { c.candidates[p.id] = makeCandidate(rng, p, c.state, p.stats.candidateQuality); calibrateSeat(state, c); }
      }
    }
  }
}

// --- counting & post-election ---

export function stepCounting(prev: GameState, rounds = 1): GameState {
  if (prev.phase !== 'counting' || !prev.counting) return prev;
  const state = clone(prev);
  state.counting!.round = Math.min(state.counting!.totalRounds, state.counting!.round + rounds);
  return state;
}

export function completeCounting(prev: GameState): GameState {
  if (prev.phase !== 'counting' || !prev.counting) return prev;
  const state = clone(prev);
  const rng = makeRng(state.rng);
  state.counting!.round = state.counting!.totalRounds;
  const res = finaliseElection(state);
  state.results.push(res);
  const pl = state.playerParty;
  if ((res.partySeats[pl] ?? 0) > 0) milestone(state, 'first_seat', 'Won a Lok Sabha seat');
  if ((res.partySeats[pl] ?? 0) >= 50) milestone(state, 'major', 'Became a major parliamentary party');
  for (const [p, n] of Object.entries(res.partySeats)) remember(state, rng, { kind: 'result', party: p, text: `Won ${n} seats in ${state.year}.`, weight: 0.4 });
  const top = Object.entries(res.partySeats).sort((a, b) => b[1] - a[1])[0];
  report(state, rng, { headline: `${state.parties[top[0]].short} emerges as single largest party with ${top[1]} seats`, fact: `Results declared for all 543 constituencies.`, parties: [top[0]], tone: 0.4 });
  startFormation(state);
  state.rng = rng.state();
  return state;
}

// Start the next election cycle after five governance years.
export function beginNextCycle(prev: GameState): GameState {
  const state = clone(prev);
  const rng = makeRng(state.rng);
  const res = state.results[state.results.length - 1];
  state.cycle++;
  state.phase = 'campaign';
  state.stage = 'preparation';
  state.campaignTurn = 1;
  state.counting = null;
  state.events = state.events.filter((e) => !e.resolved).slice(-10);
  for (const c of state.seats) {
    const r = res.seats[c.id];
    c.prev = r;
    c.incumbent = r.winner;
    const nb: Record<string, number> = {};
    let tot = 0;
    for (const p of new Set([...Object.keys(c.base), ...Object.keys(r.shares)])) {
      // the new baseline leans on the last result but remembers deeper loyalties
      const v = 0.55 * (r.shares[p] ?? 0) + 0.45 * (c.base[p] ?? 0);
      nb[p] = Math.max(v, 0.002); tot += nb[p];
    }
    for (const p of Object.keys(nb)) nb[p] /= tot;
    c.base = nb;
    c.persuasion = {}; c.pending = {}; c.mobilisation = {}; c.saturation = {}; c.spend = {}; c.visits = {};
    c.rebel = 0; c.rebelFrom = undefined;
    const keep = c.candidates[r.winner];
    c.candidates = {};
    for (const pid of Object.keys(c.base)) {
      const p = state.parties[pid];
      if (!p) continue;
      if (pid === 'OTH' || c.base[pid] >= 0.012) c.candidates[pid] = pid === r.winner && keep && rng.chance(0.75) ? { ...keep, incumbent: true, age: keep.age + 5 } : makeCandidate(rng, p, c.state, p.stats.candidateQuality);
    }
  }
  for (const a of state.alliances) allocateSeats(state, a);
  for (const c of state.seats) calibrateSeat(state, c);
  for (const p of Object.values(state.parties)) {
    p.stats.momentum = 0; p.stats.enthusiasm = 0; p.stats.popularity *= 0.5;
    p.manifesto = { policies: p.manifesto.policies.slice(), credibility: p.manifesto.credibility, locked: false, announcedTurn: {} };
    if (p.controlledBy === 'ai') p.manifesto.policies = [];
    state.pollBias[p.id] = p.id === 'OTH' ? 0 : rng.normal(0, 0.07);
  }
  // a beaten leader may face a challenge
  const pl = state.parties[state.playerParty];
  const lastTwo = state.career.slice(-1)[0];
  if (lastTwo && !lastTwo.inGovernment && pl.stats.cohesion < 0.6) {
    pl.stats.leaderPop = clamp(pl.stats.leaderPop - 0.04);
    for (const f of pl.factions) if (f.outlook === 'reformist') f.satisfaction = clamp(f.satisfaction - 0.1);
    recomputeCohesion(pl);
    mail(state, rng, { party: pl.id, from: 'Party secretariat', subject: 'Murmurs of a leadership challenge', importance: 'critical', kind: 'warning', body: `After the last result, the ${pl.factions.find((f) => f.outlook === 'reformist')?.name ?? 'reformers'} are openly questioning ${pl.leader}'s leadership. Keep them on side or expect trouble.` });
  }
  state.turnSummary = [`A new campaign begins: ${state.year}. You start ${state.government?.pmParty === state.playerParty ? 'as the governing party, with a record to defend' : 'in opposition'}.`];
  state.rng = rng.state();
  state.polls.push(computeForecast(state, state.config.campaignTurns));
  void STATE_BY_CODE;
  return state;
}
