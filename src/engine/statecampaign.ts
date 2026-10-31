// State-level campaigning. The player plans at the state level; the effect of every state
// action is still applied seat by seat, according to each seat's issues, voters, candidate,
// organisation and competitiveness.
//
// Double counting is avoided by splitting each action's effect into two disjoint parts:
// a statewide share (state mood, air war, issue credibility in the state) and a local share
// that is distributed across seats with weights normalised to average 1. A seat never
// receives the statewide share and then the full local amount again on top.
//
// Money has diminishing returns everywhere: spend per seat goes through log1p, and repeated
// campaigning in a state raises a saturation level that cuts further effect.

import { ISSUE_NAME, SEGMENT_BY_ID } from './data/catalog.ts';
import { STATE_BY_CODE } from './setup.ts';
import { clamp } from './rng.ts';
import type { Rng } from './rng.ts';
import type { ActionOutcome, CampaignAction, Candidate, Constituency, GameState, Issue, Party, PartyLeader, SeatForecast, StateCampaignMode } from './types.ts';
import { staffSkill } from './party.ts';
import { report, schedule } from './world.ts';
import { candidateAppeal, candidateIssueFit, K_CAND, K_CAND_ISSUE, K_SENTIMENT, salienceFor } from './voters.ts';
import { rankIssues, sentimentShift, traitLevel } from './traits.ts';

export const STATE_MODES: Record<StateCampaignMode, { name: string; desc: string; stateShare: number }> = {
  rallies: { name: 'Rally circuit', desc: 'Public meetings across the state. Persuades and fires up supporters; strongest where your candidates are credible on the message.', stateShare: 0.35 },
  media: { name: 'Media & digital', desc: 'TV, print and online in the state. Wide reach, mostly urban and young voters, mostly a statewide effect.', stateShare: 0.6 },
  ground: { name: 'Ground game', desc: 'Volunteers and booth workers. Mostly turnout of your own voters; only works where you have an organisation.', stateShare: 0.15 },
  offices: { name: 'Campaign offices', desc: 'Open offices and booth committees. Slow: builds organisation over the next weeks and beyond this election.', stateShare: 0.1 },
};

export const STATE_CAMPAIGN_RANGE: [number, number] = [2, 60];
export const TOUR_COST = 2;

export function stateSeats(state: GameState, code: string, party: string): Constituency[] {
  return state.seats.filter((c) => c.state === code && c.candidates[party]);
}

// Swing weight mirrors actions.swingFactor (kept local to avoid an import cycle).
function swing(state: GameState, c: Constituency, party: string): number {
  const pr = state.seatForecast[c.id]?.probs[party];
  if (pr === undefined) return 1;
  return 0.55 + 0.9 * (1 - Math.abs(pr - 0.5) * 2);
}

// How credible the party's message on this issue is in this state.
export function stateMessageFit(state: GameState, p: Party, issue: Issue, code: string): number {
  const st = state.states[code];
  const own = (p.issueOwn[issue] ?? 0.4) + (st.cred?.[p.id]?.[issue] ?? 0);
  const imp = st.salience[issue] ?? 0.2;
  return clamp(0.2 + own * 0.5 + imp * 0.45, 0.15, 1.35);
}

function localWeight(state: GameState, c: Constituency, a: CampaignAction, mode: StateCampaignMode): number {
  const issue = a.issue!;
  let w = 0.5 + (c.localIssues.includes(issue) ? 0.6 : 0) + (state.states[c.state].salience[issue] ?? 0) * 0.3;
  if (a.target) {
    const seg = c.segments.find((s) => s.id === a.target)?.w ?? 0;
    w *= 0.4 + seg * 4;
  }
  // a candidate strong on the message amplifies it; one weak on it undercuts it
  w *= clamp(1 + 0.6 * traitLevel(c.candidates[a.party], issue), 0.4, 1.6);
  w *= swing(state, c, a.party);
  if (mode === 'ground' || mode === 'offices') w *= 0.4 + (c.org[a.party] ?? 0) * 1.4;
  if (a.seats?.includes(c.id)) w *= 2.5;
  w *= 1 - (c.saturation[a.party] ?? 0) * 0.5;
  return Math.max(0.01, w);
}

