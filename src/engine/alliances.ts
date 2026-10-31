// Pre-poll alliances and seat sharing. An alliance changes who is on the ballot in each
// seat; vote transfers between partners are partial and handled by the voter model.

import { allocateSeats, makeCandidate } from './setup.ts';
import { clamp, uid } from './rng.ts';
import type { Rng } from './rng.ts';
import type { Alliance, GameState, Proposal } from './types.ts';
import { calibrateSeat, ideoDistance } from './voters.ts';
import { adjustFaction, staffSkill } from './party.ts';
import { mail, relate, remember, report } from './world.ts';
import { aiQuality } from './ai.ts';

export function allianceOf(state: GameState, party: string): Alliance | undefined {
  return state.alliances.find((a) => a.members.includes(party));
}

// Seats where both parties would field candidates, and how many the partner "deserves"
// by local strength.
export function overlap(state: GameState, a: string, b: string) {
  let shared = 0, fairB = 0;
  for (const c of state.seats) {
    const ba = c.base[a] ?? 0, bb = c.base[b] ?? 0;
    if (ba < 0.012 || bb < 0.012) continue;
    shared++;
    if (bb > ba) fairB++;
  }
  return { shared, fairB };
}

export function allianceWindowOpen(state: GameState) {
  return state.phase === 'campaign' && state.stage === 'preparation';
}

export interface AllianceVerdict { accept: boolean; score: number; reasons: string[] }

export function evaluateAlliance(state: GameState, from: string, to: string, seatsOffered: number): AllianceVerdict {
  const pf = state.parties[from], pt = state.parties[to];
  const reasons: string[] = [];
  const q = aiQuality(state.config.difficulty);
  const { shared, fairB } = overlap(state, from, to);
  const compat = 1 - ideoDistance(pf, pt);
  let score = compat * 0.9 - 0.45;
  reasons.push(compat > 0.65 ? 'Our positions are close.' : compat < 0.45 ? 'Our ideologies are far apart; our voters may not follow.' : 'Some ideological distance.');
  const rel = state.relations[to]?.[from] ?? 0;
  score += rel * 0.5;
  if (rel < -0.2) reasons.push('Relations between us are poor.');
  const generosity = shared > 0 ? (seatsOffered - fairB) / Math.max(4, shared) : 0;
  score += generosity * (0.6 + q * 0.6);
  if (shared === 0) { score -= 0.1; reasons.push('We hardly compete in the same seats, so an alliance gains us little on the ground.'); }
  else reasons.push(seatsOffered >= fairB ? `The seat offer (${seatsOffered} of ${shared} shared seats) is fair or better.` : `The seat offer (${seatsOffered} of ${shared}) is below our strength (${fairB}).`);
  score += pt.ai.allianceAppetite * 0.3;
  const current = allianceOf(state, to);
  if (current) {
    score -= 0.25 + current.trust * 0.5;
    reasons.push(current.trust < 0.4 ? `We are unhappy in the ${current.name}.` : `We would have to walk out of the ${current.name}.`);
  }
  const grudges = state.memory.filter((m) => m.party === to && m.other === from && (m.kind === 'alliance' || m.kind === 'alliance_broken' || m.kind === 'controversy')).reduce((a, m) => a + m.weight, 0);
  if (grudges > 0) { score -= grudges * 0.3; reasons.push('We remember how you treated us before.'); }
  const broken = state.memory.filter((m) => m.party === from && m.kind === 'promise_broken').length;
  if (broken) { score -= broken * 0.05; reasons.push('Your record on keeping promises worries us.'); }
  const neg = staffSkill(pf, 'negotiator');
  score += neg * 0.2;
  // stronger AIs demand more from a weak suitor
  const fc = state.polls[state.polls.length - 1];
  const fromSeats = fc?.seats[from]?.[1] ?? 0;
  if (fromSeats < 10 && q > 0.6) { score -= 0.1; reasons.push('You bring few seats to the table.'); }
  return { accept: score > 0.05, score, reasons };
}

