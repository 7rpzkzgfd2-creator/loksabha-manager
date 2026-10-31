// Campaign actions. Validation is pure and shared by the UI, the AI and the multiplayer
// server. Resolution writes to intermediate state (persuasion, mobilisation, org, mood,
// media, saturation...) and never adds a fixed number of votes. Outcomes depend on local
// organisation, candidate, message fit, saturation, competing news, staff and luck.

import { ISSUES, POLICY_BY_ID } from './data/catalog.ts';
import { STATE_BY_CODE } from './setup.ts';
import { clamp, uid } from './rng.ts';
import type { Rng } from './rng.ts';
import type { ActionOutcome, ActionType, CampaignAction, Constituency, GameState, Issue, Party } from './types.ts';
import { candidateAppeal } from './voters.ts';
import { leaderDays, staffSkill, teamCapacity } from './party.ts';
import { remember, report, schedule } from './world.ts';
import { resolveLeaderTour, resolveStateCampaign, STATE_CAMPAIGN_RANGE, TOUR_COST } from './statecampaign.ts';

export interface ActionSpec {
  type: ActionType;
  name: string;
  scope: 'constituency' | 'state' | 'national';
  baseCost: number; // crore
  leaderDays: number; // when the leader speaks
  team: number; // team capacity units
  scalable?: [number, number]; // min/max budget
  needsIssue?: boolean;
  desc: string;
}

export const ACTIONS: Record<ActionType, ActionSpec> = {
  rally: { type: 'rally', name: 'Public rally', scope: 'constituency', baseCost: 2.5, leaderDays: 1, team: 2, needsIssue: true, desc: 'Big crowd, big visibility. Fires up supporters; persuasion depends on the message and the speaker. Crowds tire of repeat visits.' },
  town_hall: { type: 'town_hall', name: 'Town-hall meeting', scope: 'constituency', baseCost: 0.4, leaderDays: 0, team: 1, needsIssue: true, desc: 'Small, focused, cheap. Persuades the segments who care about the chosen issue. Little media.' },
  door_to_door: { type: 'door_to_door', name: 'Door-to-door drive', scope: 'constituency', baseCost: 0.6, leaderDays: 0, team: 2, desc: 'Volunteers knock on doors. Strong on turnout of your own supporters; only works where you have an organisation.' },
  roadshow: { type: 'roadshow', name: 'Roadshow', scope: 'state', baseCost: 4, leaderDays: 1, team: 2, desc: 'A day-long procession across several seats in one state. Spreads visibility thin.' },
  press_conference: { type: 'press_conference', name: 'Press conference', scope: 'national', baseCost: 0.3, leaderDays: 1, team: 0, needsIssue: true, desc: 'Push an issue into the national conversation. Hostile questions can backfire.' },
  digital: { type: 'digital', name: 'Digital campaign', scope: 'state', baseCost: 0, leaderDays: 0, team: 1, scalable: [2, 40], needsIssue: true, desc: 'Paid and organic online reach in one state. Strong with young and urban voters, weak elsewhere, diminishing returns.' },
  org_build: { type: 'org_build', name: 'Build organisation', scope: 'state', baseCost: 0, leaderDays: 0, team: 1, scalable: [3, 50], desc: 'Hire organisers and open booth committees. Slow: most of the effect lands over the next few weeks and lasts beyond this election.' },
  research: { type: 'research', name: 'Commission research', scope: 'state', baseCost: 1.5, leaderDays: 0, team: 0, desc: 'Private polling and candidate vetting in a state. Narrows your forecast error and can expose risky candidates.' },
  policy_announce: { type: 'policy_announce', name: 'Announce a policy', scope: 'national', baseCost: 1, leaderDays: 1, team: 0, desc: 'Add a policy to the manifesto mid-campaign. Late promises look opportunistic if they clash with your record.' },
  state_campaign: { type: 'state_campaign', name: 'State campaign', scope: 'state', baseCost: 0, leaderDays: 0, team: 1, scalable: STATE_CAMPAIGN_RANGE, needsIssue: true, desc: 'One plan for a whole state: rally circuit, media, ground game or offices. The effect is shared statewide and spread seat by seat according to local issues, candidates and how close each seat is.' },
  leader_tour: { type: 'leader_tour', name: 'Leader tour', scope: 'state', baseCost: TOUR_COST, leaderDays: 0, team: 0, needsIssue: true, desc: 'Send one of your campaigners to a state, statewide or to up to three seats. Each campaigner has limited days, pulls hardest at home, and repeat visits matter less.' },
  volunteer_drive: { type: 'volunteer_drive', name: 'Volunteer drive', scope: 'state', baseCost: 1, leaderDays: 0, team: 1, desc: 'Recruit and re-energise volunteers in a state. Raises morale and local organisation a little.' },
};

