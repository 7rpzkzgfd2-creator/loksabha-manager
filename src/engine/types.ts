// Core data model for the simulation. Everything here is plain serialisable data so a
// whole game can be saved to JSON, sent over the wire and replayed from a seed.

export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameMode = 'career' | 'quick' | 'historical' | 'sandbox' | 'multiplayer';
export type Issue =
  | 'economy' | 'inflation' | 'jobs' | 'agriculture' | 'welfare' | 'security'
  | 'corruption' | 'infrastructure' | 'identity' | 'federalism' | 'health_edu' | 'environment';
export type SegmentId =
  | 'farmers' | 'agri_labour' | 'urban_middle' | 'urban_poor'
  | 'traders' | 'youth' | 'public_sector' | 'welfare_hh';
export type Phase = 'campaign' | 'counting' | 'formation' | 'governance' | 'ended';
export type CampaignStage = 'preparation' | 'campaign' | 'final_push';

// Where a number came from. Shown in the UI next to data that could be mistaken for fact.
export type Provenance = 'historical' | 'estimate' | 'simulated' | 'player' | 'generated';

export interface Ideology {
  econ: number; // -1 state-led/left .. +1 market
  social: number; // -1 liberal/secular .. +1 conservative/nationalist
  federal: number; // -1 centralising .. +1 regional autonomy
  welfare: number; // 0..1 emphasis on direct welfare
}

export interface Faction {
  id: string;
  name: string;
  outlook: 'loyalist' | 'reformist' | 'regional' | 'ideologue';
  strength: number; // share of party influence, sums ~1
  satisfaction: number; // 0..1
  homeState?: string;
  grievances: string[];
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  skill: number; // 0..100
  secondary: number; // 0..100, skill outside the main role (e.g. negotiation)
  salary: number; // crore per turn
  morale: number; // 0..1
  workload: number; // actions this turn
  experience: number;
  trait: 'steady' | 'brilliant-erratic' | 'loyal' | 'ambitious' | 'cautious';
  assignedState?: string;
  hiredTurn: number;
}

export type StaffRole =
  | 'campaign_manager' | 'strategist' | 'data_analyst' | 'communications' | 'finance'
  | 'regional_coordinator' | 'candidate_manager' | 'policy_adviser' | 'negotiator'
  | 'volunteer_coordinator' | 'crisis_adviser';

export interface Candidate {
  id: string;
  name: string;
  party: string;
  localRep: number; // 0..1
  communication: number;
  admin: number;
  loyalty: number;
  organisation: number;
  ethics: number; // hidden-ish: true value. Player sees ethicsKnown when vetted.
  controversy: number; // 0..1 latent scandal risk
  faction?: string;
  incumbent: boolean;
  vetted: boolean;
  profile: 'local_notable' | 'party_organiser' | 'firebrand' | 'technocrat' | 'dynast' | 'turncoat';
  age: number;
}

export interface ManifestoState {
  policies: string[];
  credibility: number; // 0..1
  locked: boolean;
  announcedTurn: Record<string, number>;
}

export interface PartyStats {
  popularity: number; // national utility shift stock (around 0)
  leaderPop: number; // 0..1
  leaderCentrality: number; // 0..1 how presidential the campaign is
  organisation: number; // 0..1 national machine
  funds: number; // crore
  income: number; // crore per turn baseline
  cohesion: number; // 0..1 derived from factions
  trust: number; // 0..1
  media: number; // 0..1 media presence
  momentum: number; // -1..1
  enthusiasm: number; // turnout shift for supporters, -0.1..0.1
  candidateQuality: number; // 0..1 pool quality
  campaignSkill: number; // 0..1
  volunteerMorale: number; // 0..1
  fiscalCredibility: number; // 0..1
  shadowExposure: number; // 0..1 hidden risk from illegal funding and bribes
  shadowTotal: number; // crore taken off the books, cumulative
}

export interface Party {
  id: string;
  name: string;
  short: string;
  color: string;
  color2: string;
  symbol: string; // original glyph key, not an ECI symbol
  ideology: Ideology;
  national: boolean;
  homeStates: string[];
  leader: string; // fictional leader name
  leaderStyle: 'charismatic' | 'technocratic' | 'populist' | 'consensual' | 'combative';
  stats: PartyStats;
  issueOwn: Record<Issue, number>; // credibility per issue 0..1
  factions: Faction[];
  staff: StaffMember[];
  manifesto: ManifestoState;
  ai: AIProfile;
  controlledBy: 'ai' | 'human';
  playerId?: string;
  custom: boolean;
  provenance: Provenance;
  seatsPrev: number;
}

export interface AIProfile {
  risk: number; // 0..1
  allianceAppetite: number;
  regionalFocus: number; // 0..1 prefers home states
  aggression: number; // attacks rivals
}

export interface SegmentMix { id: SegmentId; w: number }

