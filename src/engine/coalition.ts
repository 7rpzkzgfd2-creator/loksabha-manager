// Government formation and governance between elections.

import { POLICY_BY_ID, ISSUE_NAME } from './data/catalog.ts';
import { MAJORITY } from './setup.ts';
import { clamp, uid } from './rng.ts';
import type { Rng } from './rng.ts';
import type { ElectionResult, GameState, Issue, Proposal } from './types.ts';
import { ideoDistance } from './voters.ts';
import { staffSkill } from './party.ts';
import { mail, relate, remember, report } from './world.ts';
import { aiQuality } from './ai.ts';

export function lastResult(state: GameState): ElectionResult | undefined {
  return state.results[state.results.length - 1];
}

export function startFormation(state: GameState) {
  const res = lastResult(state)!;
  const commitments: Record<string, string> = {};
  for (const a of state.alliances) for (const m of a.members) if ((res.partySeats[m] ?? 0) > 0) commitments[m] = a.leader;
  for (const p of state.partyOrder) if ((res.partySeats[p] ?? 0) > 0 && !commitments[p] && p !== 'OTH') commitments[p] = '';
  // a party standing alone leads its own potential bloc
  const biggest = Object.entries(res.partySeats).filter(([p]) => p !== 'OTH').sort((a, b) => b[1] - a[1]);
  for (const [p, n] of biggest.slice(0, 3)) if (!commitments[p] && n >= 30) commitments[p] = p;
  state.formation = { round: 1, maxRounds: 3, commitments, offers: [], log: [] };
  state.phase = 'formation';
  const top = biggest[0];
  if (top && top[1] >= MAJORITY) state.formation.log.push(`${state.parties[top[0]].short} has an outright majority with ${top[1]} seats.`);
}

export function blocTotals(state: GameState): Record<string, number> {
  const res = lastResult(state)!;
  const f = state.formation!;
  const t: Record<string, number> = {};
  for (const [p, leader] of Object.entries(f.commitments)) if (leader) t[leader] = (t[leader] ?? 0) + (res.partySeats[p] ?? 0);
  return t;
}

export function uncommitted(state: GameState): string[] {
  const res = lastResult(state)!;
  return Object.entries(state.formation!.commitments).filter(([p, l]) => !l && (res.partySeats[p] ?? 0) > 0).map(([p]) => p);
}

// How attractive an offer is to a party deciding whom to back.
export function offerValue(state: GameState, prop: Proposal): { v: number; why: string[] } {
  const to = state.parties[prop.to], from = state.parties[prop.from];
  const why: string[] = [];
  const blocs = blocTotals(state);
  const res = lastResult(state)!;
  const theirs = res.partySeats[prop.to] ?? 0;
  const after = (blocs[prop.from] ?? 0) + theirs;
  const dist = ideoDistance(to, from);
  let v = (1 - dist) * 0.7 - 0.35;
  if (dist > 0.6) { v -= (dist - 0.6) * 3; why.push('Our voters would never forgive this partnership.'); }
  v += (state.relations[prop.to]?.[prop.from] ?? 0) * 0.4;
  v += Math.min(prop.ministries, 6) * 0.06 * (1 - dist);
  if (prop.concession) { v += (to.issueOwn[prop.concession] - 0.4) * 0.6; why.push(`A commitment on ${ISSUE_NAME[prop.concession].toLowerCase()}.`); }
  if (prop.pmPost) { v += 0.9; why.push('The prime ministership itself.'); }
  if (after >= MAJORITY) { v += 0.35; why.push('This would get the bloc past 272.'); } else if (after >= MAJORITY - 25) v += 0.1;
  const broken = state.memory.filter((m) => m.party === prop.from && m.kind === 'promise_broken').length;
  const grudges = state.memory.filter((m) => m.party === prop.to && m.other === prop.from && (m.kind === 'alliance_broken' || m.kind === 'controversy')).reduce((a, m) => a + m.weight, 0);
  v -= broken * 0.05 + grudges * 0.3;
  if (grudges) why.push('Old wounds between us.');
  v += staffSkill(from, 'negotiator') * 0.15;
  // a kingmaker with leverage asks for more
  const short = MAJORITY - (blocs[prop.from] ?? 0);
  if (theirs >= short && short > 0) v -= 0.1 * aiQuality(state.config.difficulty);
  return { v, why };
}

