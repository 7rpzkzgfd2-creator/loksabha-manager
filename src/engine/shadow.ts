// Shadow politics: buying defectors and taking money off the books.
// Both work in the short term and both build a hidden exposure score. Each turn there is
// a chance, rising with exposure and with how aggressive rivals and the media are, that
// it all comes out. Getting caught costs trust, leader standing, seized funds and
// factional peace, and the record follows the party into future cycles.

import { STATE_BY_CODE, makeCandidate } from './setup.ts';
import { clamp, uid } from './rng.ts';
import type { Rng } from './rng.ts';
import type { GameState, Party } from './types.ts';
import { adjustFaction, staffSkill } from './party.ts';
import { mail, relate, remember, report } from './world.ts';
import { aiQuality } from './ai.ts';
import { calibrateSeat } from './voters.ts';

export const FUNDING_RANGE: [number, number] = [5, 100];

export interface PoachQuote {
  seat: string;
  from: string;
  candidateId: string;
  name: string;
  price: number; // crore at 1x offer
  odds: number; // success chance at 1x offer, as the party's fixers estimate it
  personalVote: number; // share points the candidate could bring
  incumbent: boolean;
}

export function poachQuote(state: GameState, buyer: string, seatId: string, from: string): PoachQuote | null {
  const c = state.seats.find((x) => x.id === seatId);
  const k = c?.candidates[from];
  if (!c || !k || from === buyer || from === 'OTH') return null;
  if (k.real) return null; // real politicians are never offered bribes in the game
  const rival = state.parties[from];
  const price = Math.round((2 + 18 * k.localRep + (k.incumbent ? 8 : 0) + 10 * k.loyalty) * 10) / 10;
  const odds = clamp(0.2 + (1 - k.loyalty) * 0.5 + (1 - rival.stats.cohesion) * 0.3 - (rival.stats.momentum > state.parties[buyer].stats.momentum ? 0.1 : 0), 0.05, 0.85);
  return { seat: c.id, from, candidateId: k.id, name: k.name, price, odds, personalVote: k.localRep * 0.45 * (c.base[from] ?? 0), incumbent: k.incumbent };
}

export function validatePoach(state: GameState, buyer: string, seatId: string, from: string, mult: number): string | null {
  if (state.phase !== 'campaign') return 'Defections can only be arranged during the campaign.';
  if (state.stage === 'final_push' && state.campaignTurn === state.config.campaignTurns) return 'Nominations have closed.';
  const q = poachQuote(state, buyer, seatId, from);
  if (!q) return 'Nobody to approach there.';
  if (mult < 1 || mult > 2) return 'Offer must be between 1x and 2x the asking price.';
  if (state.shadow.some((d) => d.kind === 'poach' && d.target === q.candidateId && d.turn >= state.turn - 1)) return 'Already approached this week.';
  if (state.parties[buyer].stats.funds < q.price * mult) return 'Not enough money for this offer.';
  return null;
}