export interface Constituency {
  id: string;
  name: string;
  state: string;
  idx: number; // index within state, for map tiles
  urban: number;
  electors: number;
  turnoutBase: number;
  localIssues: Issue[];
  segments: SegmentMix[];
  base: Record<string, number>; // calibrated starting share per party (estimate/simulated)
  offsets: Record<string, Record<SegmentId, number>>; // calibration constants
  candidates: Record<string, Candidate>; // party -> candidate
  org: Record<string, number>; // party -> 0..1
  persuasion: Record<string, number>; // party -> utility stock
  pending: Record<string, number>; // persuasion that lands next turn
  mobilisation: Record<string, number>; // party -> turnout stock
  saturation: Record<string, number>; // party -> 0..1 audience fatigue
  spend: Record<string, number>; // cumulative crore
  visits: Record<string, number>; // count of events
  rebel: number; // fraction of the official candidate's vote taken by a rebel independent
  rebelFrom?: string;
  incumbent: string; // party holding seat
  prev: SeatResult | null;
}

export interface SeatResult {
  shares: Record<string, number>;
  votes: Record<string, number>;
  turnout: number;
  winner: string;
  runnerUp: string;
  margin: number; // share points 0..1
  winnerCandidate: string;
  lostDeposits: string[];
  tieBroken: boolean;
}

export interface StateRuntime {
  code: string;
  mood: Record<string, number>; // party -> utility stock
  airwar: Record<string, number>; // party -> digital/media stock
  salience: Partial<Record<Issue, number>>;
  disaster: number; // 0..1 active disruption
}

export interface Alliance {
  id: string;
  name: string;
  members: string[];
  leader: string;
  trust: number; // 0..1
  formedTurn: number;
  friendlyFights: string[]; // state codes where members contest against each other
  seatAlloc: Record<string, string>; // constituencyId -> party contesting for the alliance
  demands: Record<string, number>; // party -> seats asked
  preset: boolean;
}

export interface DelayedEffect {
  id: string;
  dueTurn: number;
  kind: string;
  party: string;
  params: Record<string, number | string>;
  note: string;
}

export interface MemoryEntry {
  id: string;
  turn: number;
  cycle: number;
  kind: 'promise' | 'promise_kept' | 'promise_broken' | 'alliance' | 'alliance_broken' | 'candidate' | 'controversy' | 'crisis' | 'reversal' | 'finance' | 'result' | 'faction' | 'organisation';
  party: string;
  other?: string;
  text: string;
  weight: number;
}

export interface EventOption {
  id: string;
  label: string;
  detail: string;
  risk: string;
  cost?: number;
}

export interface GameEvent {
  id: string;
  template: string;
  turn: number;
  party: string; // primarily affected party
  title: string;
  body: string;
  severity: number; // 0..1
  visibility: 'public' | 'private';
  params: Record<string, number | string>;
  options: EventOption[];
  deadline: number;
  resolved?: string;
  outcome?: string;
}

export interface InboxMessage {
  id: string;
  turn: number;
  party: string; // recipient
  from: string;
  subject: string;
  body: string;
  importance: 'critical' | 'high' | 'normal' | 'low';
  kind: 'event' | 'report' | 'warning' | 'proposal' | 'result' | 'info';
  eventId?: string;
  proposalId?: string;
  read: boolean;
}

export interface NewsItem {
  id: string;
  turn: number;
  outlet: string;
  headline: string;
  fact: string; // what happened, neutral record
  spin: string; // the outlet's take
  parties: string[];
  tone: number; // -1..1 for parties[0]
}

export interface Proposal {
  id: string;
  kind: 'alliance' | 'coalition';
  from: string;
  to: string;
  seatsAsked: number; // alliance: seats `to` would contest in shared states
  ministries: number;
  concession?: Issue;
  pmPost?: boolean;
  status: 'open' | 'accepted' | 'rejected' | 'expired';
  turn: number;
  note: string;
}

export type ActionType =
  | 'rally' | 'town_hall' | 'door_to_door' | 'roadshow' | 'press_conference'
  | 'digital' | 'org_build' | 'research' | 'policy_announce' | 'volunteer_drive';

export interface CampaignAction {
  id: string; // client nonce, used for de-duplication
  party: string;
  type: ActionType;
  constituency?: string;
  state?: string;
  issue?: Issue;
  speaker?: 'leader' | 'candidate';
  budget?: number; // crore for scalable actions
  policy?: string;
  withAllies?: boolean;
}

export interface ActionOutcome {
  actionId: string;
  party: string;
  type: ActionType;
  turn: number;
  where: string;
  constituency?: string;
  state?: string;
  cost: number;
  reported: string; // what the party's own people say
  quality: number; // -1..1 hidden truth, revealed partially
  attendance?: number;
  reportedAttendance?: number;
  notes: string[];
}

export interface ShadowDeal {
  id: string;
  turn: number;
  party: string;
  kind: 'poach' | 'funding';
  amount: number;
  target?: string; // candidate id
  seat?: string;
  from?: string;
  success: boolean;
  exposed: boolean;
  text: string;
}