export function makeCoalitionOffer(state: GameState, from: string, to: string, ministries: number, concession: Issue | undefined, pmPost: boolean, rng: Rng): string {
  const f = state.formation;
  if (!f || state.phase !== 'formation') return 'No government formation is under way.';
  if (f.commitments[to]) return `${state.parties[to].short} is already committed.`;
  if (!uncommitted(state).includes(to)) return 'They hold no seats.';
  if (f.offers.some((o) => o.from === from && o.to === to && o.turn === f.round)) return 'One offer per party per round.';
  if (ministries < 0 || ministries > 8) return 'Between 0 and 8 ministries.';
  const blocs = blocTotals(state);
  if (!(from in blocs) && f.commitments[from] !== from) f.commitments[from] = from;
  const prop: Proposal = { id: uid(rng, 'co'), kind: 'coalition', from, to, seatsAsked: 0, ministries, concession, pmPost, status: 'open', turn: f.round, note: '' };
  f.offers.push(prop);
  return `Offer sent to ${state.parties[to].short}. They will decide at the end of the round.`;
}

function aiBlocOffers(state: GameState, rng: Rng) {
  const f = state.formation!;
  const blocs = blocTotals(state);
  const q = aiQuality(state.config.difficulty);
  for (const leader of Object.keys(blocs)) {
    if (state.parties[leader].controlledBy !== 'ai') continue;
    if ((blocs[leader] ?? 0) < 60) continue;
    // court the closest parties first and stop once the bloc has a working majority
    let projected = blocs[leader];
    const targets = uncommitted(state).sort((a, b) => ideoDistance(state.parties[leader], state.parties[a]) - ideoDistance(state.parties[leader], state.parties[b]));
    for (const to of targets) {
      if (projected >= MAJORITY + 15) break;
      projected += lastResult(state)!.partySeats[to] ?? 0;
      if (state.parties[to].controlledBy === 'human' && f.offers.some((o) => o.from === leader && o.to === to)) continue;
      const res = lastResult(state)!;
      const seats = res.partySeats[to] ?? 0;
      const ministries = Math.min(8, Math.max(0, Math.round(seats / 6 + q * 1.5 + rng.normal(0, 0.5))));
      const concession = (Object.entries(state.parties[to].issueOwn).sort((a, b) => b[1] - a[1])[0][0]) as Issue;
      f.offers.push({ id: uid(rng, 'co'), kind: 'coalition', from: leader, to, seatsAsked: 0, ministries, concession: rng.next() < q ? concession : undefined, pmPost: false, status: 'open', turn: f.round, note: '' });
    }
  }
}

// Close the round: every uncommitted party picks its best offer above its reservation.
export function advanceFormation(state: GameState, rng: Rng, humanChoices: Record<string, string> = {}): string[] {
  const f = state.formation!;
  const notes: string[] = [];
  aiBlocOffers(state, rng);
  const reservation = 0.05 + aiQuality(state.config.difficulty) * 0.1;
  for (const to of uncommitted(state)) {
    const offers = f.offers.filter((o) => o.to === to && o.turn === f.round && o.status === 'open');
    if (!offers.length) continue;
    let pick: Proposal | undefined;
    if (state.parties[to].controlledBy === 'human' && humanChoices[to]) {
      pick = offers.find((o) => o.id === humanChoices[to]);
    } else {
      // AI parties, and human parties that have not chosen, take the best offer on its merits
      const scored = offers.map((o) => ({ o, ...offerValue(state, o) })).sort((a, b) => b.v - a.v);
      if (scored[0].v > reservation) pick = scored[0].o;
      if (pick) pick.note = scored[0].why.join(' ');
    }
    for (const o of offers) o.status = o === pick ? 'accepted' : 'rejected';
    if (pick) {
      f.commitments[to] = pick.from;
      relate(state, to, pick.from, 0.2);
      const line = `${state.parties[to].short} backs the ${state.parties[pick.from].short}-led bloc${pick.ministries ? ` for ${pick.ministries} ministries` : ''}${pick.pmPost ? ' and the PM post' : ''}.`;
      f.log.push(line); notes.push(line);
      if (state.parties[pick.from].controlledBy === 'human') mail(state, rng, { party: pick.from, from: 'Negotiating team', subject: `${state.parties[to].short} accepts`, body: line + (pick.note ? ` ${pick.note}` : ''), importance: 'high', kind: 'result' });
    }
  }
  for (const o of f.offers) if (o.status === 'open') o.status = 'expired';
  f.round++;
  const blocs = blocTotals(state);
  const best = Object.entries(blocs).sort((a, b) => b[1] - a[1])[0];
  if ((best && best[1] >= MAJORITY) || f.round > f.maxRounds) notes.push(...formGovernment(state, rng));
  return notes;
}