function competingNews(state: GameState): number {
  return clamp(state.events.filter((e) => e.turn === state.turn && e.visibility === 'public').reduce((a, e) => a + e.severity, 0) * 0.4, 0, 0.6);
}

// Spread `total` across seats so that the weights average to 1 (conserves the total).
function distribute(seats: Constituency[], weights: number[], total: number, apply: (c: Constituency, amt: number, w: number) => void) {
  const sum = weights.reduce((x, y) => x + y, 0) || 1;
  seats.forEach((c, i) => apply(c, total * weights[i] / sum, weights[i] * seats.length / sum));
}

export function resolveStateCampaign(state: GameState, a: CampaignAction, p: Party, rng: Rng, out: ActionOutcome) {
  const code = a.state!;
  const st = state.states[code];
  const mode = a.mode ?? 'rallies';
  const spec = STATE_MODES[mode];
  const seats = stateSeats(state, code, p.id);
  const n = Math.max(1, seats.length);
  const budget = a.budget ?? STATE_CAMPAIGN_RANGE[0];
  const sat = st.campSat?.[p.id] ?? 0;
  const comms = staffSkill(p, 'communications');
  const perSeat = budget / n;
  const blitz = a.intensity === 'blitz';
  const effort = Math.log1p(perSeat / 0.6) * (1 - sat * 0.7) * (0.65 + comms * 0.5) * (blitz ? 1.25 : 1) * (1 - competingNews(state) * 0.5) * rng.range(0.8, 1.2) * (1 - st.disaster * 0.4);
  const fit = stateMessageFit(state, p, a.issue!, code);
  out.where = STATE_BY_CODE[code].name;

  const P = effort * fit * ({ rallies: 0.05, media: 0.04, ground: 0.025, offices: 0.01 })[mode];
  const M = effort * ({ rallies: 0.012, media: 0, ground: 0.03, offices: 0.004 })[mode];
  const credGain = effort * fit * ({ rallies: 0.012, media: 0.015, ground: 0.004, offices: 0.002 })[mode];
  const stateShare = spec.stateShare;

  // statewide share
  if (mode === 'media') st.airwar[p.id] = (st.airwar[p.id] ?? 0) + P * stateShare * 1.4;
  else st.mood[p.id] = (st.mood[p.id] ?? 0) + P * stateShare;
  st.cred ??= {};
  st.cred[p.id] ??= {};
  st.cred[p.id][a.issue!] = clamp((st.cred[p.id][a.issue!] ?? 0) + credGain, -0.3, 0.25);
  // talking about an issue raises it on the state agenda a little
  st.salience[a.issue!] = clamp((st.salience[a.issue!] ?? 0.2) + effort * 0.01, 0.05, 1.3);
  rankIssues(st);

  // local share, seat by seat
  const weights = seats.map((c) => localWeight(state, c, a, mode));
  distribute(seats, weights, P * (1 - stateShare) * n, (c, amt, w) => {
    c.pending[p.id] = (c.pending[p.id] ?? 0) + amt;
    c.saturation[p.id] = clamp((c.saturation[p.id] ?? 0) + 0.04 * w * (blitz ? 1.5 : 1));
    c.spend[p.id] = (c.spend[p.id] ?? 0) + budget * w / n;
  });
  if (M > 0) distribute(seats, weights, M * n, (c, amt) => { c.mobilisation[p.id] = (c.mobilisation[p.id] ?? 0) + amt; });
  if (mode === 'ground') for (const c of seats) c.org[p.id] = clamp((c.org[p.id] ?? 0) + effort * 0.006);
  if (mode === 'offices') {
    const strength = effort * 0.035 * (0.6 + p.stats.cohesion * 0.6);
    for (const c of seats) c.org[p.id] = clamp((c.org[p.id] ?? 0) + strength * 0.25);
    schedule(state, rng, { dueTurn: state.turn + 2, kind: 'org_growth', party: p.id, params: { state: code, amount: strength * 0.45 }, note: `New offices in ${out.where} start working` });
  }

  st.campSat ??= {};
  st.campSat[p.id] = clamp(sat + 0.3 * Math.min(2, perSeat) * (blitz ? 1.5 : 1));
  st.spendLog ??= {};
  st.spendLog[p.id] = (st.spendLog[p.id] ?? 0) + budget;
  p.stateSpent ??= {};
  p.stateSpent[code] = (p.stateSpent[code] ?? 0) + budget;

  const top = seats.map((c, i) => [c, weights[i]] as const).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c]) => c.name);
  out.quality = clamp(P * 14 - 0.1, -1, 1);
  out.reported = `${spec.name} in ${out.where} on ${ISSUE_NAME[a.issue!].toLowerCase()}${a.target ? ` aimed at ${SEGMENT_BY_ID[a.target].name.toLowerCase()}` : ''}. ${fit > 0.8 ? 'The message is landing.' : fit > 0.5 ? 'A fair hearing.' : 'Voters here are not sold on us on this.'} Strongest response in ${top.join(', ') || 'the state'}.`;
  if (sat > 0.45) out.notes.push('The state has heard a lot from us already; each extra rupee buys less.');
  const weakCands = seats.filter((c) => traitLevel(c.candidates[p.id], a.issue!) < -0.3).length;
  if (weakCands >= Math.max(2, n * 0.3)) out.notes.push(`${weakCands} of our candidates here are weak on this issue and undercut the message.`);
  if (rng.chance(0.25) && P > 0.03) report(state, rng, { headline: `${p.short} steps up ${ISSUE_NAME[a.issue!].toLowerCase()} pitch across ${out.where}`, fact: `${p.short} ran a statewide campaign in ${out.where}.`, parties: [p.id], tone: 0.15, region: STATE_BY_CODE[code].region });
}

