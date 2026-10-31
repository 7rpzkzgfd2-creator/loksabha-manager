// UI-side analysis of the game state: ratings, risks and war-room recommendations. Each
// recommendation names the specific problem and the evidence behind it.
import { STATE_BY_CODE, candidateAppeal } from '../engine/index.ts';
import type { Constituency, GameState } from '../engine/index.ts';
import type { Screen } from './store.tsx';

export type Rating = 'Safe' | 'Likely' | 'Lean' | 'Toss-up' | 'Lean opp.' | 'Likely opp.' | 'Safe opp.' | 'Not contesting';

export function ratingFor(g: GameState, c: Constituency, pid: string): Rating {
  if (!c.candidates[pid]) return 'Not contesting';
  const p = g.seatForecast[c.id]?.probs[pid] ?? 0;
  if (p >= 0.92) return 'Safe';
  if (p >= 0.75) return 'Likely';
  if (p >= 0.58) return 'Lean';
  if (p >= 0.42) return 'Toss-up';
  if (p >= 0.25) return 'Lean opp.';
  if (p >= 0.08) return 'Likely opp.';
  return 'Safe opp.';
}
export const RATING_COLOR: Record<Rating, string> = { Safe: '#2fbf71', Likely: '#7ccf5a', Lean: '#c9d65a', 'Toss-up': '#e9c46a', 'Lean opp.': '#f08c4a', 'Likely opp.': '#e5604a', 'Safe opp.': '#9b3b3b', 'Not contesting': '#2a3240' };

export function margin(g: GameState, c: Constituency) {
  const sh = Object.entries(g.seatForecast[c.id]?.shares ?? {}).sort((a, b) => b[1] - a[1]);
  return sh.length > 1 ? sh[0][1] - sh[1][1] : 1;
}

export interface Rec { sev: 'critical' | 'high' | 'normal'; title: string; why: string; go?: Screen; seat?: string }

