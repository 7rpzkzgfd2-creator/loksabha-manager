// Builds a fresh GameState from a scenario configuration.

import { FIRST_NAMES, SURNAMES, SEGMENTS, STAFF_ROLES } from './data/catalog.ts';
import { PARTY_BY_ID } from './data/parties.ts';
import type { PartyDef } from './data/parties.ts';
import { SCENARIO_BY_ID } from './data/scenarios.ts';
import { STATES, URBAN_SEATS } from './data/states.ts';
import type { StateDef } from './data/states.ts';
import { clamp, hash, makeRng, uid } from './rng.ts';
import type { Rng } from './rng.ts';
import type {
  Alliance, Candidate, Constituency, CustomPartyInput, Faction, GameState, Issue, Party,
  ScenarioConfig, SegmentId, StaffMember, StaffRole,
} from './types.ts';
import { buildSeatModel, calibrateSeat, evaluateSeat, toSeatResult } from './voters.ts';
import { computeForecast } from './forecast.ts';
import { recomputeCohesion } from './party.ts';
import { applyBranding, buildLeaders, generateTraits, initStateIssues } from './traits.ts';
import { CANDIDACIES, LEADER_BY_ID } from './data/politicians.ts';
import type { CandidacyDef } from './data/politicians.ts';

export const STATES_LIST = STATES;
export const STATE_BY_CODE: Record<string, StateDef> = Object.fromEntries(STATES.map((s) => [s.code, s]));
export const ALL_ISSUES: Issue[] = ['economy', 'inflation', 'jobs', 'agriculture', 'welfare', 'security', 'corruption', 'infrastructure', 'identity', 'federalism', 'health_edu', 'environment'];
export const MAJORITY = 272;

export function personName(rng: Rng, region: StateDef['region']): string {
  return `${rng.pick(FIRST_NAMES[region])} ${rng.pick(SURNAMES[region])}`;
}

export function makeCandidate(rng: Rng, party: Party, stateCode: string, quality: number, recruit?: CustomPartyInput['recruitment']): Candidate {
  const region = STATE_BY_CODE[stateCode]?.region ?? 'North';
  const profile = rng.weighted(['local_notable', 'party_organiser', 'firebrand', 'technocrat', 'dynast', 'turncoat'] as const, (p) =>
    recruit === 'local_notables' ? (p === 'local_notable' ? 4 : 1) : recruit === 'cadre' ? (p === 'party_organiser' ? 4 : 1) : recruit === 'professionals' ? (p === 'technocrat' ? 4 : 1) : ({ local_notable: 3, party_organiser: 3, firebrand: 1.5, technocrat: 1, dynast: 1.2, turncoat: 0.6 })[p]);
  const q = (bias = 0) => clamp(rng.normal(quality + bias, 0.14), 0.05, 0.98);
  const k: Candidate = {
    id: uid(rng, 'cand'), name: personName(rng, region), party: party.id,
    localRep: q(), communication: q(), admin: q(), loyalty: q(0.1), organisation: q(), ethics: q(0.1), controversy: clamp(rng.normal(0.2, 0.12)),
    incumbent: false, vetted: false, profile, age: rng.int(29, 72),
    faction: party.factions.length ? rng.pick(party.factions).id : undefined,
  };
  if (profile === 'local_notable') { k.localRep = clamp(k.localRep + 0.2); k.loyalty = clamp(k.loyalty - 0.15); }
  if (profile === 'party_organiser') { k.organisation = clamp(k.organisation + 0.2); k.loyalty = clamp(k.loyalty + 0.2); k.localRep = clamp(k.localRep - 0.1); }
  if (profile === 'firebrand') { k.communication = clamp(k.communication + 0.25); k.controversy = clamp(k.controversy + 0.25); k.ethics = clamp(k.ethics - 0.1); }
  if (profile === 'technocrat') { k.admin = clamp(k.admin + 0.25); k.communication = clamp(k.communication - 0.1); k.ethics = clamp(k.ethics + 0.1); }
  if (profile === 'dynast') { k.localRep = clamp(k.localRep + 0.15); k.ethics = clamp(k.ethics - 0.05); k.controversy = clamp(k.controversy + 0.1); }
  if (profile === 'turncoat') { k.localRep = clamp(k.localRep + 0.15); k.loyalty = clamp(k.loyalty - 0.35); }
  Object.assign(k, generateTraits(rng, (k.localRep + k.communication + k.admin) / 3, profile, party.manifesto?.policies ? topIssues(party) : []));
  k.recognition = clamp(k.localRep * 0.5 + (k.incumbent ? 0.2 : 0));
  return k;
}