export function leaderPull(l: PartyLeader, code: string): number {
  const pop = l.home === code ? l.homePop : l.awayPop * (l.reach === 'national' ? 1 : 0.6);
  return l.recognition * 0.4 + pop * 0.6;
}

export function resolveLeaderTour(state: GameState, a: CampaignAction, p: Party, rng: Rng, out: ActionOutcome) {
  const code = a.state!;
  const st = state.states[code];
  const l = p.leaders!.find((x) => x.id === a.leaderId)!;
  const visits = l.visits[code] ?? 0;
  const issueMul = l.strong.includes(a.issue!) ? 1.25 : l.weak.includes(a.issue!) ? 0.7 : 1;
  const q = leaderPull(l, code) * (0.5 + l.effect * 0.7) * issueMul / (1 + 0.5 * visits) * (1 - competingNews(state)) * rng.range(0.75, 1.25) * stateMessageFit(state, p, a.issue!, code);
  l.visits[code] = visits + 1;
  out.where = `${l.name} in ${STATE_BY_CODE[code].name}`;
  const seats = stateSeats(state, code, p.id);
  if (a.tour === 'targeted' && a.seats?.length) {
    const targets = seats.filter((c) => a.seats!.includes(c.id));
    for (const c of targets) {
      const sat = c.saturation[p.id] ?? 0;
      c.pending[p.id] = (c.pending[p.id] ?? 0) + q * 0.07 * swing(state, c, p.id) * (1 - sat);
      c.mobilisation[p.id] = (c.mobilisation[p.id] ?? 0) + q * 0.02 * (1 - sat * 0.5);
      c.saturation[p.id] = clamp(sat + 0.15);
      c.visits[p.id] = (c.visits[p.id] ?? 0) + 1;
    }
    st.mood[p.id] = (st.mood[p.id] ?? 0) + q * 0.004;
    out.reported = `${l.name} campaigned in ${targets.map((c) => c.name).join(', ')}. ${q > 0.5 ? 'Big crowds and wide coverage.' : q > 0.3 ? 'A solid day.' : 'The visit made little impression.'}`;
  } else {
    const P = q * 0.05;
    st.mood[p.id] = (st.mood[p.id] ?? 0) + P * 0.5;
    const weights = seats.map((c) => swing(state, c, p.id) * (1 - (c.saturation[p.id] ?? 0) * 0.5));
    distribute(seats, weights, P * 0.5 * Math.max(1, seats.length), (c, amt) => {
      c.pending[p.id] = (c.pending[p.id] ?? 0) + amt;
      c.mobilisation[p.id] = (c.mobilisation[p.id] ?? 0) + q * 0.004;
    });
    st.cred ??= {};
    st.cred[p.id] ??= {};
    st.cred[p.id][a.issue!] = clamp((st.cred[p.id][a.issue!] ?? 0) + q * 0.01 * issueMul, -0.3, 0.25);
    out.reported = `${l.name} toured ${STATE_BY_CODE[code].name} speaking on ${ISSUE_NAME[a.issue!].toLowerCase()}. ${q > 0.5 ? 'The tour dominated the state news.' : q > 0.3 ? 'Respectable crowds.' : 'The tour drew a lukewarm response.'}`;
  }
  if (visits >= 2) out.notes.push(`Fourth time or more in this state: the novelty has worn off.`);
  if (l.weak.includes(a.issue!)) out.notes.push(`${l.name} is not seen as credible on this issue (game estimate).`);
  out.quality = clamp(q - 0.3, -1, 1);
}

