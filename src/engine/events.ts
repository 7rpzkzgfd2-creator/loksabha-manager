// Event engine. Events are drawn from the current state: weak cohesion makes revolts and
// leaks likelier, risky candidates make scandals likelier, heavy spending invites
// scrutiny, low alliance trust breeds seat disputes. Each template defines who is
// involved, what the options are, and how each option plays out given hidden facts
// (e.g. how strong the evidence really is). No option is right in every situation.

import { ISSUE_NAME } from './data/catalog.ts';
import { STATE_BY_CODE, STATES_LIST, makeCandidate } from './setup.ts';
import { clamp, uid } from './rng.ts';
import type { Rng } from './rng.ts';
import type { EventOption, GameEvent, GameState, Issue, Party } from './types.ts';
import { adjustFaction, staffSkill } from './party.ts';
import { mail, remember, report, schedule, relate, log } from './world.ts';
import { aiQuality } from './ai.ts';

interface Built { title: string; body: string; severity: number; visibility: 'public' | 'private'; params: GameEvent['params']; options: EventOption[] }

interface Template {
  id: string;
  scope: 'party' | 'national';
  weight(state: GameState, p: Party): number;
  build(state: GameState, p: Party, rng: Rng, shared?: Record<string, string | number>): Built | null;
  resolve(state: GameState, ev: GameEvent, option: string, rng: Rng): string;
  ai(state: GameState, ev: GameEvent, rng: Rng, q: number): string;
}

const sev = (state: GameState, p: Party) => (p.controlledBy === 'human' && state.config.difficulty === 'easy' ? 0.75 : 1);
const crisisSkill = (p: Party) => Math.max(staffSkill(p, 'crisis_adviser'), staffSkill(p, 'communications') * 0.6);
const seatOf = (state: GameState, id: string | number) => state.seats.find((c) => c.id === id)!;