export function attemptPoach(state: GameState, buyer: string, seatId: string, from: string, mult: number, rng: Rng): string {
  const err = validatePoach(state, buyer, seatId, from, mult);
  if (err) return err;
  const q = poachQuote(state, buyer, seatId, from)!;
  const p = state.parties[buyer], rival = state.parties[from];
  const c = state.seats.find((x) => x.id === seatId)!;
  const k = c.candidates[from];
  const amount = Math.round(q.price * mult * 10) / 10;
  const odds = clamp(q.odds + (mult - 1) * 0.3, 0.05, 0.92);
  const success = rng.chance(odds);
  const paid = success ? amount : Math.round(amount * 0.3 * 10) / 10; // fixers' fees are not refundable
  p.stats.funds = Math.round((p.stats.funds - paid) * 100) / 100;
  p.stats.shadowExposure = clamp(p.stats.shadowExposure + 0.08 + amount / 250);
  let text: string;
  let exposed = false;
  if (success) {
    // the candidate crosses over with their personal vote; some of it stays with the old party
    const moved = q.personalVote;
    c.base[from] = Math.max(0.004, (c.base[from] ?? 0) - moved);
    c.base[buyer] = (c.base[buyer] ?? 0.004) + moved * 0.7;
    c.base.OTH = (c.base.OTH ?? 0) + moved * 0.15;
    c.org[from] = clamp((c.org[from] ?? 0) - 0.1);
    c.org[buyer] = clamp((c.org[buyer] ?? 0) + 0.08 * k.organisation);
    const old = c.candidates[buyer];
    if (old && old.localRep > 0.6 && rng.chance(0.4)) { c.rebel = clamp(0.03 + old.localRep * 0.06, 0, 0.12); c.rebelFrom = buyer; }
    c.candidates[buyer] = { ...k, party: buyer, loyalty: clamp(k.loyalty * 0.6), profile: 'turncoat', faction: undefined };
    c.candidates[from] = makeCandidate(rng, rival, c.state, rival.stats.candidateQuality - 0.1);
    if (c.incumbent === from && k.incumbent) c.incumbent = buyer;
    for (const a of state.alliances) {
      if (a.members.includes(buyer) && a.seatAlloc[c.id] && a.seatAlloc[c.id] !== buyer) {
        delete c.candidates[a.seatAlloc[c.id]]; // partner stands down here, grudgingly
        a.seatAlloc[c.id] = buyer;
        a.trust = clamp(a.trust - 0.08);
      }
    }
    // offsets were calibrated to the old baseline; refresh this seat
    recalibrate(state, c.id);
    adjustFaction(p, (f) => f.outlook === 'loyalist' || f.outlook === 'ideologue', -0.04, `Turncoat given the ${c.name} ticket`);
    adjustFaction(rival, () => true, -0.03);
    relate(state, buyer, from, -0.25);
    remember(state, rng, { kind: 'candidate', party: buyer, other: from, text: `${k.name} defected from ${rival.short} to ${p.short} in ${c.name}.`, weight: 0.5 });
    report(state, rng, { headline: `${k.name} quits ${rival.short}, joins ${p.short}`, fact: `${k.name}${k.incumbent ? ', the sitting MP,' : ''} switched from ${rival.short} to ${p.short} in ${c.name}.`, parties: [buyer, from], tone: 0.2, region: STATE_BY_CODE[c.state].region });
    text = `${k.name} has crossed over and will contest ${c.name} for us. Paid ₹${amount} cr.`;
  } else {
    // a refused approach can be recorded and leaked; loyal people are likelier to go public
    if (rng.chance(0.15 + k.loyalty * 0.35)) {
      exposed = true;
      p.stats.shadowExposure = clamp(p.stats.shadowExposure + 0.25);
      p.stats.trust = clamp(p.stats.trust - 0.04);
      state.states[c.state].mood[buyer] = (state.states[c.state].mood[buyer] ?? 0) - 0.025;
      relate(state, buyer, from, -0.35);
      remember(state, rng, { kind: 'controversy', party: buyer, other: from, text: `${k.name} said ${p.short} offered money to defect.`, weight: 0.7 });
      report(state, rng, { headline: `"They offered me crores": ${k.name} accuses ${p.short}`, fact: `${k.name} of ${rival.short} alleged an inducement offer from ${p.short}.`, parties: [buyer, from], tone: -0.6, region: STATE_BY_CODE[c.state].region });
      text = `${k.name} turned us down and went to the press. ₹${paid} cr in fees is gone and the story is out.`;
    } else text = `${k.name} turned us down. ₹${paid} cr in fixers' fees is gone. They kept quiet, for now.`;
  }
  state.shadow.push({ id: uid(rng, 'sh'), turn: state.turn, party: buyer, kind: 'poach', amount: paid, target: q.candidateId, seat: c.id, from, success, exposed, text });
  return text;
}

export function takeBackdoorFunds(state: GameState, party: string, amount: number, rng: Rng): string {
  const p = state.parties[party];
  if (state.phase !== 'campaign' && state.phase !== 'governance') return 'Not now.';
  if (amount < FUNDING_RANGE[0] || amount > FUNDING_RANGE[1]) return `Between ₹${FUNDING_RANGE[0]} and ₹${FUNDING_RANGE[1]} crore.`;
  if (state.shadow.some((d) => d.party === party && d.kind === 'funding' && d.turn === state.turn)) return 'One deal per week. Couriers attract attention.';
  const launder = staffSkill(p, 'finance');
  p.stats.funds = Math.round((p.stats.funds + amount) * 100) / 100;
  p.stats.shadowExposure = clamp(p.stats.shadowExposure + amount / 160 * (1 - launder * 0.3));
  p.stats.shadowTotal += amount;
  const text = `₹${amount} cr arrived through a "well-wisher". It is not in any declared account.`;
  state.shadow.push({ id: uid(rng, 'sh'), turn: state.turn, party, kind: 'funding', amount, success: true, exposed: false, text });
  return text;
}