// ---- intelligence -----------------------------------------------------------------------

export type SeatCategory = 'safe' | 'likely' | 'competitive' | 'lean_opp' | 'safe_opp' | 'uncertain';
export const CATEGORY_LABEL: Record<SeatCategory, string> = { safe: 'Safe for us', likely: 'Likely ours', competitive: 'Competitive', lean_opp: 'Leans opposition', safe_opp: 'Safe for opposition', uncertain: 'Uncertain' };

export function seatCategory(fc: SeatForecast | undefined, party: string): SeatCategory {
  if (!fc) return 'uncertain';
  const p = fc.probs[party] ?? 0;
  const contenders = Object.values(fc.probs).filter((x) => x > 0.2).length;
  if (contenders >= 3) return 'uncertain';
  if (p >= 0.9) return 'safe';
  if (p >= 0.65) return 'likely';
  if (p >= 0.35) return 'competitive';
  if (p >= 0.08) return 'lean_opp';
  return 'safe_opp';
}

export interface StateIntel {
  code: string;
  name: string;
  seats: number;
  contesting: number;
  expected: number;
  categories: Record<SeatCategory, number>;
  competitive: string[]; // seat ids
  vulnerable: string[]; // our incumbents at risk
  allocated: number;
  spent: number;
  remaining: number;
  saturation: number;
  org: number;
  oppOrg: number;
  oppSpend: number;
  candidateFit: number; // mean candidate issue fit, -1..1 scale
  perTen: number; // estimated seats moved by ₹10 cr more, a rough model estimate
  efficiency: number;
  opportunities: string[];
  risks: string[];
}

// Rough estimate of the seats a further ₹10 cr rally circuit would move, using the same
// formula the resolution uses, without luck. Used only for advice.
function marginalSeats(state: GameState, p: Party, code: string, seats: Constituency[]): number {
  if (!seats.length) return 0;
  const st = state.states[code];
  const sat = st.campSat?.[p.id] ?? 0;
  const effort = Math.log1p(10 / seats.length / 0.6) * (1 - sat * 0.7) * 0.85;
  let issueBest = 0.6;
  for (const i of [st.primary, ...(st.secondary ?? [])]) if (i) issueBest = Math.max(issueBest, stateMessageFit(state, p, i, code));
  const P = effort * issueBest * 0.05;
  let d = 0;
  for (const c of seats) {
    const pr = state.seatForecast[c.id]?.probs[p.id] ?? 0;
    d += pr * (1 - pr) * P * 9 * swing(state, c, p.id) * (1 - (c.saturation[p.id] ?? 0) * 0.5);
  }
  return d;
}