export function actionCost(a: CampaignAction, p: Party): number {
  const spec = ACTIONS[a.type];
  let cost = spec.baseCost + (spec.scalable ? clamp(a.budget ?? spec.scalable[0], spec.scalable[0], spec.scalable[1]) : 0);
  if (a.type === 'rally' && a.speaker === 'leader') cost += 3.5;
  if (a.type === 'rally' && p.national) cost *= 1.1;
  return Math.round(cost * 100) / 100;
}

export function usesLeader(a: CampaignAction): boolean {
  return ACTIONS[a.type].leaderDays > 0 && (a.type !== 'rally' || a.speaker === 'leader');
}

export interface Usage { funds: number; leaderDays: number; team: number }

export function usage(state: GameState, party: string, actions: CampaignAction[]): Usage {
  const p = state.parties[party];
  let funds = 0, ld = 0, team = 0;
  for (const a of actions) {
    funds += actionCost(a, p);
    if (usesLeader(a)) ld += ACTIONS[a.type].leaderDays;
    team += ACTIONS[a.type].team;
  }
  return { funds, leaderDays: ld, team };
}

export function limits(state: GameState, party: string) {
  const p = state.parties[party];
  return { funds: p.stats.funds, leaderDays: leaderDays(p), team: teamCapacity(p) };
}

// Pure validation against the current state plus actions already queued this turn.
export function validateAction(state: GameState, a: CampaignAction, queued: CampaignAction[] = []): string | null {
  const p = state.parties[a.party];
  if (!p) return 'Unknown party.';
  if (state.phase !== 'campaign') return 'Campaign actions are only possible during the campaign.';
  if (!ACTIONS[a.type]) return 'Unknown action.';
  if (queued.some((q) => q.id === a.id)) return 'Duplicate action.';
  const spec = ACTIONS[a.type];
  if (spec.scope === 'constituency') {
    const c = state.seats.find((x) => x.id === a.constituency);
    if (!c) return 'Pick a constituency.';
    if (a.type === 'rally' && a.speaker !== 'leader' && !c.candidates[a.party]) return 'You have no candidate here to headline a rally.';
    if (a.type === 'door_to_door' && (c.org[a.party] ?? 0) < 0.12) return 'Not enough local organisation for door-to-door work here.';
  }
  if (spec.scope === 'state' && !STATE_BY_CODE[a.state ?? '']) return 'Pick a state.';
  if (spec.needsIssue && !ISSUES.some((i) => i.id === a.issue)) return 'Pick an issue to campaign on.';
  if (a.type === 'policy_announce') {
    if (!a.policy || !POLICY_BY_ID[a.policy]) return 'Pick a policy.';
    if (p.manifesto.policies.includes(a.policy)) return 'Already in the manifesto.';
    if (state.stage === 'preparation') return 'During preparation, edit the manifesto directly instead.';
  }
  if (spec.scalable && (a.budget === undefined || a.budget < spec.scalable[0] || a.budget > spec.scalable[1])) return `Budget must be between ₹${spec.scalable[0]} and ₹${spec.scalable[1]} crore.`;
  if (a.type === 'state_campaign') {
    if (!a.mode || !['rallies', 'media', 'ground', 'offices'].includes(a.mode)) return 'Pick a campaign type.';
    if (!state.seats.some((c) => c.state === a.state && c.candidates[a.party])) return 'You have no candidates in this state.';
    if ((a.seats?.length ?? 0) > 3) return 'At most three priority seats.';
    if (a.seats?.some((id) => !state.seats.some((c) => c.id === id && c.state === a.state))) return 'Priority seats must be in the same state.';
    if (p.controlledBy === 'human') {
      const alloc = p.stateBudget?.[a.state!] ?? 0;
      const spent = (p.stateSpent?.[a.state!] ?? 0) + queued.filter((q) => q.state === a.state && q.type === 'state_campaign').reduce((s, q) => s + actionCost(q, p), 0);
      if (alloc <= 0) return 'Set a budget for this state first.';
      if (spent + (a.budget ?? 0) > alloc + 1e-9) return `Only ₹${Math.max(0, Math.round((alloc - spent) * 10) / 10)} cr left in this state's budget.`;
    }
  }
  if (a.type === 'leader_tour') {
    const l = p.leaders?.find((x) => x.id === a.leaderId);
    if (!l) return 'Pick a campaigner.';
    const used = queued.filter((q) => q.type === 'leader_tour' && q.leaderId === a.leaderId).length;
    if (used >= l.days) return `${l.name} has no free days left this week.`;
    if (!state.seats.some((c) => c.state === a.state && c.candidates[a.party])) return 'You have no candidates in this state.';
    if (a.tour === 'targeted') {
      if (!a.seats?.length || a.seats.length > 3) return 'Pick one to three seats for a targeted visit.';
      if (a.seats.some((id) => !state.seats.some((c) => c.id === id && c.state === a.state && c.candidates[a.party]))) return 'Targeted seats must be ones you contest in this state.';
    }
  }
  const u = usage(state, a.party, [...queued, a]);
  const lim = limits(state, a.party);
  if (u.funds > lim.funds + 1e-9) return 'Not enough money in the war chest.';
  if (u.leaderDays > lim.leaderDays) return 'Your leader has no free days left this week.';
  if (u.team > lim.team) return 'Your campaign team is at capacity this week.';
  return null;
}