function topIssues(p: Party): Issue[] {
  return (Object.entries(p.issueOwn ?? {}) as [Issue, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i]) => i);
}

// A real politician contesting this seat in this scenario. Attributes are gameplay
// estimates; the person never gets controversy risk, since the game must not invent
// allegations about real people.
function realCandidate(rng: Rng, p: Party, d: CandidacyDef, scenario: string): Candidate {
  const q = (base: number) => clamp(rng.normal(base, 0.08), 0.2, 0.97);
  const lead = LEADER_BY_ID[d.id];
  const tr = makeRng(hash(`real:${d.id}:${scenario}`));
  const k: Candidate = {
    id: `real_${d.id}_${d.seat.replace(/\W+/g, '')}`, name: d.name, party: p.id,
    localRep: q(0.45 + d.recognition * 0.35), communication: q(0.5 + d.recognition * 0.3), admin: q(0.6), loyalty: q(0.8), organisation: q(0.6),
    ethics: 0.7, controversy: 0, incumbent: false, vetted: true, profile: 'party_organiser', age: 50,
    real: d.id, recognition: d.recognition,
  };
  Object.assign(k, generateTraits(tr, 0.5 + d.recognition * 0.3, 'party_organiser', lead?.strong ?? topIssues(p), lead?.weak ?? [], true));
  return k;
}

export function makeStaff(rng: Rng, role: StaffRole, turn: number, quality = 0.55): StaffMember {
  const skill = Math.round(clamp(rng.normal(quality, 0.15), 0.15, 0.97) * 100);
  return {
    id: uid(rng, 'staff'), name: personName(rng, rng.pick(['North', 'West', 'South', 'East', 'Central'] as const)), role,
    skill, secondary: Math.round(clamp(rng.normal(0.45, 0.18), 0.1, 0.9) * 100),
    salary: Math.round((0.15 + skill / 100 * 0.6) * 100) / 100,
    morale: 0.75, workload: 0, experience: rng.int(0, 15),
    trait: rng.pick(['steady', 'brilliant-erratic', 'loyal', 'ambitious', 'cautious'] as const),
    hiredTurn: turn,
  };
}

export function staffMarket(rng: Rng, turn: number): StaffMember[] {
  return STAFF_ROLES.flatMap((r) => [makeStaff(rng, r.id, turn, 0.45), makeStaff(rng, r.id, turn, 0.62)]);
}

function makeFactions(rng: Rng, def: { homeStates: string[]; short: string }, cohesion: number): Faction[] {
  const sat = () => clamp(rng.normal(cohesion, 0.08));
  const f: Faction[] = [
    { id: 'loyal', name: 'Leadership loyalists', outlook: 'loyalist', strength: 0.35, satisfaction: sat(), grievances: [] },
    { id: 'reform', name: 'Young reformers', outlook: 'reformist', strength: 0.2, satisfaction: sat(), grievances: [] },
    { id: 'ideo', name: 'Ideological core', outlook: 'ideologue', strength: 0.2, satisfaction: sat(), grievances: [] },
  ];
  if (def.homeStates.length) {
    const hs = def.homeStates[0];
    f.push({ id: 'regional', name: `${STATE_BY_CODE[hs]?.name ?? hs} bloc`, outlook: 'regional', strength: 0.25, satisfaction: sat(), grievances: [], homeState: hs });
  } else f[0].strength += 0.25;
  return f;
}