// Detection roll, once per turn per party.
export function shadowScrutiny(state: GameState, rng: Rng) {
  const rivals = Object.values(state.parties);
  const avgAggression = rivals.reduce((a, p) => a + p.ai.aggression, 0) / rivals.length;
  for (const p of rivals) {
    const e = p.stats.shadowExposure;
    if (e <= 0.01) continue;
    // the deeper in you are, the faster it unravels: modest dealing is a gamble, heavy dealing is reckless
    const chance = (0.02 + Math.pow(e, 1.5) * 0.32) * (0.7 + avgAggression * 0.4 + p.stats.media * 0.2);
    if (rng.chance(chance)) expose(state, p, rng);
    else p.stats.shadowExposure = clamp(e * 0.97);
  }
}

function expose(state: GameState, p: Party, rng: Rng) {
  const sev = clamp(p.stats.shadowExposure + 0.2) * (1 - staffSkill(p, 'crisis_adviser') * 0.25);
  const seized = Math.min(Math.max(0, p.stats.funds), Math.round(p.stats.shadowTotal * 0.5));
  p.stats.funds -= seized;
  p.stats.trust = clamp(p.stats.trust - (0.03 + 0.15 * sev));
  p.stats.leaderPop = clamp(p.stats.leaderPop - 0.06 * sev);
  p.stats.popularity -= 0.07 * sev;
  p.stats.fiscalCredibility = clamp(p.stats.fiscalCredibility - 0.05);
  adjustFaction(p, (f) => f.outlook !== 'loyalist', -0.1 * sev, 'Funding scandal');
  for (const st of Object.values(state.states)) st.mood[p.id] = (st.mood[p.id] ?? 0) - 0.01 * sev;
  remember(state, rng, { kind: 'finance', party: p.id, text: `Exposed: illegal funding and inducements (₹${Math.round(p.stats.shadowTotal)} cr off the books). ₹${seized} cr seized.`, weight: 0.9 });
  report(state, rng, { headline: `Raids expose ${p.short}'s secret war chest`, fact: `Investigators allege the ${p.short} received undeclared funds; ₹${seized} crore was seized.`, parties: [p.id], tone: -0.8 });
  mail(state, rng, { party: p.id, from: 'Legal cell', subject: 'We have been caught', importance: 'critical', kind: 'warning', body: `Investigators have traced off-the-books money to the party. ₹${seized} crore has been frozen. Trust and the leader's standing are taking a heavy hit, and the factions are restless. This will be remembered at the next election as well.` });
  for (const d of state.shadow) if (d.party === p.id) d.exposed = true;
  p.stats.shadowExposure = clamp(p.stats.shadowExposure * 0.3);
  p.stats.shadowTotal = 0;
}

// Rival AIs sometimes use the same tools. Riskier, cash-starved parties are likelier to.
export function aiShadowMoves(state: GameState, partyId: string, rng: Rng) {
  const p = state.parties[partyId];
  if (partyId === 'OTH' || p.controlledBy !== 'ai') return;
  const q = aiQuality(state.config.difficulty);
  if (p.stats.funds < 25 && p.ai.risk > 0.45 && p.stats.shadowExposure < 0.35 && rng.chance(0.25 * p.ai.risk)) {
    takeBackdoorFunds(state, partyId, rng.int(5, 30), rng);
  }
  if (state.stage === 'preparation' || !rng.chance(0.15 * p.ai.risk * (0.5 + q))) return;
  let best: { seat: string; from: string; v: number } | null = null;
  for (const c of state.seats) {
    const fc = state.seatForecast[c.id];
    const mine = fc?.probs[partyId] ?? 0;
    if (!c.candidates[partyId] || mine < 0.2 || mine > 0.6) continue;
    for (const [from, k] of Object.entries(c.candidates)) {
      if (from === partyId || from === 'OTH' || k.loyalty > 0.45) continue;
      const v = k.localRep * (fc?.probs[from] ?? 0) - k.loyalty;
      if (!best || v > best.v) best = { seat: c.id, from, v };
    }
  }
  if (best) {
    const qt = poachQuote(state, partyId, best.seat, best.from);
    if (qt && qt.price < p.stats.funds * 0.3) attemptPoach(state, partyId, best.seat, best.from, 1 + q * 0.3, rng);
  }
}

function recalibrate(state: GameState, seatId: string) {
  const c = state.seats.find((x) => x.id === seatId)!;
  const tot = Object.values(c.base).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(c.base)) c.base[k] /= tot;
  calibrateSeat(state, c);
}