// Estimates shown to the player before committing: ranges, not promises.
export function estimate(state: GameState, a: CampaignAction): { label: string; lo: number; hi: number; notes: string[] } {
  const p = state.parties[a.party];
  const notes: string[] = [];
  if (a.constituency) {
    const c = state.seats.find((x) => x.id === a.constituency)!;
    const sat = c.saturation[a.party] ?? 0;
    const org = c.org[a.party] ?? 0;
    if (sat > 0.4) notes.push(`Audience fatigue is high here (${Math.round(sat * 100)}%). Expect diminishing returns.`);
    if (org < 0.25) notes.push('Weak local organisation: turnout and crowd-building will suffer.');
    const fc = state.seatForecast[c.id];
    if (fc && (fc.probs[a.party] ?? 0) > 0.92) notes.push('You are already very likely to win this seat. Effort here mostly lifts morale.');
    if (fc && (fc.probs[a.party] ?? 0) < 0.03) notes.push('You are very unlikely to win here this time. Effort may still build for the future.');
    if (a.issue && !c.localIssues.includes(a.issue) && (state.salience[a.issue] ?? 0.4) < 0.5) notes.push('This issue is not a local priority here.');
    const base = a.type === 'rally' ? 0.6 : a.type === 'town_hall' ? 0.35 : 0.45;
    const q = base * (1 - sat) * (0.5 + org);
    return { label: 'Expected effect on local standing', lo: Math.round((q - 0.35) * 10) / 10, hi: Math.round((q + 0.3) * 10) / 10, notes };
  }
  if (a.type === 'digital' && a.state) {
    const st = state.states[a.state];
    if ((st.airwar[a.party] ?? 0) > 0.08) notes.push('You already dominate the feed here; extra money buys less.');
    notes.push('Mostly reaches urban and young voters.');
  }
  if (a.type === 'org_build') notes.push('Most of the effect arrives over the next 2-3 weeks and persists.');
  if (a.type === 'policy_announce' && a.policy) {
    const pol = POLICY_BY_ID[a.policy];
    const clash = Math.abs(pol.econ - p.ideology.econ) + Math.abs(pol.social - p.ideology.social);
    if (clash > 1) notes.push('This clashes with your party’s known positions. Credibility may suffer.');
    if (pol.cost >= 4 && p.stats.fiscalCredibility < 0.5) notes.push('Expensive promise and the party is not trusted on money.');
  }
  return { label: 'Outcome uncertain', lo: -0.3, hi: 0.6, notes };
}

// Persuasion works best where voters are genuinely undecided between you and a rival, and
// barely matters where you are already far ahead or hopelessly behind.
export function swingFactor(state: GameState, c: Constituency, party: string): number {
  const pr = state.seatForecast[c.id]?.probs[party];
  if (pr === undefined) return 1;
  return 0.55 + 0.9 * (1 - Math.abs(pr - 0.5) * 2);
}

