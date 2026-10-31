// Rival party AI. Rivals plan with the same action rules, budgets and capacity limits as
// the player, using only public information: the public forecast, their own (biased)
// read of it, and the player's visible campaign events. They never read the player's
// queued actions, private budget or future random draws.
//
// Difficulty changes decision quality (targeting accuracy, issue choice, how much of the
// budget is used well, whether they react to the player), not the vote arithmetic.

import { ISSUES, POLICIES } from './data/catalog.ts';
import { messageFit, validateAction } from './actions.ts';
import { clamp } from './rng.ts';
import type { Rng } from './rng.ts';
import type { CampaignAction, Difficulty, GameState, Issue, Party } from './types.ts';
import { uid } from './rng.ts';
import { leaderDays } from './party.ts';
import { stateMessageFit, stateSeats, TOUR_COST } from './statecampaign.ts';
import type { StateCampaignMode } from './types.ts';

export function aiQuality(d: Difficulty): number {
  return d === 'easy' ? 0.35 : d === 'hard' ? 0.9 : 0.65;
}

function turnsLeft(state: GameState) {
  return Math.max(1, state.config.campaignTurns - state.campaignTurn + 1);
}

// What the player did in public last turn (rallies, roadshows are visible to everyone).
export function playerFootprint(state: GameState, player: string) {
  const recent = state.outcomes.filter((o) => o.party === player && o.turn >= state.turn - 2);
  const seats = new Map<string, number>();
  const states = new Map<string, number>();
  for (const o of recent) {
    if (o.constituency) seats.set(o.constituency, (seats.get(o.constituency) ?? 0) + 1);
    if (o.state) states.set(o.state, (states.get(o.state) ?? 0) + 1);
  }
  return { seats, states };
}

function bestIssue(state: GameState, p: Party, rng: Rng, q: number, cId?: string): Issue {
  const c = cId ? state.seats.find((x) => x.id === cId) : undefined;
  if (rng.next() > q) return rng.pick(ISSUES).id;
  let best: Issue = 'economy', bv = -1;
  for (const i of ISSUES) {
    const v = messageFit(state, p, i.id, c) - (i.polarising > 0.3 && c && c.urban > 0.5 ? 0.2 * (1 - q) : 0);
    if (v > bv) { bv = v; best = i.id; }
  }
  return best;
}

export function aiPickManifesto(state: GameState, p: Party, rng: Rng) {
  const q = aiQuality(state.config.difficulty);
  const scored = POLICIES.map((pol) => {
    const fit = -Math.abs(pol.econ - p.ideology.econ) - Math.abs(pol.social - p.ideology.social) * 1.2 - Math.abs(pol.federal - p.ideology.federal) * 0.6;
    const appeal = Object.values(pol.appeal).reduce((a, b) => a + (b ?? 0), 0);
    const afford = pol.cost >= 4 ? (p.stats.fiscalCredibility - 0.5) * 2 : 0;
    return { pol, score: fit * 2 + appeal * 0.4 * q + afford * q + rng.normal(0, 0.5 * (1 - q)) };
  }).sort((a, b) => b.score - a.score);
  let budget = 9;
  for (const { pol } of scored) {
    if (p.manifesto.policies.length >= 5) break;
    if (pol.cost > budget) continue;
    p.manifesto.policies.push(pol.id);
    budget -= pol.cost;
  }
  p.manifesto.credibility = manifestoCredibility(state, p);
}

export function manifestoCredibility(state: GameState, p: Party): number {
  let clash = 0, cost = 0;
  for (const id of p.manifesto.policies) {
    const pol = POLICIES.find((x) => x.id === id);
    if (!pol) continue;
    clash += Math.max(0, Math.abs(pol.econ - p.ideology.econ) + Math.abs(pol.social - p.ideology.social) - 0.6);
    cost += pol.cost;
  }
  const adviser = p.staff.filter((s) => s.role === 'policy_adviser').reduce((m, s) => Math.max(m, s.skill / 100), p.controlledBy === 'ai' ? p.stats.campaignSkill * 0.6 : 0);
  // contradictions between policies (e.g. fiscal hawk + loan waiver) cost credibility
  const has = (id: string) => p.manifesto.policies.includes(id);
  let contradiction = 0;
  if (has('gst_simplify') && has('farm_loan')) contradiction += 0.05;
  if (has('uniform_code') && has('caste_census')) contradiction += 0.06;
  if (has('manufacturing') && has('msp_law') && p.ideology.econ > 0.3) contradiction += 0.04;
  const affordability = Math.max(0, cost - 6 - p.stats.fiscalCredibility * 8) * 0.03;
  void state;
  return clamp(0.45 + p.stats.trust * 0.3 + adviser * 0.2 - clash * 0.1 - affordability - contradiction);
}