export function proposeAlliance(state: GameState, from: string, to: string, seatsOffered: number, rng: Rng): { ok: boolean; text: string } {
  if (!allianceWindowOpen(state)) return { ok: false, text: 'Alliance talks are closed: seat-sharing locked at the end of preparation.' };
  if (from === to || to === 'OTH' || !state.parties[to]) return { ok: false, text: 'Not a valid partner.' };
  const mine = allianceOf(state, from);
  if (mine && mine.members.includes(to)) return { ok: false, text: 'Already allies.' };
  if (state.proposals.some((p) => p.from === from && p.to === to && p.turn === state.turn)) return { ok: false, text: 'You already approached them this week.' };
  const pt = state.parties[to];
  const prop: Proposal = { id: uid(rng, 'prop'), kind: 'alliance', from, to, seatsAsked: seatsOffered, ministries: 0, status: 'open', turn: state.turn, note: '' };
  state.proposals.push(prop);
  if (pt.controlledBy === 'human') {
    mail(state, rng, { party: to, from: state.parties[from].name, subject: `Alliance offer from ${state.parties[from].short}`, body: `The ${state.parties[from].name} proposes a pre-poll alliance. You would contest ${seatsOffered} of the seats you both target.`, importance: 'high', kind: 'proposal', proposalId: prop.id });
    return { ok: true, text: `Offer sent to ${pt.short}.` };
  }
  const v = evaluateAlliance(state, from, to, seatsOffered);
  prop.note = v.reasons.join(' ');
  if (!v.accept) {
    prop.status = 'rejected';
    remember(state, rng, { kind: 'alliance', party: from, other: to, text: `${pt.short} rejected an alliance offer.`, weight: 0.2 });
    return { ok: false, text: `${pt.short} said no. ${v.reasons.join(' ')}` };
  }
  prop.status = 'accepted';
  joinAlliance(state, from, to, seatsOffered, rng);
  return { ok: true, text: `${pt.short} accepted. ${v.reasons.join(' ')}` };
}

export function joinAlliance(state: GameState, lead: string, partner: string, seatsOffered: number, rng: Rng) {
  const old = allianceOf(state, partner);
  if (old) leaveAlliance(state, partner, rng, true);
  let a = allianceOf(state, lead);
  if (!a) {
    a = { id: uid(rng, 'all'), name: `${state.parties[lead].short}-led front`, members: [lead], leader: lead, trust: 0.55, formedTurn: state.turn, friendlyFights: [], seatAlloc: {}, demands: {}, preset: false };
    state.alliances.push(a);
  }
  a.members.push(partner);
  a.demands[partner] = seatsOffered;
  // restore candidates first so the allocation sees everyone, then hand the partner its seats
  restoreCandidates(state, lead, rng);
  restoreCandidates(state, partner, rng);
  allocateSeats(state, a);
  enforceOffer(state, a, lead, partner, seatsOffered, rng);
  relate(state, lead, partner, 0.3);
  adjustFaction(state.parties[lead], (f) => f.outlook === 'regional', -0.04, `Seats shared with ${state.parties[partner].short}`);
  remember(state, rng, { kind: 'alliance', party: lead, other: partner, text: `${state.parties[partner].short} joined the ${a.name}, contesting ${seatsOffered} shared seats.`, weight: 0.5 });
  report(state, rng, { headline: `${state.parties[partner].short} joins hands with ${state.parties[lead].short}`, fact: `${state.parties[partner].name} entered a pre-poll alliance with ${state.parties[lead].name}.`, parties: [lead, partner], tone: 0.3 });
}

// Make the seat split match what was agreed (by default allocateSeats gives each seat to
// the stronger partner).
function enforceOffer(state: GameState, a: Alliance, lead: string, partner: string, n: number, rng: Rng) {
  const shared = state.seats.filter((c) => (c.base[lead] ?? 0) >= 0.012 && (c.base[partner] ?? 0) >= 0.012);
  const ranked = shared.slice().sort((x, y) => ((y.base[partner] ?? 0) - (y.base[lead] ?? 0)) - ((x.base[partner] ?? 0) - (x.base[lead] ?? 0)));
  ranked.forEach((c, i) => {
    const who = i < n ? partner : lead;
    const other = who === lead ? partner : lead;
    a.seatAlloc[c.id] = who;
    if (!c.candidates[who]) c.candidates[who] = makeCandidate(rng, state.parties[who], c.state, state.parties[who].stats.candidateQuality);
    delete c.candidates[other];
  });
}

export function restoreCandidates(state: GameState, party: string, rng: Rng) {
  const p = state.parties[party];
  for (const c of state.seats) {
    if (c.candidates[party]) continue;
    if ((c.base[party] ?? 0) < 0.012) continue;
    const ally = state.alliances.find((a) => a.members.includes(party) && a.seatAlloc[c.id] && a.seatAlloc[c.id] !== party);
    if (ally) continue;
    c.candidates[party] = makeCandidate(rng, p, c.state, p.stats.candidateQuality);
    if (!c.offsets[party]) calibrateSeat(state, c);
  }
}