export function stateIntel(state: GameState, party: string): StateIntel[] {
  const p = state.parties[party];
  const out: StateIntel[] = [];
  for (const code of Object.keys(state.states)) {
    const def = STATE_BY_CODE[code];
    const all = state.seats.filter((c) => c.state === code);
    const mine = all.filter((c) => c.candidates[party]);
    const cats: Record<SeatCategory, number> = { safe: 0, likely: 0, competitive: 0, lean_opp: 0, safe_opp: 0, uncertain: 0 };
    let expected = 0, org = 0, oppOrg = 0, fitSum = 0;
    const competitive: string[] = [], vulnerable: string[] = [];
    for (const c of mine) {
      const fc = state.seatForecast[c.id];
      const pr = fc?.probs[party] ?? 0;
      expected += pr;
      const cat = seatCategory(fc, party);
      cats[cat]++;
      if (cat === 'competitive' || cat === 'uncertain') competitive.push(c.id);
      if (c.incumbent === party && pr < 0.6) vulnerable.push(c.id);
      org += c.org[party] ?? 0;
      const rival = fc ? Object.entries(fc.probs).filter(([k]) => k !== party).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
      if (rival) oppOrg += c.org[rival] ?? 0;
      fitSum += candidateIssueFit(state, c, c.segments[0]?.id ?? 'farmers', party);
    }
    const st = state.states[code];
    const allocated = p.stateBudget?.[code] ?? 0;
    const spent = p.stateSpent?.[code] ?? 0;
    const oppSpend = Object.entries(st.spendLog ?? {}).filter(([k]) => k !== party).reduce((s, [, v]) => s + v, 0);
    const perTen = marginalSeats(state, p, code, mine);
    const n = Math.max(1, mine.length);
    const intel: StateIntel = {
      code, name: def.name, seats: all.length, contesting: mine.length, expected, categories: cats, competitive, vulnerable,
      allocated, spent, remaining: Math.max(0, allocated - spent), saturation: st.campSat?.[party] ?? 0,
      org: org / n, oppOrg: oppOrg / n, oppSpend, candidateFit: fitSum / n, perTen,
      efficiency: perTen / (1 + spent / 20), opportunities: [], risks: [],
    };
    if (competitive.length >= 3) intel.opportunities.push(`${competitive.length} seats are within reach either way.`);
    if (intel.candidateFit > 0.08 && spent < 5 && mine.length) intel.opportunities.push('Our candidates fit the local issues well but we have barely campaigned here.');
    const best = (Object.keys(st.salience) as Issue[]).filter((i) => i === st.primary || st.secondary?.includes(i)).sort((a, b) => stateMessageFit(state, p, b, code) - stateMessageFit(state, p, a, code))[0];
    if (best && stateMessageFit(state, p, best, code) > 0.75) intel.opportunities.push(`Our message on ${ISSUE_NAME[best].toLowerCase()} is credible here and voters care about it.`);
    if (vulnerable.length) intel.risks.push(`${vulnerable.length} of our sitting seats could fall.`);
    if (intel.oppOrg > intel.org + 0.15) intel.risks.push('Rivals have the stronger ground organisation.');
    if (oppSpend > spent * 2 && oppSpend > 10) intel.risks.push(`Rivals have outspent us here (about ₹${Math.round(oppSpend)} cr).`);
    if (intel.candidateFit < -0.08) intel.risks.push('Many of our candidates are weak on what this state cares about.');
    if (intel.saturation > 0.5) intel.risks.push('Voters are saturated with our campaign; more money buys little.');
    if (st.primary && (p.issueOwn[st.primary] ?? 0.5) < 0.42) intel.risks.push(`We are not trusted on ${ISSUE_NAME[st.primary].toLowerCase()}, the top issue here.`);
    out.push(intel);
  }
  return out;
}

export interface Recommendation { kind: 'invest' | 'defend' | 'exposure' | 'issue' | 'cut'; state: string; text: string; score: number }