const TEMPLATES: Template[] = [
  {
    id: 'candidate_controversy', scope: 'party',
    weight: (state, p) => {
      let risk = 0;
      for (const c of state.seats) { const k = c.candidates[p.id]; if (k) risk += k.controversy * (1 - k.ethics); }
      return clamp(risk / 60, 0, 0.35);
    },
    build: (state, p, rng) => {
      const pool = state.seats.filter((c) => c.candidates[p.id]);
      if (!pool.length) return null;
      const c = rng.weighted(pool, (x) => x.candidates[p.id].controversy * (1 - x.candidates[p.id].ethics) + 0.01);
      const k = c.candidates[p.id];
      const evidence = clamp(rng.normal(1 - k.ethics, 0.2));
      const docs = rng.next() < (evidence > 0.5 ? 0.7 : 0.25);
      const what = rng.pick(['undeclared assets', 'a land deal', 'an old criminal case', 'a hate-speech clip', 'a contract given to a relative']);
      return {
        title: `Allegations against ${k.name} (${c.name})`,
        body: `${k.name}, our candidate in ${c.name}, is accused of ${what}. ${docs ? 'The story comes with documents.' : 'So far it rests on anonymous sources.'} Rivals are already sharing it.${k.vetted ? ` Our vetting had rated the controversy risk ${k.controversy > 0.4 ? 'high' : 'low'}.` : ' We never vetted this candidate.'}`,
        severity: clamp(0.3 + evidence * 0.4), visibility: 'public',
        params: { seat: c.id, cand: k.id, evidence, docs: docs ? 1 : 0, what },
        options: [
          { id: 'defend', label: 'Stand by the candidate', detail: 'Call it a smear and back them fully.', risk: 'If the evidence holds, the story grows and drags the party.' },
          { id: 'investigate', label: 'Order an internal inquiry', detail: 'Buy time and look serious. Costs ₹1 crore.', risk: 'Looks evasive to some; the result comes in two weeks.', cost: 1 },
          { id: 'drop', label: 'Drop the candidate', detail: 'Replace them with a party organiser.', risk: 'Weaker candidate; their faction will be angry; they may run as a rebel.' },
          { id: 'wait', label: 'Say nothing for now', detail: 'Let the news cycle move on.', risk: 'Silence can read as guilt if the story has legs.' },
        ],
      };
    },
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      const c = seatOf(state, ev.params.seat);
      const k = c.candidates[p.id];
      const evidence = Number(ev.params.evidence);
      const s = sev(state, p) * (1 - crisisSkill(p) * 0.3);
      const st = state.states[c.state];
      if (!k) return 'The candidate is no longer in the race.';
      if (opt === 'defend') {
        if (evidence > 0.55) {
          k.ethics = clamp(k.ethics - 0.2); k.localRep = clamp(k.localRep - 0.15);
          st.mood[p.id] = (st.mood[p.id] ?? 0) - 0.03 * s;
          p.stats.trust = clamp(p.stats.trust - 0.03 * s);
          schedule(state, rng, { dueTurn: state.turn + 1, kind: 'scandal_escalation', party: p.id, params: { seat: c.id, amount: 0.04 * s }, note: `Fresh details emerge about ${k.name}` });
          report(state, rng, { headline: `${p.short} digs in as evidence mounts against ${k.name}`, fact: `${p.short} defended its ${c.name} candidate.`, parties: [p.id], tone: -0.5, region: STATE_BY_CODE[c.state].region });
          remember(state, rng, { kind: 'controversy', party: p.id, text: `Defended ${k.name} despite strong evidence.`, weight: 0.6 });
          return 'The documents held up. The story is growing and will cost us more next week.';
        }
        adjustFaction(p, (f) => f.id === k.faction, 0.05);
        k.loyalty = clamp(k.loyalty + 0.1);
        c.mobilisation[p.id] = (c.mobilisation[p.id] ?? 0) + 0.01;
        return 'The allegations look thin. Our cadre rallied behind the candidate.';
      }
      if (opt === 'investigate') {
        p.stats.funds -= 1;
        st.mood[p.id] = (st.mood[p.id] ?? 0) - 0.01 * s;
        schedule(state, rng, { dueTurn: state.turn + 2, kind: 'inquiry_result', party: p.id, params: { seat: c.id, evidence }, note: `Inquiry into ${k.name} reports` });
        return 'An inquiry is under way. The heat is down for now; the findings land in two weeks.';
      }
      if (opt === 'drop') {
        const replacement = makeCandidate(rng, p, c.state, p.stats.candidateQuality - 0.05);
        replacement.profile = 'party_organiser'; replacement.loyalty = clamp(replacement.loyalty + 0.2);
        c.candidates[p.id] = replacement;
        adjustFaction(p, (f) => f.id === k.faction, -0.12, `${k.name} dropped in ${c.name}`);
        if (evidence > 0.5) p.stats.trust = clamp(p.stats.trust + 0.015);
        if (k.localRep > 0.6 && k.loyalty < 0.45 && rng.chance(0.5)) {
          c.rebel = clamp(0.05 + k.localRep * 0.08, 0, 0.15); c.rebelFrom = p.id;
          state.rejectedAspirants[c.id] = k.localRep;
          remember(state, rng, { kind: 'candidate', party: p.id, text: `${k.name} dropped in ${c.name} and is running as a rebel.`, weight: 0.5 });
          return `${replacement.name} replaces ${k.name}, who has filed as an independent and will split our vote.`;
        }
        remember(state, rng, { kind: 'candidate', party: p.id, text: `Dropped ${k.name} in ${c.name} over allegations.`, weight: 0.4 });
        return `${replacement.name}, a party organiser, is our new candidate in ${c.name}.`;
      }
      if (evidence > 0.5 && rng.chance(0.6)) {
        k.localRep = clamp(k.localRep - 0.12);
        st.mood[p.id] = (st.mood[p.id] ?? 0) - 0.02 * s;
        p.stats.trust = clamp(p.stats.trust - 0.015 * s);
        return 'The story did not go away. Our silence is now part of it.';
      }
      return 'The story faded within a few days.';
    },
    ai: (state, ev, rng, q) => {
      const docs = Number(ev.params.docs) === 1;
      if (rng.next() > q) return rng.pick(['defend', 'wait', 'investigate', 'drop']);
      return docs ? (Number(ev.params.evidence) > 0.6 ? 'drop' : 'investigate') : 'wait';
    },
  },
  {
    id: 'faction_revolt', scope: 'party',
    weight: (_s, p) => clamp((0.62 - p.stats.cohesion) * 0.8, 0, 0.3),
    build: (_state, p) => {
      const f = p.factions.slice().sort((a, b) => a.satisfaction - b.satisfaction)[0];
      if (!f) return null;
      const why = f.grievances[0] ?? (f.outlook === 'regional' ? 'too little say over tickets in their state' : f.outlook === 'reformist' ? 'being shut out of the campaign' : f.outlook === 'ideologue' ? 'the party drifting from its principles' : 'the leadership’s new advisers');
      return {
        title: `${f.name} go public with complaints`, severity: 0.45, visibility: 'public',
        body: `Leaders of the ${f.name.toLowerCase()} have told reporters they are unhappy about ${why}. They want concessions before they campaign wholeheartedly.`,
        params: { faction: f.id },
        options: [
          { id: 'concede', label: 'Give them what they want', detail: 'Tickets, posts or a policy nod.', risk: 'Other factions see that complaining works. Costs ₹3 crore in side-deals.', cost: 3 },
          { id: 'negotiate', label: 'Negotiate privately', detail: 'Send a trusted go-between.', risk: 'Works best with a skilled negotiator; may only half-satisfy them.' },
          { id: 'discipline', label: 'Discipline the ringleaders', detail: 'Suspend two office-bearers.', risk: 'Restores authority or triggers defections.' },
          { id: 'ignore', label: 'Ignore it', detail: 'Do not dignify the complaints.', risk: 'Grievances fester.' },
        ],
      };
    },
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      const fid = String(ev.params.faction);
      const f = p.factions.find((x) => x.id === fid)!;
      if (opt === 'concede') {
        p.stats.funds -= 3;
        adjustFaction(p, (x) => x.id === fid, 0.2);
        adjustFaction(p, (x) => x.id !== fid, -0.04, 'Concessions to rival faction');
        p.stats.leaderPop = clamp(p.stats.leaderPop - 0.01);
        return `${f.name} are placated. Others noticed.`;
      }
      if (opt === 'negotiate') {
        const neg = Math.max(staffSkill(p, 'negotiator'), 0.3);
        const ok = rng.chance(0.35 + neg * 0.5);
        adjustFaction(p, (x) => x.id === fid, ok ? 0.14 : 0.03);
        return ok ? 'A quiet deal holds. The complaints stop.' : 'Talks went nowhere much. The faction is calmer but not satisfied.';
      }
      if (opt === 'discipline') {
        const strong = p.stats.leaderPop > 0.55 && f.strength < 0.3;
        if (strong) { adjustFaction(p, (x) => x.id === fid, -0.05); adjustFaction(p, (x) => x.outlook === 'loyalist', 0.08); p.stats.trust = clamp(p.stats.trust + 0.01); return 'Authority restored. The faction backs down, sullenly.'; }
        adjustFaction(p, (x) => x.id === fid, -0.15, 'Leaders suspended');
        schedule(state, rng, { dueTurn: state.turn + 1, kind: 'defection_wave', party: p.id, params: { faction: fid, n: 2 + rng.int(0, 3) }, note: `Suspended leaders weigh their options` });
        remember(state, rng, { kind: 'faction', party: p.id, text: `Disciplined the ${f.name}.`, weight: 0.5 });
        return 'The suspensions have angered the faction. Some may walk out.';
      }
      adjustFaction(p, (x) => x.id === fid, -0.06, 'Ignored by leadership');
      return 'The complaints continue in the background.';
    },
    ai: (_s, _e, rng, q) => (rng.next() > q ? rng.pick(['ignore', 'discipline']) : rng.pick(['negotiate', 'concede'])),
  },
  {
    id: 'economic_shock', scope: 'national',
    weight: (state) => 0.06 + Math.max(0, -state.economy) * 0.1,
    build: (state, p, rng, shared) => {
      const kind = (shared?.issue as 'inflation' | 'jobs') ?? rng.pick(['inflation', 'jobs'] as const);
      const isGov = state.government?.pmParty === p.id || !!state.government?.partners.includes(p.id);
      return {
        title: kind === 'inflation' ? 'Food prices jump' : 'Weak jobs data published',
        body: kind === 'inflation' ? 'Vegetable and pulse prices are up sharply this month. Kitchen budgets are the talk of every market.' : 'Official data shows youth unemployment rising again. Opposition parties are pouncing.',
        severity: 0.5, visibility: 'public', params: { issue: kind, gov: isGov ? 1 : 0 },
        options: isGov ? [
          { id: 'relief', label: 'Announce relief measures', detail: 'Stock releases, targeted support.', risk: 'Costs fiscal credibility; may look like panic.' },
          { id: 'defend', label: 'Defend the record', detail: 'Point to longer-term numbers.', risk: 'Can sound out of touch.' },
          { id: 'blame', label: 'Blame global conditions', detail: 'It is the world, not us.', risk: 'Works if believed; voters may not care whose fault it is.' },
        ] : [
          { id: 'attack', label: 'Hammer the government', detail: 'Make this the story of the week.', risk: 'Little effect if we are not seen as credible on the issue.' },
          { id: 'plan', label: 'Publish our own plan', detail: 'A costed alternative.', risk: 'Hostages to fortune; costs ₹1 crore.', cost: 1 },
          { id: 'quiet', label: 'Stay on our message', detail: 'Do not chase the news.', risk: 'We may miss the moment.' },
        ],
      };
    },
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      const issue = String(ev.params.issue) as Issue;
      if (opt === 'relief') { p.stats.fiscalCredibility = clamp(p.stats.fiscalCredibility - 0.05); if (state.government) state.government.approval = clamp(state.government.approval + 0.02); return 'Relief announced. It helps a little and the bill goes on the slate.'; }
      if (opt === 'defend') { const ok = rng.chance(0.3 + p.stats.trust * 0.4); p.stats.popularity += ok ? 0.005 : -0.012; return ok ? 'The defence held up reasonably.' : 'The defence went down badly at kitchen tables.'; }
      if (opt === 'blame') { const ok = rng.chance(0.35 + p.stats.media * 0.3); p.stats.popularity += ok ? 0 : -0.01; return ok ? 'The global framing stuck in some coverage.' : 'Few were persuaded.'; }
      if (opt === 'attack') { const gain = (p.issueOwn[issue] - 0.4) * 0.04; p.stats.popularity += gain; return gain > 0 ? 'The attack landed: we own this issue.' : 'Voters heard the attack but did not see us as the answer.'; }
      if (opt === 'plan') { p.stats.funds -= 1; p.issueOwn[issue] = clamp(p.issueOwn[issue] + 0.05); p.stats.fiscalCredibility = clamp(p.stats.fiscalCredibility + 0.01); return 'Our plan got serious coverage. It will be tested later.'; }
      return 'We stayed on message.';
    },
    ai: (state, ev, rng) => (Number(ev.params.gov) ? rng.pick(['relief', 'defend', 'blame']) : (state.parties[ev.party].issueOwn[String(ev.params.issue) as Issue] > 0.5 ? 'attack' : rng.pick(['plan', 'quiet', 'attack']))),
  },
  {
    id: 'natural_disaster', scope: 'national',
    weight: () => 0.05,
    build: (_state, _p, rng, shared) => {
      const pool = STATES_LIST.filter((s) => ['OD', 'WB', 'AP', 'TN', 'KL', 'AS', 'BR', 'GJ', 'MH', 'UK', 'HP'].includes(s.code));
      const st = (shared?.state as string) ?? rng.pick(pool).code;
      const kind = ['UK', 'HP'].includes(st) ? 'landslides' : ['AS', 'BR'].includes(st) ? 'floods' : 'a cyclone';
      return {
        title: `${kind[0].toUpperCase() + kind.slice(1)} hit ${STATE_BY_CODE[st].name}`, severity: 0.6, visibility: 'public',
        body: `Thousands are displaced by ${kind} in ${STATE_BY_CODE[st].name}. Campaigning there will look very different this week.`,
        params: { state: st },
        options: [
          { id: 'relief', label: 'Suspend campaigning and send volunteers', detail: 'Our cadre runs relief camps. Costs ₹2 crore.', risk: 'Loses a week of campaigning there; goodwill is not guaranteed.', cost: 2 },
          { id: 'pledge', label: 'Pledge a relief fund', detail: 'A visible cheque. Costs ₹4 crore.', risk: 'Can look like buying sympathy.', cost: 4 },
          { id: 'continue', label: 'Keep campaigning', detail: 'Our message matters too.', risk: 'Could be called insensitive.' },
        ],
      };
    },
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      const st = state.states[String(ev.params.state)];
      st.disaster = Math.max(st.disaster, 0.7);
      if (opt === 'relief') {
        p.stats.funds -= 2;
        for (const c of state.seats) if (c.state === st.code) c.saturation[p.id] = clamp((c.saturation[p.id] ?? 0) + 0.1);
        schedule(state, rng, { dueTurn: state.turn + 2, kind: 'relief_goodwill', party: p.id, params: { state: st.code, amount: (c0(p) + 0.02) * (0.5 + p.stats.organisation) }, note: `Relief work in ${STATE_BY_CODE[st.code].name} remembered` });
        return 'Our volunteers are in the camps. Local people are noticing.';
      }
      if (opt === 'pledge') { p.stats.funds -= 4; st.mood[p.id] = (st.mood[p.id] ?? 0) + (rng.chance(0.55) ? 0.012 : -0.006); return 'The pledge drew a mixed response.'; }
      if (rng.chance(0.4)) { st.mood[p.id] = (st.mood[p.id] ?? 0) - 0.02; report(state, rng, { headline: `${p.short} criticised for campaigning amid ${STATE_BY_CODE[st.code].name} disaster`, fact: `${p.short} continued campaign events during the disaster.`, parties: [p.id], tone: -0.4, region: STATE_BY_CODE[st.code].region }); return 'We were criticised for campaigning during the disaster.'; }
      return 'Nobody much noticed either way.';
    },
    ai: (state, ev, rng, q) => (rng.next() < q && state.seats.some((c) => c.state === ev.params.state && c.candidates[ev.party]) ? 'relief' : 'continue'),
  },
  {
    id: 'finance_scrutiny', scope: 'party',
    weight: (state, p) => {
      const spent = state.outcomes.filter((o) => o.party === p.id && o.turn >= state.turn - 2).reduce((a, o) => a + o.cost, 0);
      return clamp((spent / Math.max(20, p.stats.funds + spent) - 0.25) * 0.5, 0, 0.2);
    },
    build: (_state, p) => ({
      title: 'Questions over campaign spending', severity: 0.4, visibility: 'public',
      body: `An investigative portal says the ${p.short}'s spending in several seats looks far above declared limits. The Election Commission has asked for details.`,
      params: {},
      options: [
        { id: 'publish', label: 'Publish full accounts', detail: 'Open the books. Costs ₹1 crore in audits.', risk: 'Embarrassing line items may surface.', cost: 1 },
        { id: 'challenge', label: 'Challenge the report legally', detail: 'Send a defamation notice.', risk: 'Looks combative; keeps the story alive.' },
        { id: 'ignore', label: 'Ignore it', detail: 'It is one website.', risk: 'Could escalate if the EC follows up.' },
      ],
    }),
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      if (opt === 'publish') { p.stats.funds -= 1; const clean = rng.chance(0.6 + p.stats.trust * 0.3); p.stats.trust = clamp(p.stats.trust + (clean ? 0.02 : -0.01)); return clean ? 'The accounts were dull. Story over.' : 'A few awkward entries made the news, but the openness helped.'; }
      if (opt === 'challenge') { p.stats.media = clamp(p.stats.media + 0.01); p.stats.trust = clamp(p.stats.trust - 0.01); return 'The legal notice made headlines of its own.'; }
      if (rng.chance(0.4)) { schedule(state, rng, { dueTurn: state.turn + 1, kind: 'ec_notice', party: p.id, params: { amount: 0.02 }, note: 'Election Commission follow-up' }); return 'The Commission has sent a formal notice.'; }
      return 'The story did not travel.';
    },
    ai: (_s, _e, rng, q) => (rng.next() < q ? 'publish' : rng.pick(['challenge', 'ignore'])),
  },
  {
    id: 'coalition_dispute', scope: 'party',
    weight: (state, p) => {
      const a = state.alliances.find((x) => x.leader === p.id);
      if (!a || state.stage !== 'preparation' && state.campaignTurn > 4) return 0;
      return clamp((0.7 - a.trust) * 0.4, 0, 0.25);
    },
    build: (state, p, rng) => {
      const a = state.alliances.find((x) => x.leader === p.id)!;
      const partners = a.members.filter((m) => m !== p.id && m !== 'OTH');
      if (!partners.length) return null;
      const partner = rng.pick(partners);
      const n = rng.int(2, 6);
      return {
        title: `${state.parties[partner].short} demands more seats`, severity: 0.4, visibility: 'public',
        body: `Our ally ${state.parties[partner].name} wants ${n} more seats in the alliance's arrangement and is hinting it could go it alone.`,
        params: { alliance: a.id, partner, n },
        options: [
          { id: 'concede', label: `Give them ${n} seats`, detail: 'Keep the alliance happy.', risk: 'Our own aspirants in those seats will be furious.' },
          { id: 'refuse', label: 'Refuse', detail: 'Hold the line.', risk: 'Alliance trust falls; they might leave.' },
          { id: 'mediate', label: 'Offer something else', detail: 'Posts, a policy, a promise for next time.', risk: 'A promise for next time will be remembered.' },
        ],
      };
    },
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      const a = state.alliances.find((x) => x.id === ev.params.alliance);
      const partner = String(ev.params.partner);
      if (!a) return 'The alliance no longer exists.';
      if (opt === 'concede') {
        let n = Number(ev.params.n);
        for (const c of state.seats) {
          if (n <= 0) break;
          if (a.seatAlloc[c.id] === p.id && (c.base[partner] ?? 0) > 0.05) {
            const k = c.candidates[p.id];
            delete c.candidates[p.id];
            c.candidates[partner] = makeCandidate(rng, state.parties[partner], c.state, state.parties[partner].stats.candidateQuality);
            a.seatAlloc[c.id] = partner;
            if (k && k.localRep > 0.65 && rng.chance(0.35)) { c.rebel = 0.06; c.rebelFrom = partner; }
            n--;
          }
        }
        a.trust = clamp(a.trust + 0.12);
        adjustFaction(p, (f) => f.outlook === 'regional' || f.outlook === 'loyalist', -0.06, 'Seats ceded to an ally');
        relate(state, p.id, partner, 0.15);
        return 'Seats handed over. The ally is pleased; our local workers are not.';
      }
      if (opt === 'refuse') {
        a.trust = clamp(a.trust - 0.15);
        relate(state, p.id, partner, -0.2);
        remember(state, rng, { kind: 'alliance', party: partner, other: p.id, text: `${p.short} refused ${state.parties[partner].short}'s seat demand.`, weight: 0.5 });
        if (a.trust < 0.35) schedule(state, rng, { dueTurn: state.turn + 1, kind: 'alliance_exit_risk', party: partner, params: { alliance: a.id }, note: `${state.parties[partner].short} reconsiders the alliance` });
        return 'We held firm. Trust within the alliance has taken a knock.';
      }
      a.trust = clamp(a.trust + 0.04);
      remember(state, rng, { kind: 'promise', party: p.id, other: partner, text: `Promised ${state.parties[partner].short} better terms next time.`, weight: 0.6 });
      return 'A face-saving deal. They expect us to remember it.';
    },
    ai: (state, ev, rng, q) => (state.alliances.find((a) => a.id === ev.params.alliance)!.trust < 0.45 && rng.next() < q ? 'concede' : rng.pick(['refuse', 'mediate'])),
  },
  {
    id: 'leak', scope: 'party',
    weight: (_s, p) => clamp((0.6 - p.stats.cohesion) * 0.5, 0, 0.2),
    build: (_s, p) => ({
      title: 'Internal memo leaked', severity: 0.35, visibility: 'public',
      body: `A strategy memo from our war room is circulating on social media, including frank notes about which seats we have written off. Workers in those seats are angry.`,
      params: {},
      options: [
        { id: 'hunt', label: 'Find the leaker', detail: 'A visible crackdown.', risk: 'Paranoia hurts morale.' },
        { id: 'own', label: 'Own it and move on', detail: 'Admit it is real, reassure workers.', risk: 'Confirms the embarrassing details.' },
        { id: 'deny', label: 'Call it fake', detail: 'Deny everything.', risk: 'If proven real, trust drops further.' },
      ],
    }),
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      p.stats.volunteerMorale = clamp(p.stats.volunteerMorale - 0.03);
      if (opt === 'hunt') { adjustFaction(p, () => true, -0.03); p.stats.volunteerMorale = clamp(p.stats.volunteerMorale - 0.02); return 'The hunt has made everyone nervous.'; }
      if (opt === 'own') { p.stats.trust = clamp(p.stats.trust + 0.005); p.stats.volunteerMorale = clamp(p.stats.volunteerMorale + 0.03); return 'Workers appreciated the honesty.'; }
      if (rng.chance(0.5)) { p.stats.trust = clamp(p.stats.trust - 0.03); return 'The memo was authenticated. The denial looks bad.'; }
      return 'The denial held.';
    },
    ai: (_s, _e, rng) => rng.pick(['hunt', 'own', 'deny']),
  },
  {
    id: 'endorsement', scope: 'party',
    weight: (_s, p) => clamp(0.03 + p.stats.momentum * 0.1 + (p.stats.trust - 0.45) * 0.1, 0, 0.12),
    build: (_s, p, rng) => {
      const who = rng.pick(['a retired Army chief', 'a popular film actor', 'a respected farmers’ leader', 'a well-known economist', 'a cricket star']);
      return {
        title: `${who[0].toUpperCase() + who.slice(1)} offers support`, severity: 0.25, visibility: 'public',
        body: `${who[0].toUpperCase() + who.slice(1)} has said they will back the ${p.short}. They are willing to campaign.`,
        params: { who },
        options: [
          { id: 'feature', label: 'Put them on stage', detail: 'Make them a face of the campaign.', risk: 'Their past statements become our problem.' },
          { id: 'quiet', label: 'Thank them quietly', detail: 'Accept the support, low profile.', risk: 'Smaller boost.' },
        ],
      };
    },
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      if (opt === 'feature') {
        if (rng.chance(0.2)) { p.stats.popularity -= 0.008; return 'Old interviews resurfaced. The endorsement became a distraction.'; }
        p.stats.popularity += 0.012; p.stats.media = clamp(p.stats.media + 0.02); return 'Big crowds and good coverage.';
      }
      p.stats.popularity += 0.004; return 'A useful, low-key boost.';
    },
    ai: (_s, _e, rng, q) => (rng.next() < q ? 'feature' : 'quiet'),
  },
  {
    id: 'local_protest', scope: 'party',
    weight: (state, p) => (state.government?.pmParty === p.id ? 0.12 : 0.06),
    build: (state, p, rng) => {
      const pool = state.seats.filter((c) => c.candidates[p.id] && (c.incumbent === p.id || state.government?.pmParty !== p.id));
      if (!pool.length) return null;
      const c = rng.pick(pool);
      const issue = c.localIssues[0];
      const gov = state.government?.pmParty === p.id || c.incumbent === p.id;
      return {
        title: `Protest in ${c.name} over ${ISSUE_NAME[issue].toLowerCase()}`, severity: 0.3, visibility: 'public',
        body: gov ? `Residents of ${c.name} are protesting outside our candidate's office over ${ISSUE_NAME[issue].toLowerCase()}. They blame the incumbent.` : `A protest in ${c.name} over ${ISSUE_NAME[issue].toLowerCase()} is growing. We could join it.`,
        params: { seat: c.id, issue, gov: gov ? 1 : 0 },
        options: gov ? [
          { id: 'meet', label: 'Candidate meets protesters', detail: 'Listen and promise action.', risk: 'Promises will be remembered.' },
          { id: 'ignore', label: 'Ignore it', detail: 'It will blow over.', risk: 'Local anger may grow.' },
        ] : [
          { id: 'join', label: 'Join the protest', detail: 'Our candidate leads from the front.', risk: 'Some voters dislike agitation politics.' },
          { id: 'ignore', label: 'Stay away', detail: 'Not our fight.', risk: 'A missed opening.' },
        ],
      };
    },
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      const c = seatOf(state, ev.params.seat);
      if (opt === 'meet') { c.persuasion[p.id] = (c.persuasion[p.id] ?? 0) + 0.015; remember(state, rng, { kind: 'promise', party: p.id, text: `Promised action on ${ISSUE_NAME[String(ev.params.issue) as Issue].toLowerCase()} in ${c.name}.`, weight: 0.3 }); return 'The meeting calmed things down.'; }
      if (opt === 'join') { const ok = rng.chance(0.65); c.persuasion[p.id] = (c.persuasion[p.id] ?? 0) + (ok ? 0.03 : -0.01); c.mobilisation[p.id] = (c.mobilisation[p.id] ?? 0) + 0.01; return ok ? 'Our candidate became the face of the protest.' : 'The protest turned ugly and we got some of the blame.'; }
      if (Number(ev.params.gov)) { c.persuasion[p.id] = (c.persuasion[p.id] ?? 0) - 0.02; return 'Local anger has hardened.'; }
      return 'We stayed out of it.';
    },
    ai: (_s, ev, rng, q) => (Number(ev.params.gov) ? (rng.next() < q ? 'meet' : 'ignore') : (rng.next() < q * 0.8 ? 'join' : 'ignore')),
  },
  {
    id: 'manifesto_contradiction', scope: 'party',
    weight: (_s, p) => {
      const h = (id: string) => p.manifesto.policies.includes(id);
      return (h('gst_simplify') && h('farm_loan')) || (h('uniform_code') && h('caste_census')) ? 0.2 : 0;
    },
    build: (_s, p) => ({
      title: 'Commentators find a contradiction in our manifesto', severity: 0.3, visibility: 'public',
      body: `Columnists say two of the ${p.short}'s promises pull in opposite directions and ask which one we mean.`,
      params: {},
      options: [
        { id: 'clarify', label: 'Drop the weaker promise', detail: 'Remove the more recent of the pair.', risk: 'A visible reversal.' },
        { id: 'defend', label: 'Defend both', detail: 'Argue they fit together.', risk: 'Credibility drain if unconvincing.' },
      ],
    }),
    resolve: (state, ev, opt, rng) => {
      const p = state.parties[ev.party];
      if (opt === 'clarify') {
        const drop = ['farm_loan', 'caste_census'].find((x) => p.manifesto.policies.includes(x));
        if (drop) p.manifesto.policies = p.manifesto.policies.filter((x) => x !== drop);
        remember(state, rng, { kind: 'reversal', party: p.id, text: `Dropped a manifesto promise after criticism.`, weight: 0.4 });
        p.manifesto.credibility = clamp(p.manifesto.credibility + 0.03);
        return 'Clarified. Some call it a U-turn.';
      }
      const ok = rng.chance(0.3 + staffSkill(p, 'policy_adviser') * 0.5);
      p.manifesto.credibility = clamp(p.manifesto.credibility + (ok ? 0.01 : -0.06));
      return ok ? 'The defence was persuasive enough.' : 'Few were convinced. The manifesto is now a punchline.';
    },
    ai: (_s, _e, rng) => rng.pick(['clarify', 'defend']),
  },
  {
    id: 'court_ruling', scope: 'national',
    weight: () => 0.04,
    build: (_s, _p, rng, shared) => {
      const issue = (shared?.issue as Issue) ?? rng.pick(['identity', 'corruption', 'federalism', 'environment'] as Issue[]);
      return {
        title: `Supreme Court ruling puts ${ISSUE_NAME[issue].toLowerCase()} in the spotlight`, severity: 0.35, visibility: 'public',
        body: `A major judgment this week has made ${ISSUE_NAME[issue].toLowerCase()} a campaign issue overnight.`,
        params: { issue },
        options: [
          { id: 'welcome', label: 'Welcome the ruling', detail: 'Frame it as vindication.', risk: 'Helps only if we own the issue.' },
          { id: 'measured', label: 'Measured response', detail: 'We respect the court.', risk: 'Forgettable.' },
        ],
      };
    },
    resolve: (state, ev, opt) => {
      const p = state.parties[ev.party];
      const issue = String(ev.params.issue) as Issue;
      state.salience[issue] = clamp((state.salience[issue] ?? 0.45) + 0.04);
      if (opt === 'welcome') { p.stats.popularity += (p.issueOwn[issue] - 0.5) * 0.03; return p.issueOwn[issue] > 0.5 ? 'Voters linked the ruling to our long-held position.' : 'It did not stick to us.'; }
      return 'A careful line, noted by nobody.';
    },
    ai: (state, ev) => (state.parties[ev.party].issueOwn[String(ev.params.issue) as Issue] > 0.5 ? 'welcome' : 'measured'),
  },
];