function competingNews(state: GameState): number {
  return clamp(state.events.filter((e) => e.turn === state.turn && e.visibility === 'public').reduce((a, e) => a + e.severity, 0) * 0.4, 0, 0.6);
}

// How strongly a message on `issue` lands with this constituency's voters for this party.
export function messageFit(state: GameState, p: Party, issue: Issue, c?: Constituency): number {
  const own = p.issueOwn[issue] ?? 0.4;
  const sal = (state.salience[issue] ?? 0.45) + (c && c.localIssues.includes(issue) ? 0.35 : 0) + (c ? (state.states[c.state].salience[issue] ?? 0) * 0.5 : 0);
  return clamp(0.15 + own * 0.5 + sal * 0.45, 0, 1.4);
}

function polarisationBacklash(state: GameState, p: Party, issue: Issue, c: Constituency, rng: Rng): number {
  const pol = ISSUES.find((i) => i.id === issue)?.polarising ?? 0;
  if (pol < 0.2) return 0;
  // Polarising messages energise some and alienate others: shown as a hit on persuasion
  // in diverse, urban seats where the party is not dominant.
  const dominance = c.base[p.id] ?? 0;
  return pol * (0.4 - Math.min(dominance, 0.4)) * (0.5 + c.urban) * rng.range(0.5, 1.3) * 0.25;
}