function partyFromDef(def: PartyDef, rng: Rng, config: ScenarioConfig, isPlayer: boolean): Party {
  const issueOwn = Object.fromEntries(ALL_ISSUES.map((i) => [i, def.owns[i] ?? 0.4])) as Record<Issue, number>;
  let funds = def.funds;
  const rivalMul = config.sandbox?.rivalStrength ?? 1;
  if (isPlayer) funds *= config.difficulty === 'easy' ? 1.25 : config.difficulty === 'hard' ? 0.8 : 1;
  else funds *= rivalMul;
  const p: Party = {
    id: def.id, name: def.name, short: def.short, color: def.color, color2: def.color2, symbol: def.symbol,
    ideology: { ...def.ideology }, national: def.national, homeStates: def.homeStates, leader: def.leader, leaderStyle: def.leaderStyle,
    stats: {
      popularity: 0, leaderPop: def.leaderPop, leaderCentrality: def.leaderStyle === 'charismatic' ? 0.8 : def.leaderStyle === 'populist' ? 0.65 : 0.45,
      organisation: def.organisation, funds: Math.round(funds), income: Math.round(def.funds * 0.03 * 10) / 10,
      cohesion: def.cohesion, trust: def.trust, media: def.media, momentum: 0, enthusiasm: 0,
      candidateQuality: def.candidateQuality, campaignSkill: clamp(def.campaignSkill * (isPlayer ? 1 : rivalMul)), volunteerMorale: 0.65,
      fiscalCredibility: clamp(0.45 + def.ideology.econ * 0.2), shadowExposure: 0, shadowTotal: 0,
    },
    issueOwn, factions: makeFactions(rng, def, def.cohesion), staff: [],
    manifesto: { policies: [], credibility: 0.5, locked: false, announcedTurn: {} },
    ai: { risk: def.risk, allianceAppetite: def.allianceAppetite, regionalFocus: def.national ? 0.3 : 0.9, aggression: def.aggression },
    controlledBy: 'ai', custom: false, provenance: 'estimate', seatsPrev: 0,
  };
  return p;
}

// Custom parties pay for every advantage out of a fixed launch budget.
export function customLaunchCost(c: CustomPartyInput): number {
  return c.startingFunds + c.recognition * 300 + (c.focusIssues.length > 2 ? 40 : 0);
}
export const CUSTOM_BUDGET = 260;

function partyFromCustom(c: CustomPartyInput, rng: Rng, config: ScenarioConfig): Party {
  const over = Math.max(0, customLaunchCost(c) - CUSTOM_BUDGET);
  const funds = Math.max(5, c.startingFunds - over); // overspending is clawed back from cash
  const structure = c.structure;
  const issueOwn = Object.fromEntries(ALL_ISSUES.map((i) => [i, c.focusIssues.includes(i) ? 0.58 : 0.36])) as Record<Issue, number>;
  const def = { homeStates: [c.homeState], short: c.short };
  const cohesion = structure === 'centralised' ? 0.8 : structure === 'federated' ? 0.6 : 0.7;
  const p: Party = {
    id: 'CUSTOM', name: c.name || 'New Party', short: (c.short || 'NEW').slice(0, 6).toUpperCase(), color: c.color, color2: c.color2, symbol: c.symbol,
    ideology: { ...c.ideology }, national: false, homeStates: [c.homeState], leader: c.leaderName || 'You', leaderStyle: c.leaderStyle,
    stats: {
      popularity: 0, leaderPop: clamp(0.35 + c.recognition * 0.3), leaderCentrality: c.leaderStyle === 'charismatic' || c.leaderStyle === 'populist' ? 0.75 : 0.45,
      organisation: structure === 'movement' ? 0.25 : structure === 'federated' ? 0.4 : 0.32,
      funds: Math.round(funds * (config.difficulty === 'easy' ? 1.25 : config.difficulty === 'hard' ? 0.8 : 1)), income: Math.round(funds * 0.04 * 10) / 10,
      cohesion, trust: 0.5, media: clamp(0.15 + c.recognition * 0.5), momentum: 0, enthusiasm: 0.01,
      candidateQuality: c.recruitment === 'professionals' ? 0.55 : c.recruitment === 'local_notables' ? 0.52 : 0.47, campaignSkill: 0.45,
      volunteerMorale: structure === 'movement' ? 0.85 : 0.65, fiscalCredibility: clamp(0.45 + c.ideology.econ * 0.2), shadowExposure: 0, shadowTotal: 0,
    },
    issueOwn, factions: makeFactions(rng, def, cohesion), staff: [],
    manifesto: { policies: [], credibility: 0.5, locked: false, announcedTurn: {} },
    ai: { risk: 0.5, allianceAppetite: 0.5, regionalFocus: 0.8, aggression: 0.5 },
    controlledBy: 'human', custom: true, provenance: 'player', seatsPrev: 0,
  };
  if (structure === 'federated') p.factions.forEach((f) => { if (f.outlook === 'regional') f.strength += 0.15; });
  return p;
}