function c0(p: Party) { return p.stats.trust * 0.02; }

export function templateById(id: string) { return TEMPLATES.find((t) => t.id === id); }

// Roll new events for this turn. National events are drawn once and delivered to every
// party with options that suit its position.
export function rollEvents(state: GameState, rng: Rng) {
  const freq = state.config.eventFrequency ?? 1;
  const fresh: GameEvent[] = [];
  for (const t of TEMPLATES.filter((x) => x.scope === 'national')) {
    if (!rng.chance(t.weight(state, state.parties[state.playerParty]) * freq)) continue;
    const shared: Record<string, string | number> = {};
    for (const pid of state.partyOrder) {
      const p = state.parties[pid];
      if (pid === 'OTH') continue;
      const b = t.build(state, p, rng, shared);
      if (!b) continue;
      if (b.params.state) shared.state = b.params.state;
      if (b.params.issue) shared.issue = b.params.issue;
      fresh.push(mkEvent(state, rng, t.id, pid, b));
    }
    const first = fresh.find((e) => e.template === t.id);
    if (first) report(state, rng, { headline: first.title, fact: first.body.split('.')[0] + '.', parties: [state.government?.pmParty ?? state.playerParty], tone: t.id === 'economic_shock' ? -0.3 : 0 });
    if (t.id === 'economic_shock') {
      const issue = String(shared.issue) as Issue;
      state.salience[issue] = clamp((state.salience[issue] ?? 0.45) + 0.12);
      if (state.government) state.government.approval = clamp(state.government.approval - 0.03);
    }
    break; // at most one national event per turn
  }
  for (const pid of state.partyOrder) {
    if (pid === 'OTH') continue;
    const p = state.parties[pid];
    const human = p.controlledBy === 'human';
    // small AI parties get fewer events so the news is not flooded by minor players
    const scale = human ? 1 : p.national || p.seatsPrev > 10 ? 0.7 : 0.35;
    let got = 0;
    for (const t of TEMPLATES.filter((x) => x.scope === 'party')) {
      if (got >= 2) break;
      if (!rng.chance(t.weight(state, p) * freq * scale)) continue;
      const b = t.build(state, p, rng);
      if (!b) continue;
      fresh.push(mkEvent(state, rng, t.id, pid, b));
      got++;
    }
  }
  for (const e of fresh) {
    state.events.push(e);
    const p = state.parties[e.party];
    if (p.controlledBy === 'human') {
      mail(state, rng, { party: p.id, from: 'War room', subject: e.title, body: e.body, importance: e.severity > 0.45 ? 'critical' : 'high', kind: 'event', eventId: e.id });
    } else if (e.visibility === 'public' && templateById(e.template)?.scope === 'party' && (p.national || p.seatsPrev > 8)) {
      report(state, rng, { headline: e.title.replace(/^Allegations against/, `${p.short} candidate faces allegations:`).replace(/^Internal memo leaked/, `${p.short} memo leaked`).replace(/^Questions over campaign spending/, `Questions over ${p.short} spending`), fact: e.body.split('.')[0] + '.', parties: [p.id], tone: -0.2 });
    }
  }
}