export function resolveAction(state: GameState, a: CampaignAction, rng: Rng): ActionOutcome {
  const p = state.parties[a.party];
  const cost = actionCost(a, p);
  p.stats.funds = Math.round((p.stats.funds - cost) * 100) / 100;
  const out: ActionOutcome = { actionId: a.id, party: a.party, type: a.type, turn: state.turn, where: '', constituency: a.constituency, state: a.state, cost, reported: '', quality: 0, notes: [] };
  const comms = staffSkill(p, 'communications');
  const noise = competingNews(state);
  const gaffeMul = p.controlledBy === 'human' && state.config.difficulty === 'easy' ? 0.6 : 1;
  for (const s of p.staff) if (s.role === 'campaign_manager' || s.role === 'communications') s.workload += 1;

  if (a.type === 'rally' || a.type === 'town_hall' || a.type === 'door_to_door') {
    const c = state.seats.find((x) => x.id === a.constituency)!;
    out.where = `${c.name}, ${STATE_BY_CODE[c.state].name}`;
    const org = c.org[a.party] ?? 0;
    const sat = c.saturation[a.party] ?? 0;
    const cand = c.candidates[a.party];
    c.visits[a.party] = (c.visits[a.party] ?? 0) + 1;
    c.spend[a.party] = (c.spend[a.party] ?? 0) + cost;

    if (a.type === 'rally') {
      const speakerPull = a.speaker === 'leader' ? p.stats.leaderPop * (0.6 + p.stats.media * 0.6) : candidateAppeal(c, a.party) * 0.8;
      const crowdBase = 8000 + 60000 * speakerPull * (0.4 + org) * (1 - sat * 0.7);
      const attendance = Math.round(crowdBase * rng.range(0.6, 1.35) * (1 - state.states[c.state].disaster * 0.5));
      // local organisers like to round up; low cohesion and weak analysts make it worse
      const exaggeration = clamp(0.1 + (1 - p.stats.cohesion) * 0.5 - staffSkill(p, 'data_analyst') * 0.3 + rng.range(-0.05, 0.25), 0, 0.8);
      out.attendance = attendance;
      out.reportedAttendance = Math.round(attendance * (1 + exaggeration) / 1000) * 1000;
      const fit = messageFit(state, p, a.issue!, c);
      const resonance = clamp(fit * (0.55 + speakerPull * 0.6) * (1 - noise) * (1 - sat) + rng.normal(0, 0.18), -0.4, 1.4);
      let persuasion = resonance * 0.08 * (0.6 + comms * 0.6) * swingFactor(state, c, p.id);
      const backlash = polarisationBacklash(state, p, a.issue!, c, rng);
      persuasion -= backlash;
      const mobil = clamp(attendance / 150000, 0, 0.5) * 0.06 * (1 - sat * 0.5);
      // gaffe risk: tired leaders, firebrand candidates, weak comms
      const gaffeP = (0.04 + sat * 0.08 + (a.speaker === 'leader' ? (p.leaderStyle === 'combative' || p.leaderStyle === 'populist' ? 0.05 : 0.02) : (cand?.profile === 'firebrand' ? 0.1 : 0.03)) - comms * 0.05) * gaffeMul;
      let gaffe = false;
      if (rng.chance(Math.max(0.01, gaffeP))) {
        gaffe = true;
        persuasion -= 0.05;
        p.stats.trust = clamp(p.stats.trust - 0.01);
        state.states[c.state].mood[a.party] = (state.states[c.state].mood[a.party] ?? 0) - 0.015;
        out.notes.push('A line from the speech is being clipped and circulated out of context.');
        report(state, rng, { headline: `Remark at ${p.short} rally in ${c.name} draws fire`, fact: `A remark at a ${p.short} rally in ${c.name} drew criticism from rivals.`, parties: [p.id], tone: -0.4, region: STATE_BY_CODE[c.state].region });
      }
      c.pending[a.party] = (c.pending[a.party] ?? 0) + persuasion; // lands next turn: attention takes time to become votes
      c.mobilisation[a.party] = (c.mobilisation[a.party] ?? 0) + mobil;
      c.saturation[a.party] = clamp(sat + 0.22);
      if (a.speaker === 'leader') {
        // leader rallies spill over the state through coverage
        const st = state.states[c.state];
        st.mood[a.party] = (st.mood[a.party] ?? 0) + persuasion * 0.12;
        p.stats.media = clamp(p.stats.media + 0.005);
      }
      p.stats.volunteerMorale = clamp(p.stats.volunteerMorale + 0.01);
      out.quality = clamp(persuasion * 12 + mobil * 6, -1, 1);
      out.reported = `Organisers report a crowd of about ${out.reportedAttendance.toLocaleString('en-IN')}. ${resonance > 0.8 ? 'The speech landed well.' : resonance > 0.4 ? 'A respectable reception.' : 'The crowd was restless; the message did not catch.'}${backlash > 0.02 ? ' Some local voices objected to the tone.' : ''}`;
      if (noise > 0.3) out.notes.push('Coverage was drowned out by other news this week.');
      if (sat > 0.45) out.notes.push('Many in the crowd had seen this pitch before.');
      if (!gaffe && resonance > 1 && rng.chance(0.4)) report(state, rng, { headline: `Packed ground in ${c.name} as ${p.short} pitches on ${ISSUES.find((i) => i.id === a.issue)!.name.toLowerCase()}`, fact: `${p.short} held a rally in ${c.name}.`, parties: [p.id], tone: 0.3, region: STATE_BY_CODE[c.state].region });
    } else if (a.type === 'town_hall') {
      const fit = messageFit(state, p, a.issue!, c);
      const cAppeal = candidateAppeal(c, a.party);
      const q = clamp(fit * (0.5 + cAppeal * 0.7) * (1 - sat * 0.8) + rng.normal(0, 0.15), -0.3, 1.3);
      const persuasion = q * 0.09 * (0.7 + comms * 0.4) * swingFactor(state, c, p.id) - polarisationBacklash(state, p, a.issue!, c, rng) * 0.5;
      c.pending[a.party] = (c.pending[a.party] ?? 0) + persuasion;
      c.saturation[a.party] = clamp(sat + 0.08);
      out.quality = clamp(persuasion * 25, -1, 1);
      out.reported = q > 0.7 ? 'Good questions, good answers. Local notables asked to stay in touch.' : q > 0.3 ? 'A modest turnout but a useful conversation.' : 'Thin attendance and a couple of hostile questions.';
    } else {
      const vol = staffSkill(p, 'volunteer_coordinator');
      const reach = org * (0.5 + p.stats.volunteerMorale) * (0.7 + vol * 0.6);
      const mobil = clamp(reach * 0.08 * (1 - sat * 0.4) + rng.normal(0, 0.008), -0.005, 0.1);
      c.mobilisation[a.party] = (c.mobilisation[a.party] ?? 0) + mobil;
      c.pending[a.party] = (c.pending[a.party] ?? 0) + reach * 0.008;
      c.org[a.party] = clamp(org + 0.01);
      c.saturation[a.party] = clamp(sat + 0.06);
      p.stats.volunteerMorale = clamp(p.stats.volunteerMorale - 0.01);
      out.quality = clamp(mobil * 18, -1, 1);
      out.reported = `Volunteers covered ${Math.round(reach * 40000).toLocaleString('en-IN')} households. ${mobil > 0.03 ? 'Supporters say they will turn out.' : 'Many doors stayed shut.'}`;
    }
  } else if (a.type === 'roadshow') {
    const st = state.states[a.state!];
    out.where = STATE_BY_CODE[a.state!].name;
    const seats = state.seats.filter((c) => c.state === a.state && c.candidates[a.party]);
    const q = clamp(p.stats.leaderPop * (0.6 + p.stats.media * 0.5) * (1 - competingNews(state)) + rng.normal(0, 0.15), -0.2, 1.2);
    st.mood[a.party] = (st.mood[a.party] ?? 0) + q * 0.012;
    const pick = seats.sort(() => rng.next() - 0.5).slice(0, 5);
    for (const c of pick) {
      c.mobilisation[a.party] = (c.mobilisation[a.party] ?? 0) + q * 0.01 * (1 - (c.saturation[a.party] ?? 0));
      c.saturation[a.party] = clamp((c.saturation[a.party] ?? 0) + 0.07);
      c.visits[a.party] = (c.visits[a.party] ?? 0) + 1;
    }
    out.quality = clamp(q - 0.4, -1, 1);
    out.reported = `The roadshow passed through ${pick.map((c) => c.name).join(', ') || 'the state'}. ${q > 0.7 ? 'Crowds lined the route.' : 'Turnout along the route was patchy.'}`;
  } else if (a.type === 'press_conference') {
    out.where = 'New Delhi';
    const fit = messageFit(state, p, a.issue!);
    const hostile = rng.next() < 0.25 + (1 - p.stats.trust) * 0.3 - comms * 0.15;
    const q = clamp(fit * (0.5 + p.stats.media * 0.5) + (hostile ? -0.6 : 0) + rng.normal(0, 0.15), -1, 1.2);
    state.salience[a.issue!] = clamp((state.salience[a.issue!] ?? 0.45) + 0.04 * Math.max(0, q));
    if (q > 0) p.issueOwn[a.issue!] = clamp(p.issueOwn[a.issue!] + 0.01 * q);
    p.stats.popularity += q * 0.006;
    p.stats.media = clamp(p.stats.media + 0.01);
    if (hostile) {
      p.stats.trust = clamp(p.stats.trust - 0.01);
      out.notes.push('Reporters pressed on an awkward subject and the answer did not satisfy.');
      report(state, rng, { headline: `${p.short} press meet derailed by tough questions`, fact: `${p.short} leaders faced questions at a press conference.`, parties: [p.id], tone: -0.3 });
    }
    out.quality = clamp(q - 0.3, -1, 1);
    out.reported = q > 0.6 ? 'The message led the evening bulletins.' : q > 0.2 ? 'Picked up, but competing with other stories.' : 'Coverage focused on something else entirely.';
  } else if (a.type === 'digital') {
    const st = state.states[a.state!];
    out.where = STATE_BY_CODE[a.state!].name;
    const seats = state.seats.filter((c) => c.state === a.state).length;
    const per = (a.budget ?? 2) / Math.max(1, seats);
    const current = st.airwar[a.party] ?? 0;
    const fit = messageFit(state, p, a.issue!);
    const add = Math.log1p(per * 1.5) * 0.035 * fit * (1 - clamp(current * 6, 0, 0.8)) * rng.range(0.6, 1.3) * (0.7 + comms * 0.5);
    st.airwar[a.party] = current + add;
    if (rng.chance(0.06)) {
      st.airwar[a.party] -= add * 1.5;
      out.notes.push('One creative was called misleading by fact-checkers and pulled.');
      report(state, rng, { headline: `Fact-checkers flag ${p.short} ad in ${out.where}`, fact: `An online ad by ${p.short} was disputed by fact-checkers.`, parties: [p.id], tone: -0.25 });
    }
    out.quality = clamp(add * 15, -1, 1);
    out.reported = `Campaign reached an estimated ${(Math.round(add * 4000) / 10).toFixed(1)}M impressions in ${out.where}.`;
  } else if (a.type === 'org_build') {
    out.where = STATE_BY_CODE[a.state!].name;
    const coord = staffSkill(p, 'regional_coordinator', a.state);
    const strength = Math.log1p((a.budget ?? 3) / 4) * 0.04 * (0.7 + coord * 0.6) * (0.6 + p.stats.cohesion * 0.6);
    for (const c of state.seats) if (c.state === a.state) c.org[a.party] = clamp((c.org[a.party] ?? 0) + strength * 0.25);
    schedule(state, rng, { dueTurn: state.turn + 2, kind: 'org_growth', party: p.id, params: { state: a.state!, amount: strength * 0.45 }, note: `Booth committees in ${out.where} come online` });
    schedule(state, rng, { dueTurn: state.turn + 3, kind: 'org_growth', party: p.id, params: { state: a.state!, amount: strength * 0.3 }, note: `Second wave of organisers in ${out.where}` });
    remember(state, rng, { kind: 'organisation', party: p.id, text: `Invested ₹${a.budget} cr in organisation in ${out.where}.`, weight: 0.3 });
    out.quality = clamp(strength * 8, -1, 1);
    out.reported = `Recruitment underway in ${out.where}. Most of the effect will show in two to three weeks.`;
  } else if (a.type === 'research') {
    out.where = STATE_BY_CODE[a.state!].name;
    state.pollBias[p.id] = (state.pollBias[p.id] ?? 0) * 0.85;
    let flagged = 0;
    for (const c of state.seats) {
      if (c.state !== a.state) continue;
      const k = c.candidates[p.id];
      if (k && !k.vetted) { k.vetted = true; if (k.controversy > 0.4) flagged++; }
    }
    out.quality = 0.2;
    out.reported = `Private polling and vetting done in ${out.where}.${flagged ? ` ${flagged} of our candidates carry a real risk of controversy.` : ' No red flags on our candidates.'}`;
  } else if (a.type === 'policy_announce') {
    out.where = 'National';
    const pol = POLICY_BY_ID[a.policy!];
    p.manifesto.policies.push(pol.id);
    p.manifesto.announcedTurn[pol.id] = state.turn;
    const clash = Math.abs(pol.econ - p.ideology.econ) + Math.abs(pol.social - p.ideology.social);
    const late = state.stage === 'final_push' ? 0.06 : 0.02;
    p.manifesto.credibility = clamp(p.manifesto.credibility - late - (clash > 1 ? 0.08 : 0) - (pol.cost >= 4 ? (0.5 - p.stats.fiscalCredibility) * 0.1 : 0));
    p.issueOwn[pol.issue] = clamp(p.issueOwn[pol.issue] + 0.04 * p.manifesto.credibility);
    state.salience[pol.issue] = clamp((state.salience[pol.issue] ?? 0.45) + 0.03);
    remember(state, rng, { kind: 'promise', party: p.id, text: `Promised: ${pol.name}.`, weight: 0.5 + pol.cost * 0.1 });
    if (clash > 1) {
      remember(state, rng, { kind: 'reversal', party: p.id, text: `Announced ${pol.name}, at odds with past positions.`, weight: 0.5 });
      report(state, rng, { headline: `U-turn? ${p.short} embraces ${pol.name.toLowerCase()}`, fact: `${p.short} added ${pol.name} to its manifesto.`, parties: [p.id], tone: -0.2 });
    } else report(state, rng, { headline: `${p.short} promises ${pol.name.toLowerCase()}`, fact: `${p.short} added ${pol.name} to its manifesto.`, parties: [p.id], tone: 0.15 });
    out.quality = clamp(0.3 - clash * 0.2, -1, 1);
    out.reported = `${pol.name} is now part of our platform.`;
  } else if (a.type === 'state_campaign') {
    resolveStateCampaign(state, a, p, rng, out);
  } else if (a.type === 'leader_tour') {
    resolveLeaderTour(state, a, p, rng, out);
  } else if (a.type === 'volunteer_drive') {
    out.where = STATE_BY_CODE[a.state!].name;
    const vol = staffSkill(p, 'volunteer_coordinator');
    p.stats.volunteerMorale = clamp(p.stats.volunteerMorale + 0.04 + vol * 0.04);
    for (const c of state.seats) if (c.state === a.state && c.candidates[p.id]) c.org[p.id] = clamp((c.org[p.id] ?? 0) + 0.008 + vol * 0.01);
    out.quality = 0.3;
    out.reported = `Volunteers signed up across ${out.where}. Morale is up.`;
  }
  return out;
}

export function newActionId(rng: Rng) { return uid(rng, 'act'); }