export function leaveAlliance(state: GameState, party: string, rng: Rng, quiet = false) {
  const a = allianceOf(state, party);
  if (!a) return 'Not in an alliance.';
  a.members = a.members.filter((m) => m !== party);
  for (const [cid, who] of Object.entries(a.seatAlloc)) if (who === party) delete a.seatAlloc[cid];
  for (const m of a.members) {
    relate(state, party, m, -0.3);
    remember(state, rng, { kind: 'alliance_broken', party: m, other: party, text: `${state.parties[party].short} walked out of the ${a.name}.`, weight: 0.7 });
  }
  if (a.members.length < 2) state.alliances = state.alliances.filter((x) => x !== a);
  else {
    if (a.leader === party) a.leader = a.members[0];
    a.trust = clamp(a.trust - 0.1);
  }
  restoreCandidates(state, party, rng);
  for (const m of a.members) restoreCandidates(state, m, rng);
  if (!quiet) report(state, rng, { headline: `${state.parties[party].short} quits the ${a.name}`, fact: `${state.parties[party].name} left the ${a.name}.`, parties: [party], tone: -0.1 });
  return `Left the ${a.name}.`;
}

export function respondAllianceProposal(state: GameState, proposalId: string, accept: boolean, rng: Rng) {
  const prop = state.proposals.find((p) => p.id === proposalId);
  if (!prop || prop.status !== 'open') return 'That offer is no longer open.';
  if (!allianceWindowOpen(state)) { prop.status = 'expired'; return 'Too late: seat-sharing has locked.'; }
  prop.status = accept ? 'accepted' : 'rejected';
  if (accept) { joinAlliance(state, prop.from, prop.to, prop.seatsAsked, rng); return 'Alliance agreed.'; }
  remember(state, rng, { kind: 'alliance', party: prop.from, other: prop.to, text: `${state.parties[prop.to].short} rejected our alliance offer.`, weight: 0.3 });
  return 'Offer declined.';
}

// AI diplomacy each preparation turn: unaligned parties may court the player, and bloc
// leaders try to answer a new alliance with one of their own.
export function aiDiplomacy(state: GameState, rng: Rng) {
  if (!allianceWindowOpen(state)) return;
  const q = aiQuality(state.config.difficulty);
  const humans = Object.values(state.parties).filter((p) => p.controlledBy === 'human');
  for (const pid of state.partyOrder) {
    const p = state.parties[pid];
    if (p.controlledBy !== 'ai' || pid === 'OTH' || allianceOf(state, pid)) continue;
    for (const h of humans) {
      const { shared, fairB } = overlap(state, h.id, pid);
      if (shared < 2 || state.proposals.some((x) => x.from === pid && x.to === h.id)) continue;
      const compat = 1 - ideoDistance(p, h);
      if (rng.chance(p.ai.allianceAppetite * compat * 0.25)) {
        const ask = Math.min(shared, fairB + rng.int(0, 2));
        const prop: Proposal = { id: uid(rng, 'prop'), kind: 'alliance', from: h.id, to: pid, seatsAsked: ask, ministries: 0, status: 'open', turn: state.turn, note: '' };
        // AI-initiated: the AI wants to join the human's front on these terms
        state.proposals.push(prop);
        mail(state, rng, { party: h.id, from: p.name, subject: `${p.short} wants to talk alliance`, body: `The ${p.name} is ready to join a pre-poll alliance with us if it can contest ${ask} of the ${shared} seats where we both have a base. By local strength they would expect about ${fairB}.`, importance: 'high', kind: 'proposal', proposalId: prop.id });
      }
    }
  }
  // counter-alliances: a bloc leader answers a player-built front by courting an unaligned party
  if (q < 0.5) return;
  const playerFronts = state.alliances.filter((a) => !a.preset && a.formedTurn === state.turn - 1);
  if (!playerFronts.length) return;
  for (const a of state.alliances.filter((x) => x.preset && state.parties[x.leader].controlledBy === 'ai')) {
    const free = state.partyOrder.filter((pid) => pid !== 'OTH' && !allianceOf(state, pid) && state.parties[pid].controlledBy === 'ai');
    const target = free.sort((x, y) => ideoDistance(state.parties[a.leader], state.parties[x]) - ideoDistance(state.parties[a.leader], state.parties[y]))[0];
    if (!target) continue;
    const { fairB } = overlap(state, a.leader, target);
    const v = evaluateAlliance(state, a.leader, target, fairB + 1);
    if (v.accept) joinAlliance(state, a.leader, target, fairB + 1, rng);
  }
}