export interface PollPoint {
  turn: number;
  seats: Record<string, [number, number, number]>; // p10, median, p90
  shares: Record<string, number>;
  bloc: Record<string, number>;
}

export interface SeatForecast {
  id: string;
  leader: string;
  probs: Record<string, number>;
  shares: Record<string, number>;
  rating: 'safe' | 'likely' | 'lean' | 'tossup';
}

export interface CountingState {
  round: number;
  totalRounds: number;
  seatRounds: Record<string, number>; // rounds needed per seat
  final: Record<string, SeatResult>;
}

export interface ElectionResult {
  cycle: number;
  year: number;
  seats: Record<string, SeatResult>;
  partySeats: Record<string, number>;
  partyVotes: Record<string, number>;
  voteShare: Record<string, number>;
  turnout: number;
  blocSeats: Record<string, number>;
  forecastAtPoll: Record<string, number>;
  autopsy: AutopsyItem[];
}

export interface AutopsyItem {
  party: string;
  heading: string;
  detail: string;
  confidence: 'strong' | 'plausible' | 'uncertain';
}

export interface Government {
  pmParty: string;
  partners: string[]; // inside government
  outside: string[]; // outside support
  ministries: Record<string, number>;
  approval: number; // 0..1
  stability: number; // 0..1
  fiscalSpace: number; // crore-equivalent units per year
  adminCapacity: number; // 0..1
  year: number;
  promises: { policy: string; party: string; status: 'pending' | 'kept' | 'broken' | 'partial' }[];
  confidenceVotes: number;
}

export interface FormationState {
  round: number;
  maxRounds: number;
  commitments: Record<string, string>; // party -> bloc leader party
  offers: Proposal[];
  log: string[];
}

export interface CareerEntry {
  cycle: number;
  year: number;
  party: string;
  seats: number;
  voteShare: number;
  outcome: string;
  inGovernment: boolean;
}

export interface Milestone { id: string; title: string; turn: number; cycle: number }

export interface ScenarioConfig {
  scenarioId: string;
  mode: GameMode;
  difficulty: Difficulty;
  playerParty: string; // id; for custom parties 'CUSTOM'
  customParty?: CustomPartyInput;
  seed: number;
  campaignTurns: number;
  eventFrequency: number; // 0.5..2
  sandbox?: SandboxOptions;
  humanParties?: Record<string, string>; // multiplayer: party -> playerId
}

export interface SandboxOptions {
  popularity?: number; // utility shift for player party
  funds?: number;
  organisation?: number;
  economy?: number; // -1..1 national economic mood
  rivalStrength?: number; // 0.5..1.5 multiplies rival funds/skill
  stateMood?: Record<string, number>;
  noAlliances?: boolean;
}

export interface CustomPartyInput {
  name: string;
  short: string;
  color: string;
  color2: string;
  symbol: string;
  ideology: Ideology;
  homeState: string;
  leaderName: string;
  leaderStyle: Party['leaderStyle'];
  structure: 'centralised' | 'federated' | 'movement';
  recruitment: 'local_notables' | 'cadre' | 'professionals';
  focusIssues: Issue[];
  startingFunds: number;
  recognition: number; // 0..1
}

export interface SimLog { turn: number; text: string; party?: string }

export interface GameState {
  version: number;
  id: string;
  config: ScenarioConfig;
  rng: number;
  turn: number; // global turn counter
  cycle: number; // election cycle index
  year: number;
  campaignTurn: number; // 1..campaignTurns within current cycle
  phase: Phase;
  stage: CampaignStage;
  economy: number; // -1..1 national mood about the economy
  salience: Record<Issue, number>;
  parties: Record<string, Party>;
  partyOrder: string[];
  playerParty: string;
  states: Record<string, StateRuntime>;
  seats: Constituency[];
  alliances: Alliance[];
  proposals: Proposal[];
  events: GameEvent[];
  inbox: InboxMessage[];
  news: NewsItem[];
  delayed: DelayedEffect[];
  memory: MemoryEntry[];
  relations: Record<string, Record<string, number>>; // -1..1
  polls: PollPoint[];
  seatForecast: Record<string, SeatForecast>; // derived, refreshed every turn
  outcomes: ActionOutcome[];
  shadow: ShadowDeal[]; // private ledger; only the owning party can see its own entries
  queued: Record<string, CampaignAction[]>; // party -> actions submitted this turn
  pollBias: Record<string, number>; // hidden polling error per party
  counting: CountingState | null;
  results: ElectionResult[];
  formation: FormationState | null;
  government: Government | null;
  career: CareerEntry[];
  milestones: Milestone[];
  log: SimLog[];
  turnSummary: string[];
  rejectedAspirants: Record<string, number>; // constituency -> aspirant strength (rebels)
  tutorialStep: number;
}