function segmentMix(st: StateDef, urban: number): { id: SegmentId; w: number }[] {
  const rural = 1 - urban;
  const raw: Record<SegmentId, number> = {
    farmers: rural * (0.25 + st.agri * 0.25),
    agri_labour: rural * (0.2 + (1 - st.income) * 0.2),
    urban_middle: urban * (0.3 + st.income * 0.25),
    urban_poor: urban * (0.3 + (1 - st.income) * 0.15),
    traders: 0.06 + urban * 0.08,
    youth: 0.16,
    public_sector: 0.06 + urban * 0.04,
    welfare_hh: 0.08 + (1 - st.income) * 0.12,
  };
  const tot = Object.values(raw).reduce((a, b) => a + b, 0);
  return SEGMENTS.map((s) => ({ id: s.id, w: raw[s.id] / tot }));
}

// Small, explicit urban/rural tilts on the baseline (game assumption).
const URBAN_TILT: Record<string, number> = { BJP: 0.25, AAP: 0.3, INC: 0, CPIM: -0.2, CPI: -0.2, BSP: -0.25, SP: -0.15, JDS: -0.3, SAD: -0.2, RJD: -0.15, JDU: -0.1, YSRCP: -0.15, BRS: -0.05, OTH: -0.1 };

export function createGame(config: ScenarioConfig): GameState {
  const rng = makeRng(config.seed);
  const sc = SCENARIO_BY_ID[config.scenarioId] ?? SCENARIO_BY_ID.ls2029;
  const parties: Record<string, Party> = {};
  const human = config.humanParties ?? {};
  for (const id of sc.parties) {
    const def = PARTY_BY_ID[id];
    if (!def) continue;
    const isPlayer = id === config.playerParty || !!human[id];
    parties[id] = partyFromDef(def, rng, config, isPlayer);
    if (isPlayer) { parties[id].controlledBy = 'human'; parties[id].playerId = human[id]; }
  }
  if (config.playerParty === 'CUSTOM' && config.customParty) {
    parties.CUSTOM = partyFromCustom(config.customParty, rng, config);
  }
  const player = parties[config.playerParty] ?? parties.BJP;
  player.controlledBy = 'human';
  if (config.mode === 'sandbox' && config.sandbox) {
    const sb = config.sandbox;
    if (sb.popularity !== undefined) player.stats.popularity = sb.popularity;
    if (sb.funds !== undefined) player.stats.funds = sb.funds;
    if (sb.organisation !== undefined) player.stats.organisation = sb.organisation;
  }
  player.staff = [makeStaff(rng, 'campaign_manager', 0, 0.5), makeStaff(rng, 'communications', 0, 0.45)];
  // AI parties have an implicit staff via campaignSkill; humans in multiplayer get the same starter team
  for (const id of Object.keys(human)) if (parties[id] && parties[id] !== player) parties[id].staff = [makeStaff(rng, 'campaign_manager', 0, 0.5), makeStaff(rng, 'communications', 0, 0.45)];

  const salience = Object.fromEntries(ALL_ISSUES.map((i) => [i, 0.45])) as Record<Issue, number>;
  Object.assign(salience, sc.salience);

  for (const p of Object.values(parties)) {
    if (!p.custom) applyBranding(p, sc.id);
    p.leaders = buildLeaders(p, sc.id);
    p.stateBudget = {}; p.stateSpent = {};
  }

  const states: GameState['states'] = {};
  for (const st of STATES) {
    states[st.code] = { code: st.code, mood: {}, airwar: {}, salience: {}, disaster: 0 };
    initStateIssues(states[st.code], st, salience, config.sandbox?.economy ?? sc.economy);
    const m = config.sandbox?.stateMood?.[st.code];
    if (m !== undefined) states[st.code].mood[player.id] = m;
  }

  const seats: Constituency[] = [];
  for (const st of STATES) {
    const table = sc.shares[st.code] ?? {};
    st.seats.forEach((name, idx) => {
      const h = hash(`${st.code}:${name}`);
      const hr = makeRng(h);
      const urban = URBAN_SEATS.has(name) ? clamp(0.75 + hr.next() * 0.2) : clamp(st.urban * (0.45 + hr.next() * 0.8), 0.04, 0.7);
      const electors = st.seats.length === 1 && ['LD', 'LA', 'SK', 'AN', 'DD', 'DN', 'PY', 'CH', 'MZ', 'NL'].includes(st.code)
        ? Math.round(({ LD: 57000, LA: 182000, SK: 464000, AN: 315000, DD: 134000, DN: 283000, PY: 1023000, CH: 659000, MZ: 861000, NL: 1330000 } as Record<string, number>)[st.code])
        : Math.round(1500000 + hr.next() * 600000);
      const issuesPool = ALL_ISSUES.slice().sort((a, b) => ((st.issues[b] ?? 0) + hr.next() * 0.5 + (urban > 0.6 && (b === 'infrastructure' || b === 'environment') ? 0.3 : 0)) - ((st.issues[a] ?? 0) + hr.next() * 0.5));
      const base: Record<string, number> = {};
      let tot = 0;
      for (const [pid, share] of Object.entries(table)) {
        if (!parties[pid]) continue;
        const tilt = (URBAN_TILT[pid] ?? 0) * (urban - 0.3);
        const v = share * Math.exp(rng.normal(0, 0.22) + tilt);
        base[pid] = v; tot += v;
      }
      if (parties.CUSTOM && config.customParty) {
        const home = config.customParty.homeState === st.code;
        const rec = config.customParty.recognition;
        base.CUSTOM = home ? (0.1 + rec * 0.28) * Math.exp(rng.normal(0, 0.25)) : (STATE_BY_CODE[config.customParty.homeState]?.region === st.region ? 0.012 + rec * 0.02 : 0.004);
        tot += base.CUSTOM;
      }
      const others = Math.max(0.05, 1 - tot);
      base.OTH = others;
      const norm = tot + others;
      for (const k of Object.keys(base)) base[k] /= norm;
      const c: Constituency = {
        id: `${st.code}-${String(idx + 1).padStart(2, '0')}`, name, state: st.code, idx, urban, electors,
        turnoutBase: clamp(st.turnout + hr.normal(0, 0.04), 0.4, 0.9),
        localIssues: issuesPool.slice(0, 2), segments: segmentMix(st, urban), base, offsets: {},
        candidates: {}, org: {}, persuasion: {}, pending: {}, mobilisation: {}, saturation: {}, spend: {}, visits: {},
        rebel: 0, incumbent: 'OTH', prev: null,
      };
      for (const pid of Object.keys(base)) {
        const p = parties[pid];
        if (!p) continue;
        const contests = pid === 'OTH' || base[pid] >= 0.012 || (pid === 'CUSTOM' && (config.customParty?.homeState === st.code));
        if (contests) c.candidates[pid] = makeCandidate(rng, p, st.code, p.stats.candidateQuality, pid === 'CUSTOM' ? config.customParty?.recruitment : undefined);
        const homeBoost = p.homeStates.includes(st.code) ? 0.15 : 0;
        c.org[pid] = clamp(p.stats.organisation * (0.25 + base[pid] * 1.6) + homeBoost, 0.02, 0.95);
      }
      seats.push(c);
    });
  }

  const state: GameState = {
    version: 1, id: uid(rng, 'game'), config, rng: 0, turn: 1, cycle: 1, year: sc.year, campaignTurn: 1,
    phase: 'campaign', stage: 'preparation', economy: config.sandbox?.economy ?? sc.economy, salience,
    parties, partyOrder: Object.keys(parties), playerParty: player.id, states, seats,
    alliances: [], proposals: [], events: [], inbox: [], news: [], delayed: [], memory: [], relations: {},
    polls: [], seatForecast: {}, outcomes: [], shadow: [], queued: {}, pollBias: {}, counting: null, results: [], formation: null,
    government: { pmParty: sc.incumbentGov, partners: [], outside: [], ministries: {}, approval: 0.5, stability: 0.7, fiscalSpace: 10, adminCapacity: 0.6, year: 5, promises: [], confidenceVotes: 0 },
    career: [], milestones: [], log: [], turnSummary: [], rejectedAspirants: {}, tutorialStep: 0,
  };

  if (!(config.mode === 'sandbox' && config.sandbox?.noAlliances)) {
    for (const a of sc.alliances) {
      const members = a.members.filter((m) => parties[m]);
      if (members.length < 2 || !parties[a.leader]) continue;
      const al: Alliance = { id: a.id, name: a.name, members, leader: a.leader, trust: 0.6, formedTurn: 0, friendlyFights: a.friendlyFights, seatAlloc: {}, demands: {}, preset: true };
      state.alliances.push(al);
    }
    state.government!.partners = state.alliances.find((a) => a.leader === sc.incumbentGov)?.members.filter((m) => m !== sc.incumbentGov) ?? [];
    for (const a of state.alliances) allocateSeats(state, a);
  }

  for (const pid of state.partyOrder) {
    state.relations[pid] = {};
    for (const q of state.partyOrder) {
      if (q === pid) continue;
      const same = state.alliances.some((a) => a.members.includes(pid) && a.members.includes(q));
      const d = Math.sqrt((parties[pid].ideology.econ - parties[q].ideology.econ) ** 2 + (parties[pid].ideology.social - parties[q].ideology.social) ** 2) / 2.8;
      state.relations[pid][q] = clamp((same ? 0.45 : 0) + 0.3 - d, -1, 1);
    }
  }

  placeRealCandidates(state, rng);
  for (const c of seats) calibrateSeat(state, c);

  // A simulated "previous" contest seeds incumbents. It is labelled simulated in the UI.
  // It took place five years earlier, so national and state moods differed from today's.
  const prevNat: Record<string, number> = Object.fromEntries(state.partyOrder.map((p) => [p, rng.normal(0, 0.18)]));
  const prevState: Record<string, Record<string, number>> = {};
  for (const st of STATES) prevState[st.code] = Object.fromEntries(state.partyOrder.map((p) => [p, rng.normal(0, 0.18)]));
  for (const c of seats) {
    const m = buildSeatModel(state, c);
    const prevShock = { party: Object.fromEntries(m.all.map((p) => [p, prevNat[p] + prevState[c.state][p]])), turnout: rng.normal(0, 0.02) };
    const ev = evaluateSeat(state, m, prevShock, 0.12, rng);
    c.prev = toSeatResult(state, c, ev.shares, ev.turnout, rng);
    c.incumbent = c.prev.winner;
    if (c.candidates[c.incumbent] && rng.chance(0.6)) c.candidates[c.incumbent].incumbent = true;
    parties[c.incumbent].seatsPrev = (parties[c.incumbent].seatsPrev ?? 0) + 1;
  }

  for (const pid of state.partyOrder) {
    state.pollBias[pid] = pid === 'OTH' ? 0 : rng.normal(0, 0.07);
    recomputeCohesion(state.parties[pid]);
  }

  state.rng = rng.state();
  state.polls.push(computeForecast(state, 0));
  welcomeInbox(state);
  return state;
}