export function formGovernment(state: GameState, rng: Rng): string[] {
  const f = state.formation!;
  const res = lastResult(state)!;
  const blocs = blocTotals(state);
  const ranked = Object.entries(blocs).sort((a, b) => b[1] - a[1]);
  const notes: string[] = [];
  if (!ranked.length) { notes.push('No bloc could be formed.'); return notes; }
  const [leader, support] = ranked[0];
  const oppose = ranked.slice(1).reduce((a, [, n]) => a + n, 0);
  const passes = support >= MAJORITY || support > oppose;
  const members = Object.entries(f.commitments).filter(([, l]) => l === leader).map(([p]) => p);
  const pmGrant = f.offers.find((o) => o.status === 'accepted' && o.from === leader && o.pmPost);
  const pmParty = pmGrant ? pmGrant.to : leader;
  const partners = members.filter((m) => m !== pmParty);
  const ministries: Record<string, number> = {};
  for (const o of f.offers) if (o.status === 'accepted' && o.from === leader) ministries[o.to] = o.ministries;
  const promises: NonNullable<GameState['government']>['promises'] = state.parties[pmParty].manifesto.policies.map((policy) => ({ policy, party: pmParty, status: 'pending' as const }));
  for (const o of f.offers) if (o.status === 'accepted' && o.from === leader && o.concession) remember(state, rng, { kind: 'promise', party: leader, other: o.to, text: `Promised ${state.parties[o.to].short} action on ${ISSUE_NAME[o.concession].toLowerCase()}.`, weight: 0.6 });
  const margin = support - MAJORITY;
  state.government = {
    pmParty, partners, outside: [], ministries,
    approval: 0.55, stability: clamp(0.5 + margin / 80 + (res.partySeats[pmParty] ?? 0) / 800), fiscalSpace: 10, adminCapacity: 0.6, year: 1, promises, confidenceVotes: 1,
  };
  if (!passes) {
    state.government.stability = 0.25;
    notes.push(`${state.parties[leader].short}'s bloc has only ${support} seats and faced ${oppose} against. With abstentions it scraped through the confidence vote as a fragile minority government.`);
  } else notes.push(`${state.parties[pmParty].short} forms the government with ${support} seats and wins the confidence vote.`);
  report(state, rng, { headline: `${state.parties[pmParty].leader} to be sworn in as Prime Minister`, fact: `${state.parties[pmParty].name} formed a government with ${support} seats.`, parties: [pmParty], tone: 0.4 });
  const player = state.playerParty;
  const inGov = pmParty === player || partners.includes(player);
  state.career.push({ cycle: state.cycle, year: state.year, party: player, seats: res.partySeats[player] ?? 0, voteShare: res.voteShare[player] ?? 0, outcome: pmParty === player ? 'Formed government' : inGov ? 'Junior partner in government' : 'Opposition', inGovernment: inGov });
  if (pmParty === player) milestone(state, 'pm', 'Formed a government');
  if ((res.partySeats[player] ?? 0) >= MAJORITY) milestone(state, 'majority', 'Won an outright majority');
  if (partners.includes(player)) milestone(state, 'partner', 'Joined a coalition government');
  state.formation = null;
  state.phase = state.config.mode === 'career' || state.config.mode === 'sandbox' ? 'governance' : 'ended';
  for (const p of Object.values(state.parties)) p.seatsPrev = res.partySeats[p.id] ?? 0;
  return notes;
}

export function milestone(state: GameState, id: string, title: string) {
  if (state.milestones.some((m) => m.id === id)) return;
  state.milestones.push({ id, title, turn: state.turn, cycle: state.cycle });
}

// --- Governance years (career and sandbox modes) ---

export type GovAction =
  | { kind: 'implement'; policy: string }
  | { kind: 'agitate'; issue: Issue }
  | { kind: 'rebuild'; state: string; budget: number }
  | { kind: 'coalition_care'; partner: string };