function mkEvent(state: GameState, rng: Rng, template: string, party: string, b: Built): GameEvent {
  return { id: uid(rng, 'evt'), template, turn: state.turn, party, title: b.title, body: b.body, severity: b.severity, visibility: b.visibility, params: b.params, options: b.options, deadline: state.turn };
}

export function resolveEvent(state: GameState, eventId: string, option: string, rng: Rng): string | null {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev || ev.resolved) return null;
  const t = templateById(ev.template);
  if (!t || !ev.options.some((o) => o.id === option)) return null;
  const outcome = t.resolve(state, ev, option, rng);
  ev.resolved = option; ev.outcome = outcome;
  remember(state, rng, { kind: 'crisis', party: ev.party, text: `${ev.title}: chose "${ev.options.find((o) => o.id === option)!.label}". ${outcome}`, weight: ev.severity * 0.5 });
  log(state, `${state.parties[ev.party].short}: ${ev.title} → ${option}`, ev.party);
  return outcome;
}

// Called at end of turn: AI parties decide; unanswered human events default to the most
// passive option.
export function settleEvents(state: GameState, rng: Rng) {
  const q = aiQuality(state.config.difficulty);
  for (const ev of state.events) {
    if (ev.resolved) continue;
    const p = state.parties[ev.party];
    const t = templateById(ev.template);
    if (!t) continue;
    if (p.controlledBy === 'ai') resolveEvent(state, ev.id, t.ai(state, ev, rng, q), rng);
    else if (ev.deadline <= state.turn) {
      const passive = ev.options.find((o) => ['wait', 'ignore', 'quiet', 'measured', 'continue'].includes(o.id)) ?? ev.options[ev.options.length - 1];
      const out = resolveEvent(state, ev.id, passive.id, rng);
      mail(state, rng, { party: p.id, from: 'War room', subject: `No decision taken: ${ev.title}`, body: `We did not respond in time, so the default applied ("${passive.label}"). ${out ?? ''}`, importance: 'normal', kind: 'report' });
    }
  }
}