// Advice derived from the forecast and the campaign model, never hardcoded.
export function recommendations(state: GameState, party: string, intel = stateIntel(state, party)): Recommendation[] {
  const p = state.parties[party];
  const recs: Recommendation[] = [];
  const active = intel.filter((s) => s.contesting > 0);
  for (const s of active.slice().sort((a, b) => b.efficiency - a.efficiency).slice(0, 3)) {
    if (s.perTen < 0.15) continue;
    recs.push({ kind: 'invest', state: s.code, score: s.efficiency, text: `${s.name}: about ${s.perTen.toFixed(1)} seats could move for another ₹10 cr (${s.competitive.length} competitive seats, ₹${Math.round(s.spent)} cr spent so far).` });
  }
  for (const s of active.filter((x) => x.vulnerable.length >= 2).sort((a, b) => b.vulnerable.length - a.vulnerable.length).slice(0, 2)) {
    recs.push({ kind: 'defend', state: s.code, score: s.vulnerable.length / 5, text: `${s.name}: ${s.vulnerable.length} of our sitting MPs are at risk.` });
  }
  for (const s of active.filter((x) => x.candidateFit > 0.08 && x.spent < 5 && x.competitive.length).slice(0, 2)) {
    recs.push({ kind: 'exposure', state: s.code, score: s.candidateFit, text: `${s.name}: strong candidates, little campaign so far. Cheap seats to win.` });
  }
  for (const s of active.slice(0, 40)) {
    const st = state.states[s.code];
    const i = st.primary;
    if (!i || s.competitive.length < 2) continue;
    const f = stateMessageFit(state, p, i, s.code);
    if (f > 0.8) recs.push({ kind: 'issue', state: s.code, score: f - 0.7, text: `${s.name}: lead on ${ISSUE_NAME[i].toLowerCase()}. It is the top issue and our message is credible.` });
  }
  for (const s of active.filter((x) => x.perTen < 0.08 && (x.allocated > x.spent + 5 || x.spent > 15)).slice(0, 2)) {
    recs.push({ kind: 'cut', state: s.code, score: 0.1, text: `${s.name}: further spending is unlikely to change any result (${s.categories.safe} safe, ${s.categories.safe_opp} out of reach).` });
  }
  const seen = new Set<string>();
  return recs.sort((a, b) => b.score - a.score).filter((r) => { const k = r.kind + r.state; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

// ---- budget -----------------------------------------------------------------------------

export function outstandingAllocation(p: Party): number {
  let t = 0;
  for (const [code, a] of Object.entries(p.stateBudget ?? {})) t += Math.max(0, a - (p.stateSpent?.[code] ?? 0));
  return t;
}

// Bulk allocation: spread `total` across states by strategy.
export function autoAllocate(state: GameState, party: string, total: number, strategy: 'competitive' | 'even' | 'defend' | 'focus'): Record<string, number> {
  const intel = stateIntel(state, party).filter((s) => s.contesting > 0);
  const score = (s: StateIntel) => strategy === 'even' ? s.contesting
    : strategy === 'defend' ? s.vulnerable.length * 2 + s.categories.likely + 0.1
    : strategy === 'focus' ? s.perTen ** 2
    : s.perTen + s.competitive.length * 0.05;
  const ranked = intel.map((s) => [s, score(s)] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const pick = strategy === 'focus' ? ranked.slice(0, 3) : ranked.slice(0, 15);
  const sum = pick.reduce((a, [, v]) => a + v, 0) || 1;
  const p = state.parties[party];
  const out: Record<string, number> = {};
  for (const [s, v] of pick) out[s.code] = Math.round((p.stateSpent?.[s.code] ?? 0) + total * v / sum);
  return out;
}

// ---- causes -----------------------------------------------------------------------------

export interface Factor { label: string; value: number }

// The modelled reasons one party is ahead of or behind another in a seat, in utility units
// averaged over the seat's voter groups. Built from the same terms the vote model uses.
export function seatFactors(state: GameState, c: Constituency, party: string, rival: string): Factor[] {
  const st = state.states[c.state];
  const w = c.segments.reduce((a, s) => a + s.w, 0) || 1;
  const avg = (f: (seg: Constituency['segments'][number]) => number) => c.segments.reduce((a, s) => a + s.w * f(s), 0) / w;
  const diff = (f: (pid: string) => number) => f(party) - f(rival);
  const gov = state.government;
  const govW = (pid: string) => gov ? (gov.pmParty === pid ? 1 : gov.partners.includes(pid) ? 0.5 : 0) : 0;
  const factors: Factor[] = [
    { label: 'Historical base and party fit', value: diff((pid) => Math.log(Math.max(c.base[pid] ?? 0.004, 0.004))) },
    { label: 'Candidate quality', value: diff((pid) => K_CAND * (candidateAppeal(c, pid) - 0.5)) },
    { label: 'Candidate fit with local issues', value: avg((s) => diff((pid) => K_CAND_ISSUE * candidateIssueFit(state, c, s.id, pid))) },
    { label: 'State mood', value: diff((pid) => st.mood[pid] ?? 0) },
    { label: 'Statewide media', value: avg((s) => diff((pid) => (st.airwar[pid] ?? 0) * SEGMENT_BY_ID[s.id].digital)) },
    { label: 'Local campaigning', value: avg((s) => diff((pid) => (c.persuasion[pid] ?? 0) * SEGMENT_BY_ID[s.id].ground)) },
    { label: 'Turnout operation', value: diff((pid) => (c.mobilisation[pid] ?? 0) * 3 + ((c.org[pid] ?? 0) - 0.4) * 0.24) },
    { label: 'National swing', value: diff((pid) => state.parties[pid]?.stats.popularity ?? 0) },
    { label: 'Government record', value: diff((pid) => govW(pid) * ((gov ? 0.5 * (gov.approval - 0.5) : 0) + K_SENTIMENT * sentimentShift(st))) },
    { label: 'Issue credibility built in the state', value: avg((s) => diff((pid) => {
      const cred = st.cred?.[pid];
      if (!cred) return 0;
      let f = 0, t = 0;
      for (const [i, v] of Object.entries(cred) as [Issue, number][]) { const sal = salienceFor(state, c, s.id, i); f += sal * v; t += sal; }
      return t ? f / Math.max(t, 1) * 0.9 : 0;
    })) },
  ];
  return factors.filter((f) => Math.abs(f.value) > 0.004).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

// Weekly upkeep for state-level stocks.
export function stateDynamics(state: GameState, rng: Rng, base: (code: string) => Record<Issue, number>) {
  const econ = state.economy;
  for (const st of Object.values(state.states)) {
    for (const pid of Object.keys(st.campSat ?? {})) st.campSat![pid] *= 0.7;
    for (const cred of Object.values(st.cred ?? {})) for (const i of Object.keys(cred) as Issue[]) cred[i] = (cred[i] ?? 0) * 0.97;
    const b = base(st.code);
    for (const i of Object.keys(b) as Issue[]) st.salience[i] = (st.salience[i] ?? b[i]) * 0.94 + b[i] * 0.06;
    if (st.sentiment && st.sentiment0) {
      for (const i of Object.keys(st.sentiment) as Issue[]) {
        const econLinked = i === 'economy' || i === 'jobs' || i === 'inflation';
        const target = (st.sentiment0[i] ?? 0) + (econLinked ? econ * 0.25 : 0) - st.disaster * 0.2;
        st.sentiment[i] = clamp((st.sentiment[i] ?? 0) + (target - (st.sentiment[i] ?? 0)) * 0.1 + rng.normal(0, 0.015), -1, 1);
      }
    }
    rankIssues(st);
  }
}

// ---- candidate suitability ----------------------------------------------------------------

export interface CandidateFit { stateFit: number; seatFit: number; suitability: number }

// State fit: the candidate's strong/weak issues against the state's issue importance.
// Seat fit: the same against this seat's voters (segments, local issues), as the vote model
// sees it. Suitability blends both with personal appeal, weighting the seat most.
export function candidateFit(state: GameState, c: Constituency, k: Candidate): CandidateFit {
  const st = state.states[c.state];
  let sf = 0, tot = 0;
  for (const i of Object.keys(st.salience) as Issue[]) tot += st.salience[i] ?? 0;
  for (const t of k.strong ?? []) sf += t.level * (st.salience[t.issue] ?? 0);
  for (const t of k.weak ?? []) sf -= t.level * (st.salience[t.issue] ?? 0);
  const stateFit = tot ? clamp(sf / tot * 2, -0.4, 0.4) : 0;
  const tmp = { ...c, candidates: { ...c.candidates, [k.party]: k } };
  const w = c.segments.reduce((a, s) => a + s.w, 0) || 1;
  const seatFit = c.segments.reduce((a, s) => a + s.w * candidateIssueFit(state, tmp, s.id, k.party), 0) / w;
  const appeal = candidateAppeal(tmp, k.party);
  const suitability = clamp(0.5 + (appeal - 0.5) * 0.9 + stateFit * 0.25 + seatFit * 0.55 + (k.incumbent ? 0.03 : 0));
  return { stateFit, seatFit, suitability };
}