export function governanceYear(state: GameState, player: string, choices: GovAction[], rng: Rng): string[] {
  const gov = state.government!;
  const p = state.parties[player];
  const notes: string[] = [];
  const inGov = gov.pmParty === player || gov.partners.includes(player);
  state.economy = clamp(state.economy * 0.7 + rng.normal(0, 0.25), -1, 1);
  for (const c of choices.slice(0, 2)) {
    if (c.kind === 'implement' && inGov) {
      const pr = gov.promises.find((x) => x.policy === c.policy && x.status === 'pending');
      const pol = POLICY_BY_ID[c.policy];
      if (!pr || !pol) continue;
      const afford = gov.fiscalSpace >= pol.cost;
      const success = afford && rng.chance(clamp(0.35 + gov.adminCapacity * 0.5 - pol.cost * 0.04 + staffSkill(p, 'policy_adviser') * 0.2));
      if (afford) gov.fiscalSpace -= pol.cost;
      pr.status = success ? 'kept' : afford ? 'partial' : 'broken';
      if (success) { gov.approval = clamp(gov.approval + 0.03 + Object.values(pol.appeal).reduce((a, b) => a + Math.max(0, b ?? 0), 0) * 0.01); p.issueOwn[pol.issue] = clamp(p.issueOwn[pol.issue] + 0.05); remember(state, rng, { kind: 'promise_kept', party: player, text: `Delivered: ${pol.name}.`, weight: 0.6 }); notes.push(`${pol.name} delivered.`); }
      else if (!afford) { gov.approval = clamp(gov.approval - 0.03); p.stats.trust = clamp(p.stats.trust - 0.03); remember(state, rng, { kind: 'promise_broken', party: player, text: `Could not fund ${pol.name}.`, weight: 0.7 }); notes.push(`${pol.name} could not be funded. The promise is broken.`); }
      else { gov.approval = clamp(gov.approval - 0.01); notes.push(`${pol.name} launched, but implementation is patchy.`); }
    } else if (c.kind === 'agitate' && !inGov) {
      const fit = p.issueOwn[c.issue] - 0.4;
      p.stats.popularity += fit * 0.04 + rng.normal(0, 0.01);
      gov.approval = clamp(gov.approval - 0.015);
      state.salience[c.issue] = clamp((state.salience[c.issue] ?? 0.45) + 0.05);
      notes.push(`Our ${ISSUE_NAME[c.issue].toLowerCase()} agitation ${fit > 0 ? 'found an audience' : 'struggled to land; we are not trusted on it'}.`);
    } else if (c.kind === 'rebuild') {
      const b = Math.min(c.budget, p.stats.funds);
      p.stats.funds -= b;
      for (const s of state.seats) if (s.state === c.state) s.org[player] = clamp((s.org[player] ?? 0) + Math.log1p(b / 5) * 0.03);
      p.stats.organisation = clamp(p.stats.organisation + 0.005);
      notes.push(`Organisation rebuilt in ${c.state}.`);
    } else if (c.kind === 'coalition_care' && inGov) {
      relate(state, player, c.partner, 0.15);
      gov.stability = clamp(gov.stability + 0.05);
      notes.push(`Time spent keeping ${state.parties[c.partner]?.short ?? 'partners'} on side.`);
    }
  }
  // the year's background drift
  gov.approval = clamp(gov.approval + state.economy * 0.04 - 0.02 + rng.normal(0, 0.02));
  gov.fiscalSpace = Math.min(12, gov.fiscalSpace + 3 + state.economy * 2);
  gov.adminCapacity = clamp(gov.adminCapacity + 0.01);
  for (const partner of gov.partners) {
    const rel = state.relations[partner]?.[gov.pmParty] ?? 0;
    if (rel < -0.1 && rng.chance(0.25 * (1 - gov.stability))) {
      gov.partners = gov.partners.filter((x) => x !== partner);
      gov.stability = clamp(gov.stability - 0.15);
      remember(state, rng, { kind: 'alliance_broken', party: gov.pmParty, other: partner, text: `${state.parties[partner].short} withdrew support from the government.`, weight: 0.7 });
      notes.push(`${state.parties[partner].short} has withdrawn from the government.`);
    } else relate(state, partner, gov.pmParty, rng.normal(-0.02, 0.05));
  }
  for (const pid of state.partyOrder) {
    const q = state.parties[pid];
    q.stats.funds += q.stats.income * 8 * (q.controlledBy === 'human' ? 1 : 0.8);
    q.stats.popularity *= 0.85; // campaign effects fade between elections
    if (q.id === gov.pmParty) q.stats.leaderPop = clamp(q.stats.leaderPop + (gov.approval - 0.5) * 0.05);
  }
  gov.year++;
  state.year++;
  state.turn++;
  return notes;
}

export function governmentCollapses(state: GameState): boolean {
  const gov = state.government;
  if (!gov) return false;
  const res = lastResult(state);
  if (!res) return false;
  const support = [gov.pmParty, ...gov.partners].reduce((a, p) => a + (res.partySeats[p] ?? 0), 0);
  return support < MAJORITY - 40 && gov.stability < 0.3;
}