export function planAITurn(state: GameState, partyId: string, rng: Rng): CampaignAction[] {
  const p = state.parties[partyId];
  if (partyId === 'OTH') return [];
  const q = aiQuality(state.config.difficulty);
  const left = turnsLeft(state);
  const final = state.stage === 'final_push';
  const spendFrac = 0.55 + q * 0.4;
  const reserve = state.config.mode === 'career' ? 0.12 : 0.02;
  let budget = Math.max(0, (p.stats.funds * (1 - reserve)) * spendFrac / left * (final ? 1.5 : 1));
  const actions: CampaignAction[] = [];
  const tryAdd = (a: Omit<CampaignAction, 'id' | 'party'>) => {
    const full: CampaignAction = { ...a, id: uid(rng, 'ai'), party: partyId } as CampaignAction;
    if (validateAction(state, full, actions) === null) {
      actions.push(full);
      return true;
    }
    return false;
  };

  // target seats from the public forecast, seen through the party's own polling bias
  const human = Object.values(state.parties).filter((x) => x.controlledBy === 'human').map((x) => x.id);
  const footprints = human.map((h) => playerFootprint(state, h));
  const targets: { id: string; state: string; v: number }[] = [];
  for (const c of state.seats) {
    if (!c.candidates[partyId]) continue;
    const fc = state.seatForecast[c.id];
    if (!fc) continue;
    let pr = fc.probs[partyId] ?? 0;
    pr = clamp(pr + (rng.normal(0, 0.25) * (1 - q)));
    let v = 1 - Math.abs(pr - 0.5) * 2; // value peaks at toss-ups
    if (c.incumbent === partyId && pr > 0.4 && pr < 0.85) v += 0.25 * q; // protect vulnerable incumbents
    if (p.homeStates.includes(c.state)) v += 0.2 * p.ai.regionalFocus;
    if ((c.saturation[partyId] ?? 0) > 0.4) v -= 0.3 * q;
    // exploit or contest the human player's choices (stronger AIs pay more attention)
    for (let i = 0; i < human.length; i++) {
      const h = human[i];
      if (h === partyId || !c.candidates[h]) continue;
      const hp = fc.probs[h] ?? 0;
      const visited = footprints[i].seats.get(c.id) ?? 0;
      if (q > 0.5 && visited > 0 && pr > 0.2) v += 0.25 * q * p.ai.aggression; // counter-campaign
      if (q > 0.6 && visited === 0 && hp > 0.25 && hp < 0.75 && (c.visits[h] ?? 0) === 0) v += 0.2 * q; // neglected marginal
    }
    v += rng.normal(0, 0.35 * (1 - q));
    if (pr > 0.02) targets.push({ id: c.id, state: c.state, v });
  }
  targets.sort((a, b) => b.v - a.v);

  // preparation: organisation and research first (stronger AIs invest early)
  if (state.stage === 'preparation') {
    const homes = p.homeStates.length ? p.homeStates : [targets[0]?.state].filter(Boolean) as string[];
    for (const st of homes.slice(0, 1 + Math.round(q * 2))) {
      const b = Math.min(50, Math.max(3, Math.round(budget * 0.25)));
      if (b <= budget && tryAdd({ type: 'org_build', state: st, budget: b })) budget -= b;
    }
    if (q > 0.6 && Math.abs(state.pollBias[partyId] ?? 0) > 0.03 && homes[0]) tryAdd({ type: 'research', state: homes[0] });
  }

  // state-level plan: campaign where the party has the most at stake, and answer human
  // players' statewide pushes where the AI is in contention
  const stateVal = new Map<string, number>();
  for (const t of targets.slice(0, 60)) stateVal.set(t.state, (stateVal.get(t.state) ?? 0) + t.v);
  for (const h of human) {
    if (h === partyId) continue;
    for (const [code, st] of Object.entries(state.states)) {
      const hs = st.spendLog?.[h] ?? 0;
      if (hs > 5 && stateVal.has(code)) stateVal.set(code, stateVal.get(code)! + (hs / 20) * q * p.ai.aggression);
    }
  }
  const stTargets = [...stateVal.entries()].sort((a, b) => b[1] - a[1]);
  const stateIssue = (code: string): Issue => {
    const st = state.states[code];
    const cands = [st.primary, ...(st.secondary ?? [])].filter(Boolean) as Issue[];
    if (!cands.length || rng.next() > q + 0.2) return bestIssue(state, p, rng, q);
    return cands.sort((a, b) => stateMessageFit(state, p, b, code) - stateMessageFit(state, p, a, code))[0];
  };
  for (const [code] of stTargets.slice(0, 1 + Math.round(q * 2))) {
    if (budget < 4) break;
    const n = stateSeats(state, code, partyId).length;
    const b = Math.round(clamp(budget * 0.3, 2, Math.min(60, n * 2 + 4)));
    const mode: StateCampaignMode = state.stage === 'preparation' ? 'offices' : final ? 'ground' : rng.next() < 0.5 ? 'rallies' : 'media';
    if (tryAdd({ type: 'state_campaign', state: code, issue: stateIssue(code), budget: b, mode })) budget -= b;
  }
  // campaigners on tour: regional figures mostly at home, national ones where it is close
  for (const l of p.leaders ?? []) {
    for (let d = 0; d < l.days; d++) {
      if (budget < TOUR_COST + 1) break;
      const code = l.reach === 'regional' && stateVal.has(l.home) && rng.next() < 0.65 ? l.home : stTargets[(d + rng.int(0, 2)) % Math.max(1, Math.min(4, stTargets.length))]?.[0];
      if (!code) break;
      const own = state.states[code].primary;
      const issue = own && l.strong.includes(own) ? own : l.strong[rng.int(0, l.strong.length - 1)] ?? stateIssue(code);
      if (tryAdd({ type: 'leader_tour', state: code, leaderId: l.id, issue, tour: 'statewide' })) budget -= TOUR_COST;
    }
  }

  // leader rallies at the best targets
  const ld = leaderDays(p);
  let used = 0;
  for (const t of targets) {
    if (used >= ld) break;
    if (budget < 6) break;
    if (tryAdd({ type: 'rally', constituency: t.id, speaker: 'leader', issue: bestIssue(state, p, rng, q, t.id) })) { used++; budget -= 6.5; }
  }
  // ground game in the next tier
  for (const t of targets.slice(used, used + 14)) {
    if (budget < 0.6) break;
    const c = state.seats.find((x) => x.id === t.id)!;
    const useDoor = (c.org[partyId] ?? 0) > 0.3 && (final || rng.next() < 0.5);
    const ok = useDoor ? tryAdd({ type: 'door_to_door', constituency: t.id }) : tryAdd({ type: 'town_hall', constituency: t.id, issue: bestIssue(state, p, rng, q, t.id) });
    if (ok) budget -= useDoor ? 0.6 : 0.4;
  }
  // digital in the state with the most targets
  const byState = new Map<string, number>();
  for (const t of targets.slice(0, 30)) byState.set(t.state, (byState.get(t.state) ?? 0) + t.v);
  const topStates = [...byState.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1 + Math.round(q));
  for (const [st] of topStates) {
    const b = Math.min(40, Math.max(2, Math.round(budget * 0.35)));
    if (budget >= 2 && tryAdd({ type: 'digital', state: st, budget: b, issue: bestIssue(state, p, rng, q) })) budget -= b;
  }
  if (p.stats.volunteerMorale < 0.5 && topStates[0]) tryAdd({ type: 'volunteer_drive', state: topStates[0][0] });
  return actions;
}