// Put real politicians on the ballot where they contested in this scenario. Where an
// alliance shares the seat, the seat goes to that person's party, as it did in reality.
function placeRealCandidates(state: GameState, rng: Rng) {
  const sc = state.config.scenarioId;
  for (const d of CANDIDACIES) {
    if (d.scenario !== sc) continue;
    const p = state.parties[d.party];
    const c = state.seats.find((x) => x.state === d.state && x.name === d.seat);
    if (!p || !c) continue;
    const a = state.alliances.find((x) => x.members.includes(d.party));
    if (a) {
      for (const m of a.members) if (m !== d.party && c.candidates[m] && !a.friendlyFights.includes(c.state)) delete c.candidates[m];
      a.seatAlloc[c.id] = d.party;
    }
    if ((c.base[d.party] ?? 0) < 0.012) c.base[d.party] = 0.012;
    c.candidates[d.party] = realCandidate(rng, p, d, sc);
  }
}

export function allocateSeats(state: GameState, a: Alliance) {
  const rng = makeRng(hash(a.id + state.turn) ^ state.rng);
  a.seatAlloc = {};
  for (const c of state.seats) {
    const members = a.members.filter((m) => c.candidates[m]);
    if (members.length === 0) continue;
    if (a.friendlyFights.includes(c.state) && members.length > 1) continue;
    const realOwner = members.find((m) => c.candidates[m]?.real);
    const best = realOwner ?? members.slice().sort((x, y) => (c.base[y] ?? 0) * (1 + (y === a.leader ? 0.05 : 0)) - (c.base[x] ?? 0) * (1 + (x === a.leader ? 0.05 : 0)))[0];
    a.seatAlloc[c.id] = best;
    for (const m of members) {
      if (m === best) continue;
      const k = c.candidates[m];
      delete c.candidates[m];
      // a strong local aspirant who loses the ticket to an ally may run as a rebel
      if (k && k.localRep > 0.7 && k.loyalty < 0.4 && rng.chance(0.35)) {
        c.rebel = clamp(0.04 + (k.localRep - 0.7) * 0.4, 0, 0.15);
        c.rebelFrom = best;
        if (!c.candidates.OTH) c.candidates.OTH = { ...k, party: 'OTH', id: k.id + '_reb' };
      }
    }
  }
}

function welcomeInbox(state: GameState) {
  const p = state.parties[state.playerParty];
  const sc = SCENARIO_BY_ID[state.config.scenarioId];
  const turns = state.config.campaignTurns;
  const mgr = p.staff.find((s) => s.role === 'campaign_manager');
  state.inbox.push({
    id: 'welcome', turn: 1, party: p.id, from: mgr ? `${mgr.name}, Campaign manager` : 'Party office', importance: 'high', kind: 'info', read: false,
    subject: `Briefing: ${sc?.title ?? 'General election'}`,
    body: `You lead the ${p.name}. We have ${turns} weeks until polling day and ₹${p.stats.funds} crore in the war chest.\n\nThe first two weeks are preparation: tickets, manifesto and alliance terms lock at the end of week 2. After that, every rupee and every leader-day counts.\n\nA reminder about the arithmetic: 272 seats is a majority, and seats are won one constituency at a time. A big national vote share spread thinly can still lose.`,
  });
}