export function recommendations(g: GameState, pid: string): Rec[] {
  const p = g.parties[pid];
  const out: Rec[] = [];
  const contested = g.seats.filter((c) => c.candidates[pid]);
  const tossups = contested.filter((c) => { const pr = g.seatForecast[c.id]?.probs[pid] ?? 0; return pr > 0.3 && pr < 0.7; });
  const left = Math.max(1, g.config.campaignTurns - g.campaignTurn + 1);

  // toss-ups with weak organisation
  const weakOrg = tossups.filter((c) => (c.org[pid] ?? 0) < 0.25).sort((a, b) => (a.org[pid] ?? 0) - (b.org[pid] ?? 0));
  if (weakOrg.length) {
    const c = weakOrg[0];
    out.push({ sev: 'high', seat: c.id, go: 'campaign', title: `${weakOrg.length} toss-up seats with a weak organisation`, why: `In ${c.name} (${STATE_BY_CODE[c.state].name}) your win chance is about ${Math.round((g.seatForecast[c.id].probs[pid] ?? 0) * 100)}% but local organisation is only ${Math.round((c.org[pid] ?? 0) * 100)}%. Door-to-door work is not possible below 12% and rally crowds will be thin. Building organisation in ${STATE_BY_CODE[c.state].name} takes 2–3 weeks to pay off${left <= 3 ? ', which you may not have' : ''}.` });
  }
  // rivals out-campaigning in competitive seats
  const outworked = tossups.map((c) => {
    const mine = c.visits[pid] ?? 0;
    const rival = Object.entries(c.visits).filter(([k]) => k !== pid).sort((a, b) => b[1] - a[1])[0];
    return { c, mine, rival };
  }).filter((x) => x.rival && x.rival[1] >= 2 && x.mine === 0);
  if (outworked.length) {
    const x = outworked[0];
    out.push({ sev: 'high', seat: x.c.id, go: 'campaign', title: `Rivals are working seats you have ignored`, why: `${g.parties[x.rival![0]].short} has held ${x.rival![1]} events in ${x.c.name}, a seat you could win, and you have held none. ${outworked.length > 1 ? `The same is true of ${outworked.length - 1} other competitive seats.` : ''}` });
  }
  // neglected states with competitive seats
  const byState = new Map<string, Constituency[]>();
  for (const c of tossups) byState.set(c.state, [...(byState.get(c.state) ?? []), c]);
  for (const [st, cs] of byState) {
    const visits = g.seats.filter((c) => c.state === st).reduce((a, c) => a + (c.visits[pid] ?? 0), 0);
    const air = g.states[st].airwar[pid] ?? 0;
    if (cs.length >= 3 && visits === 0 && air < 0.01 && g.campaignTurn > 2) {
      out.push({ sev: 'normal', go: 'map', title: `${STATE_BY_CODE[st].name}: ${cs.length} competitive seats, no campaign`, why: `You have not held an event or run digital ads in ${STATE_BY_CODE[st].name}. Opponents on Normal and Hard look for exactly this kind of opening.` });
      break;
    }
  }
  // saturation
  const tired = contested.filter((c) => (c.saturation[pid] ?? 0) > 0.5);
  if (tired.length) out.push({ sev: 'normal', seat: tired[0].id, title: `Audience fatigue in ${tired.length} seat${tired.length > 1 ? 's' : ''}`, why: `Voters in ${tired[0].name} have seen your pitch repeatedly (fatigue ${Math.round((tired[0].saturation[pid] ?? 0) * 100)}%). Another rally there will add little unless the message changes.` });
  // safe-seat spending
  const spendSafe = contested.filter((c) => (g.seatForecast[c.id]?.probs[pid] ?? 0) > 0.93).reduce((a, c) => a + (c.spend[pid] ?? 0), 0);
  const spendAll = contested.reduce((a, c) => a + (c.spend[pid] ?? 0), 0);
  if (spendAll > 10 && spendSafe / spendAll > 0.4) out.push({ sev: 'normal', go: 'finances', title: `${Math.round(spendSafe / spendAll * 100)}% of local spending is going to safe seats`, why: 'Safe-seat events lift morale and turnout, but each rupee there is one not spent in a marginal. Check whether that is a deliberate choice.' });
  // money runway
  const recent = g.outcomes.filter((o) => o.party === pid && o.turn >= g.turn - 2).reduce((a, o) => a + o.cost, 0) / 2;
  if (recent > 0 && p.stats.funds / recent < left - 0.5) out.push({ sev: 'high', go: 'finances', title: 'You will run out of money before polling day', why: `At ₹${recent.toFixed(1)} cr a week you have about ${Math.floor(p.stats.funds / recent)} weeks of campaigning left, but ${left} weeks to go.` });
  // cohesion
  const angry = p.factions.filter((f) => f.satisfaction < 0.45);
  if (angry.length) out.push({ sev: angry.some((f) => f.strength >= 0.25) ? 'critical' : 'high', go: 'party', title: `${angry.map((f) => f.name).join(', ')} unhappy`, why: `${angry[0].grievances[0] ? `Latest grievance: ${angry[0].grievances[0]}. ` : ''}Low satisfaction makes revolts, leaks and defections more likely, and weakens your supporters' loyalty in three-way fights.` });
  // vetting
  const unvetted = tossups.filter((c) => !c.candidates[pid].vetted);
  if (unvetted.length >= 4 && g.stage === 'preparation') out.push({ sev: 'normal', go: 'candidates', title: `${unvetted.length} candidates in competitive seats are unvetted`, why: 'Commissioning research in their states reveals controversy risk before tickets lock. A scandal in a marginal can decide it.' });
  // forecast blind spot
  if (!p.staff.some((s) => s.role === 'data_analyst')) out.push({ sev: 'normal', go: 'staff', title: 'Your forecast has a blind spot', why: 'Without a data analyst, our polling carries its full systematic error and crowd numbers from organisers are taken at face value.' });
  // alliances
  const a = g.alliances.find((x) => x.members.includes(pid));
  if (a && a.trust < 0.4) out.push({ sev: 'high', go: 'alliances', title: `Trust in the ${a.name} is fraying (${Math.round(a.trust * 100)}%)`, why: 'At low trust, partners’ supporters transfer less of their vote and partners may walk out.' });
  // shadow exposure as the legal cell sees it
  if (p.stats.shadowExposure > 0.25) out.push({ sev: p.stats.shadowExposure > 0.5 ? 'critical' : 'high', go: 'backroom', title: 'The legal cell is nervous about off-the-books money', why: `Exposure risk is ${p.stats.shadowExposure > 0.5 ? 'high' : 'rising'}. Every extra deal makes discovery likelier; it fades slowly if you stop.` });
  // candidate weakness in marginals
  const weakCand = tossups.filter((c) => candidateAppeal(c, pid) < 0.42);
  if (weakCand.length && g.stage === 'preparation') out.push({ sev: 'normal', go: 'candidates', seat: weakCand[0].id, title: `Weak candidates in ${weakCand.length} marginal seat${weakCand.length > 1 ? 's' : ''}`, why: `${weakCand[0].candidates[pid].name} in ${weakCand[0].name} has low local appeal. Tickets can still be changed this week.` });
  if (g.events.some((e) => e.party === pid && !e.resolved)) out.unshift({ sev: 'critical', go: 'events', title: 'Decisions waiting', why: 'Unanswered developments default to the passive option when you continue.' });
  const order = { critical: 0, high: 1, normal: 2 };
  return out.sort((x, y) => order[x.sev] - order[y.sev]);
}
