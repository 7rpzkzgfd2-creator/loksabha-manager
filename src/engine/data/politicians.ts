// Real politicians, election symbols and scenario-specific party identities.
//
// What is factual here: names, which party a person belonged to in a given election, the
// constituency they contested in that election, and broad public roles at that time. These
// were compiled from public records (ECI results, Lok Sabha records, party sources) for the
// game and should be checked against ECI before being cited.
// What is NOT factual: every number (recognition, popularity, effectiveness) and every
// strong/weak issue. Those are gameplay estimates and are labelled as such in the UI.
// Nothing in this file says anything about anyone's private conduct, and the game never
// attaches scandals, bribes or defections to real people: those systems only touch
// generated, fictional candidates. For the same reason, corruption is never listed as a
// real person's weak issue: it could read as an allegation rather than a policy profile.

import type { Issue } from '../types.ts';

export type ScenarioId = 'ls2014' | 'ls2019' | 'ls2024' | 'ls2029';

export const DATA_NOTE = 'Names, party affiliations, contested seats and public roles compiled from public records (ECI results, Lok Sabha records, party sources). Check against ECI before citing. All numbers and issue strengths are gameplay estimates.';
export const DATA_COMPILED = '2026-11-01';

// ECI election symbols per party. Stored as names, not images: the game does not ship
// official artwork and shows a plain name badge instead of imitating it.
export const ELECTION_SYMBOLS: Record<string, Partial<Record<ScenarioId, string>> & { default: string }> = {
  BJP: { default: 'Lotus' },
  INC: { default: 'Hand' },
  AAP: { default: 'Broom' },
  AITC: { default: 'Flowers and Grass (Jora Ghas Phul)' },
  SP: { default: 'Bicycle' },
  BSP: { default: 'Elephant' },
  DMK: { default: 'Rising Sun' },
  AIADMK: { default: 'Two Leaves' },
  JDU: { default: 'Arrow' },
  RJD: { default: 'Hurricane Lamp (Lantern)' },
  SHS: { default: 'Bow and Arrow' },
  SSUBT: { default: 'Flaming Torch (Mashaal)' },
  NCP: { default: 'Clock' },
  NCPSP: { default: 'Man Blowing Turha' },
  CPIM: { default: 'Hammer, Sickle and Star' },
  CPI: { default: 'Ears of Corn and Sickle' },
  TDP: { default: 'Bicycle' },
  YSRCP: { default: 'Ceiling Fan' },
  BJD: { default: 'Conch' },
  BRS: { default: 'Car' },
  SAD: { default: 'Scales' },
  JMM: { default: 'Bow and Arrow' },
  JDS: { default: 'Lady Farmer Carrying Paddy' },
  IUML: { default: 'Ladder' },
  OTH: { default: 'Various' },
};

// Party names that differ by scenario.
export const SCENARIO_NAMES: Record<string, Partial<Record<ScenarioId, { name: string; short: string }>>> = {
  BRS: { ls2014: { name: 'Telangana Rashtra Samithi', short: 'TRS' }, ls2019: { name: 'Telangana Rashtra Samithi', short: 'TRS' } },
};

export function symbolFor(party: string, scenario: string): string {
  const s = ELECTION_SYMBOLS[party];
  if (!s) return '';
  return s[scenario as ScenarioId] ?? s.default;
}

export interface LeaderDef {
  id: string;
  name: string;
  // party per scenario; a missing scenario means the person is not in that roster
  party: Partial<Record<ScenarioId, string>>;
  role: Partial<Record<ScenarioId, string>>;
  home: string; // state code
  reach: 'national' | 'regional';
  recognition: number; // 0..1 gameplay estimate
  homePop: number; // 0..1 pull in the home state, estimate
  awayPop: number; // 0..1 pull elsewhere, estimate
  effect: number; // 0..1 campaign effectiveness, estimate
  strong: Issue[]; // gameplay estimate of where their message is credible
  weak: Issue[]; // gameplay estimate of where it is less credible
  days: number; // campaign days per week the player can schedule
}

const L = (d: LeaderDef) => d;
const ALLY = (p: string): Partial<Record<ScenarioId, string>> => ({ ls2024: p, ls2029: p });

export const LEADERS: LeaderDef[] = [
  // BJP
  L({ id: 'modi', name: 'Narendra Modi', party: { ls2014: 'BJP', ls2019: 'BJP', ls2024: 'BJP', ls2029: 'BJP' }, role: { ls2014: 'BJP prime ministerial candidate; Chief Minister of Gujarat', ls2019: 'Prime Minister', ls2024: 'Prime Minister', ls2029: 'Prime Minister (as of 2024)' }, home: 'GJ', reach: 'national', recognition: 0.98, homePop: 0.85, awayPop: 0.68, effect: 0.9, strong: ['security', 'infrastructure', 'welfare'], weak: ['jobs', 'federalism'], days: 3 }),
  L({ id: 'shah', name: 'Amit Shah', party: { ls2019: 'BJP', ls2024: 'BJP', ls2029: 'BJP' }, role: { ls2019: 'BJP national president', ls2024: 'Union Home Minister', ls2029: 'Union Home Minister (as of 2024)' }, home: 'GJ', reach: 'national', recognition: 0.85, homePop: 0.7, awayPop: 0.5, effect: 0.85, strong: ['security', 'identity'], weak: ['federalism', 'inflation'], days: 2 }),
  L({ id: 'nadda', name: 'J. P. Nadda', party: { ls2024: 'BJP' }, role: { ls2024: 'BJP national president' }, home: 'HP', reach: 'national', recognition: 0.55, homePop: 0.55, awayPop: 0.35, effect: 0.6, strong: ['health_edu', 'infrastructure'], weak: ['jobs'], days: 2 }),
  L({ id: 'yogi', name: 'Yogi Adityanath', party: ALLY('BJP'), role: { ls2024: 'Chief Minister of Uttar Pradesh', ls2029: 'Chief Minister of Uttar Pradesh (as of 2024)' }, home: 'UP', reach: 'regional', recognition: 0.82, homePop: 0.66, awayPop: 0.45, effect: 0.75, strong: ['security', 'identity'], weak: ['jobs', 'health_edu'], days: 2 }),
  L({ id: 'himanta', name: 'Himanta Biswa Sarma', party: ALLY('BJP'), role: { ls2024: 'Chief Minister of Assam', ls2029: 'Chief Minister of Assam (as of 2024)' }, home: 'AS', reach: 'regional', recognition: 0.6, homePop: 0.65, awayPop: 0.3, effect: 0.75, strong: ['identity', 'infrastructure'], weak: ['federalism'], days: 1 }),
  L({ id: 'rajnath', name: 'Rajnath Singh', party: { ls2014: 'BJP' }, role: { ls2014: 'BJP national president' }, home: 'UP', reach: 'national', recognition: 0.65, homePop: 0.6, awayPop: 0.4, effect: 0.6, strong: ['security', 'agriculture'], weak: ['economy'], days: 2 }),
  // INC
  L({ id: 'rahul', name: 'Rahul Gandhi', party: { ls2014: 'INC', ls2019: 'INC', ls2024: 'INC', ls2029: 'INC' }, role: { ls2014: 'Congress vice-president', ls2019: 'Congress president', ls2024: 'Congress MP and senior leader', ls2029: 'Leader of the Opposition (as of 2024)' }, home: 'KL', reach: 'national', recognition: 0.92, homePop: 0.55, awayPop: 0.48, effect: 0.65, strong: ['jobs', 'welfare', 'inflation'], weak: ['security', 'economy'], days: 3 }),
  L({ id: 'kharge', name: 'Mallikarjun Kharge', party: ALLY('INC'), role: { ls2024: 'Congress president', ls2029: 'Congress president (as of 2024)' }, home: 'KA', reach: 'national', recognition: 0.55, homePop: 0.55, awayPop: 0.35, effect: 0.55, strong: ['welfare', 'identity'], weak: ['economy'], days: 2 }),
  L({ id: 'priyanka', name: 'Priyanka Gandhi Vadra', party: { ls2019: 'INC', ls2024: 'INC', ls2029: 'INC' }, role: { ls2019: 'Congress general secretary', ls2024: 'Congress general secretary', ls2029: 'Congress general secretary (as of 2024)' }, home: 'UP', reach: 'national', recognition: 0.8, homePop: 0.5, awayPop: 0.45, effect: 0.65, strong: ['inflation', 'health_edu'], weak: ['security'], days: 2 }),
  L({ id: 'sonia', name: 'Sonia Gandhi', party: { ls2014: 'INC' }, role: { ls2014: 'Congress president' }, home: 'UP', reach: 'national', recognition: 0.9, homePop: 0.5, awayPop: 0.42, effect: 0.5, strong: ['welfare'], weak: ['economy'], days: 2 }),
  L({ id: 'siddaramaiah', name: 'Siddaramaiah', party: ALLY('INC'), role: { ls2024: 'Chief Minister of Karnataka', ls2029: 'Chief Minister of Karnataka (as of 2024)' }, home: 'KA', reach: 'regional', recognition: 0.55, homePop: 0.62, awayPop: 0.2, effect: 0.7, strong: ['welfare', 'federalism'], weak: ['infrastructure'], days: 1 }),
  L({ id: 'revanth', name: 'A. Revanth Reddy', party: ALLY('INC'), role: { ls2024: 'Chief Minister of Telangana', ls2029: 'Chief Minister of Telangana (as of 2024)' }, home: 'TG', reach: 'regional', recognition: 0.5, homePop: 0.6, awayPop: 0.15, effect: 0.7, strong: ['welfare', 'jobs'], weak: ['economy'], days: 1 }),
  // AAP
  L({ id: 'kejriwal', name: 'Arvind Kejriwal', party: { ls2014: 'AAP', ls2019: 'AAP', ls2024: 'AAP', ls2029: 'AAP' }, role: { ls2014: 'AAP national convenor', ls2019: 'Chief Minister of Delhi', ls2024: 'AAP national convenor; Chief Minister of Delhi', ls2029: 'AAP national convenor (as of 2024)' }, home: 'DL', reach: 'national', recognition: 0.8, homePop: 0.6, awayPop: 0.35, effect: 0.7, strong: ['health_edu', 'corruption', 'welfare'], weak: ['security'], days: 2 }),
  L({ id: 'mann', name: 'Bhagwant Mann', party: ALLY('AAP'), role: { ls2024: 'Chief Minister of Punjab', ls2029: 'Chief Minister of Punjab (as of 2024)' }, home: 'PB', reach: 'regional', recognition: 0.55, homePop: 0.55, awayPop: 0.15, effect: 0.6, strong: ['welfare', 'agriculture'], weak: ['economy'], days: 1 }),
  // AITC
  L({ id: 'mamata', name: 'Mamata Banerjee', party: { ls2014: 'AITC', ls2019: 'AITC', ls2024: 'AITC', ls2029: 'AITC' }, role: { ls2014: 'Chief Minister of West Bengal', ls2019: 'Chief Minister of West Bengal', ls2024: 'Chief Minister of West Bengal', ls2029: 'Chief Minister of West Bengal (as of 2024)' }, home: 'WB', reach: 'regional', recognition: 0.85, homePop: 0.72, awayPop: 0.25, effect: 0.82, strong: ['welfare', 'federalism', 'identity'], weak: ['jobs'], days: 3 }),
  L({ id: 'abhishek', name: 'Abhishek Banerjee', party: ALLY('AITC'), role: { ls2024: 'AITC national general secretary', ls2029: 'AITC national general secretary (as of 2024)' }, home: 'WB', reach: 'regional', recognition: 0.5, homePop: 0.55, awayPop: 0.1, effect: 0.65, strong: ['federalism'], weak: ['economy'], days: 2 }),
  // SP
  L({ id: 'akhilesh', name: 'Akhilesh Yadav', party: { ls2014: 'SP', ls2019: 'SP', ls2024: 'SP', ls2029: 'SP' }, role: { ls2014: 'Chief Minister of Uttar Pradesh', ls2019: 'SP president', ls2024: 'SP president', ls2029: 'SP president (as of 2024)' }, home: 'UP', reach: 'regional', recognition: 0.78, homePop: 0.65, awayPop: 0.2, effect: 0.78, strong: ['jobs', 'infrastructure', 'identity'], weak: ['security'], days: 3 }),
  L({ id: 'mulayam', name: 'Mulayam Singh Yadav', party: { ls2014: 'SP', ls2019: 'SP' }, role: { ls2014: 'SP president', ls2019: 'SP patron' }, home: 'UP', reach: 'regional', recognition: 0.75, homePop: 0.6, awayPop: 0.2, effect: 0.6, strong: ['agriculture', 'identity'], weak: ['economy'], days: 1 }),
  // BSP
  L({ id: 'mayawati', name: 'Mayawati', party: { ls2014: 'BSP', ls2019: 'BSP', ls2024: 'BSP', ls2029: 'BSP' }, role: { ls2014: 'BSP president', ls2019: 'BSP president', ls2024: 'BSP president', ls2029: 'BSP president (as of 2024)' }, home: 'UP', reach: 'regional', recognition: 0.8, homePop: 0.55, awayPop: 0.2, effect: 0.55, strong: ['identity', 'security'], weak: ['jobs'], days: 2 }),
  // DMK
  L({ id: 'stalin', name: 'M. K. Stalin', party: { ls2019: 'DMK', ls2024: 'DMK', ls2029: 'DMK' }, role: { ls2019: 'DMK president', ls2024: 'Chief Minister of Tamil Nadu', ls2029: 'Chief Minister of Tamil Nadu (as of 2024)' }, home: 'TN', reach: 'regional', recognition: 0.75, homePop: 0.68, awayPop: 0.15, effect: 0.78, strong: ['federalism', 'welfare', 'health_edu'], weak: ['economy'], days: 3 }),
  L({ id: 'karunanidhi', name: 'M. Karunanidhi', party: { ls2014: 'DMK' }, role: { ls2014: 'DMK president' }, home: 'TN', reach: 'regional', recognition: 0.8, homePop: 0.6, awayPop: 0.1, effect: 0.6, strong: ['federalism', 'identity'], weak: ['economy'], days: 1 }),
  L({ id: 'udhayanidhi', name: 'Udhayanidhi Stalin', party: ALLY('DMK'), role: { ls2024: 'Tamil Nadu minister', ls2029: 'Deputy Chief Minister of Tamil Nadu (as of 2024)' }, home: 'TN', reach: 'regional', recognition: 0.5, homePop: 0.5, awayPop: 0.05, effect: 0.6, strong: ['jobs', 'identity'], weak: ['economy'], days: 2 }),
  // AIADMK
  L({ id: 'eps', name: 'Edappadi K. Palaniswami', party: { ls2024: 'AIADMK', ls2029: 'AIADMK' }, role: { ls2024: 'AIADMK general secretary', ls2029: 'AIADMK general secretary (as of 2024)' }, home: 'TN', reach: 'regional', recognition: 0.55, homePop: 0.5, awayPop: 0.05, effect: 0.6, strong: ['agriculture', 'welfare'], weak: ['jobs'], days: 2 }),
  L({ id: 'jayalalithaa', name: 'J. Jayalalithaa', party: { ls2014: 'AIADMK' }, role: { ls2014: 'Chief Minister of Tamil Nadu; AIADMK general secretary' }, home: 'TN', reach: 'regional', recognition: 0.88, homePop: 0.75, awayPop: 0.1, effect: 0.85, strong: ['welfare', 'federalism'], weak: ['economy'], days: 2 }),
  // Bihar
  L({ id: 'nitish', name: 'Nitish Kumar', party: { ls2014: 'JDU', ls2019: 'JDU', ls2024: 'JDU', ls2029: 'JDU' }, role: { ls2014: 'JD(U) leader', ls2019: 'Chief Minister of Bihar', ls2024: 'Chief Minister of Bihar', ls2029: 'Chief Minister of Bihar (as of 2024)' }, home: 'BR', reach: 'regional', recognition: 0.75, homePop: 0.55, awayPop: 0.15, effect: 0.65, strong: ['infrastructure', 'welfare'], weak: ['jobs'], days: 2 }),
  L({ id: 'tejashwi', name: 'Tejashwi Yadav', party: { ls2019: 'RJD', ls2024: 'RJD', ls2029: 'RJD' }, role: { ls2019: 'Leader of the Opposition in Bihar', ls2024: 'RJD leader; former Deputy CM of Bihar', ls2029: 'RJD leader (as of 2024)' }, home: 'BR', reach: 'regional', recognition: 0.6, homePop: 0.6, awayPop: 0.1, effect: 0.72, strong: ['jobs', 'identity'], weak: ['economy'], days: 3 }),
  L({ id: 'lalu', name: 'Lalu Prasad Yadav', party: { ls2014: 'RJD', ls2024: 'RJD' }, role: { ls2014: 'RJD president', ls2024: 'RJD president' }, home: 'BR', reach: 'regional', recognition: 0.8, homePop: 0.5, awayPop: 0.15, effect: 0.5, strong: ['identity'], weak: ['economy'], days: 1 }),
  // Maharashtra (faction identities differ by scenario)
  L({ id: 'uddhav', name: 'Uddhav Thackeray', party: { ls2014: 'SHS', ls2019: 'SHS', ls2024: 'SSUBT', ls2029: 'SSUBT' }, role: { ls2014: 'Shiv Sena president', ls2019: 'Shiv Sena president', ls2024: 'Shiv Sena (UBT) president', ls2029: 'Shiv Sena (UBT) president (as of 2024)' }, home: 'MH', reach: 'regional', recognition: 0.7, homePop: 0.58, awayPop: 0.05, effect: 0.65, strong: ['identity', 'federalism'], weak: ['economy'], days: 2 }),
  L({ id: 'aaditya', name: 'Aaditya Thackeray', party: ALLY('SSUBT'), role: { ls2024: 'Shiv Sena (UBT) leader', ls2029: 'Shiv Sena (UBT) leader (as of 2024)' }, home: 'MH', reach: 'regional', recognition: 0.45, homePop: 0.45, awayPop: 0.05, effect: 0.55, strong: ['environment', 'infrastructure'], weak: ['agriculture'], days: 2 }),
  L({ id: 'shinde', name: 'Eknath Shinde', party: ALLY('SHS'), role: { ls2024: 'Chief Minister of Maharashtra', ls2029: 'Shiv Sena leader (as of 2024)' }, home: 'MH', reach: 'regional', recognition: 0.6, homePop: 0.55, awayPop: 0.05, effect: 0.65, strong: ['infrastructure', 'welfare'], weak: ['economy'], days: 2 }),
  L({ id: 'sharad', name: 'Sharad Pawar', party: { ls2014: 'NCP', ls2019: 'NCP', ls2024: 'NCPSP', ls2029: 'NCPSP' }, role: { ls2014: 'NCP president', ls2019: 'NCP president', ls2024: 'NCP (Sharadchandra Pawar) president', ls2029: 'NCP (SP) president (as of 2024)' }, home: 'MH', reach: 'regional', recognition: 0.75, homePop: 0.6, awayPop: 0.1, effect: 0.7, strong: ['agriculture', 'economy'], weak: ['jobs'], days: 2 }),
  L({ id: 'ajit', name: 'Ajit Pawar', party: ALLY('NCP'), role: { ls2024: 'Deputy Chief Minister of Maharashtra', ls2029: 'Deputy Chief Minister of Maharashtra (as of 2024)' }, home: 'MH', reach: 'regional', recognition: 0.55, homePop: 0.48, awayPop: 0.05, effect: 0.6, strong: ['agriculture', 'infrastructure'], weak: ['economy'], days: 2 }),
  // Left
  L({ id: 'yechury', name: 'Sitaram Yechury', party: { ls2019: 'CPIM', ls2024: 'CPIM' }, role: { ls2019: 'CPI(M) general secretary', ls2024: 'CPI(M) general secretary' }, home: 'DL', reach: 'national', recognition: 0.45, homePop: 0.3, awayPop: 0.25, effect: 0.5, strong: ['jobs', 'welfare'], weak: ['economy'], days: 2 }),
  L({ id: 'karat', name: 'Prakash Karat', party: { ls2014: 'CPIM' }, role: { ls2014: 'CPI(M) general secretary' }, home: 'KL', reach: 'national', recognition: 0.4, homePop: 0.35, awayPop: 0.2, effect: 0.45, strong: ['jobs'], weak: ['economy'], days: 1 }),
  L({ id: 'baby', name: 'M. A. Baby', party: { ls2029: 'CPIM' }, role: { ls2029: 'CPI(M) general secretary (from 2025)' }, home: 'KL', reach: 'national', recognition: 0.35, homePop: 0.4, awayPop: 0.15, effect: 0.5, strong: ['health_edu', 'jobs'], weak: ['economy'], days: 2 }),
  L({ id: 'pinarayi', name: 'Pinarayi Vijayan', party: ALLY('CPIM'), role: { ls2024: 'Chief Minister of Kerala', ls2029: 'Chief Minister of Kerala (as of 2024)' }, home: 'KL', reach: 'regional', recognition: 0.6, homePop: 0.55, awayPop: 0.1, effect: 0.65, strong: ['health_edu', 'welfare'], weak: ['jobs'], days: 2 }),
  L({ id: 'raja', name: 'D. Raja', party: { ls2024: 'CPI', ls2029: 'CPI' }, role: { ls2024: 'CPI general secretary', ls2029: 'CPI general secretary (as of 2024)' }, home: 'TN', reach: 'national', recognition: 0.3, homePop: 0.3, awayPop: 0.15, effect: 0.45, strong: ['welfare', 'jobs'], weak: ['economy'], days: 1 }),
  // South and East regional parties
  L({ id: 'naidu', name: 'N. Chandrababu Naidu', party: { ls2014: 'TDP', ls2019: 'TDP', ls2024: 'TDP', ls2029: 'TDP' }, role: { ls2014: 'TDP president', ls2019: 'Chief Minister of Andhra Pradesh', ls2024: 'TDP president', ls2029: 'Chief Minister of Andhra Pradesh (as of 2024)' }, home: 'AP', reach: 'regional', recognition: 0.75, homePop: 0.62, awayPop: 0.1, effect: 0.75, strong: ['infrastructure', 'economy'], weak: ['welfare'], days: 3 }),
  L({ id: 'lokesh', name: 'Nara Lokesh', party: ALLY('TDP'), role: { ls2024: 'TDP general secretary', ls2029: 'Andhra Pradesh minister (as of 2024)' }, home: 'AP', reach: 'regional', recognition: 0.45, homePop: 0.45, awayPop: 0.05, effect: 0.6, strong: ['jobs', 'economy'], weak: ['agriculture'], days: 2 }),
  L({ id: 'jagan', name: 'Y. S. Jagan Mohan Reddy', party: { ls2014: 'YSRCP', ls2019: 'YSRCP', ls2024: 'YSRCP', ls2029: 'YSRCP' }, role: { ls2014: 'YSRCP president', ls2019: 'YSRCP president', ls2024: 'Chief Minister of Andhra Pradesh', ls2029: 'YSRCP president (as of 2024)' }, home: 'AP', reach: 'regional', recognition: 0.72, homePop: 0.6, awayPop: 0.05, effect: 0.72, strong: ['welfare', 'agriculture'], weak: ['infrastructure', 'jobs'], days: 3 }),
  L({ id: 'naveen', name: 'Naveen Patnaik', party: { ls2014: 'BJD', ls2019: 'BJD', ls2024: 'BJD', ls2029: 'BJD' }, role: { ls2014: 'Chief Minister of Odisha', ls2019: 'Chief Minister of Odisha', ls2024: 'Chief Minister of Odisha', ls2029: 'BJD president (as of 2024)' }, home: 'OD', reach: 'regional', recognition: 0.75, homePop: 0.66, awayPop: 0.05, effect: 0.65, strong: ['welfare', 'health_edu'], weak: ['jobs'], days: 2 }),
  L({ id: 'kcr', name: 'K. Chandrashekar Rao', party: { ls2014: 'BRS', ls2019: 'BRS', ls2024: 'BRS', ls2029: 'BRS' }, role: { ls2014: 'TRS president', ls2019: 'Chief Minister of Telangana', ls2024: 'BRS president', ls2029: 'BRS president (as of 2024)' }, home: 'TG', reach: 'regional', recognition: 0.7, homePop: 0.55, awayPop: 0.05, effect: 0.7, strong: ['federalism', 'agriculture'], weak: ['jobs'], days: 2 }),
  L({ id: 'ktr', name: 'K. T. Rama Rao', party: ALLY('BRS'), role: { ls2024: 'BRS working president', ls2029: 'BRS working president (as of 2024)' }, home: 'TG', reach: 'regional', recognition: 0.5, homePop: 0.48, awayPop: 0.05, effect: 0.62, strong: ['economy', 'infrastructure'], weak: ['agriculture'], days: 2 }),
  L({ id: 'sukhbir', name: 'Sukhbir Singh Badal', party: { ls2014: 'SAD', ls2019: 'SAD', ls2024: 'SAD', ls2029: 'SAD' }, role: { ls2014: 'SAD president; Deputy CM of Punjab', ls2019: 'SAD president', ls2024: 'SAD president', ls2029: 'SAD leader (as of 2024)' }, home: 'PB', reach: 'regional', recognition: 0.55, homePop: 0.4, awayPop: 0.05, effect: 0.5, strong: ['agriculture', 'federalism'], weak: ['economy'], days: 2 }),
  L({ id: 'hemant', name: 'Hemant Soren', party: { ls2014: 'JMM', ls2019: 'JMM', ls2024: 'JMM', ls2029: 'JMM' }, role: { ls2014: 'Chief Minister of Jharkhand', ls2019: 'JMM working president', ls2024: 'JMM working president', ls2029: 'Chief Minister of Jharkhand (as of 2024)' }, home: 'JH', reach: 'regional', recognition: 0.55, homePop: 0.55, awayPop: 0.05, effect: 0.62, strong: ['identity', 'federalism'], weak: ['jobs'], days: 2 }),
  L({ id: 'kalpana', name: 'Kalpana Soren', party: ALLY('JMM'), role: { ls2024: 'JMM leader', ls2029: 'JMM leader (as of 2024)' }, home: 'JH', reach: 'regional', recognition: 0.35, homePop: 0.45, awayPop: 0.05, effect: 0.6, strong: ['welfare', 'identity'], weak: ['economy'], days: 2 }),
  L({ id: 'devegowda', name: 'H. D. Deve Gowda', party: { ls2014: 'JDS', ls2019: 'JDS', ls2024: 'JDS', ls2029: 'JDS' }, role: { ls2014: 'JD(S) president', ls2019: 'JD(S) president', ls2024: 'JD(S) president', ls2029: 'JD(S) president (as of 2024)' }, home: 'KA', reach: 'regional', recognition: 0.65, homePop: 0.45, awayPop: 0.05, effect: 0.5, strong: ['agriculture'], weak: ['jobs'], days: 1 }),
  L({ id: 'hdk', name: 'H. D. Kumaraswamy', party: ALLY('JDS'), role: { ls2024: 'JD(S) leader', ls2029: 'Union Minister (as of 2024)' }, home: 'KA', reach: 'regional', recognition: 0.55, homePop: 0.45, awayPop: 0.05, effect: 0.58, strong: ['agriculture', 'welfare'], weak: ['economy'], days: 2 }),
  L({ id: 'thangal', name: 'Sayyid Sadiq Ali Shihab Thangal', party: ALLY('IUML'), role: { ls2024: 'IUML Kerala state president', ls2029: 'IUML Kerala state president (as of 2024)' }, home: 'KL', reach: 'regional', recognition: 0.35, homePop: 0.45, awayPop: 0.02, effect: 0.5, strong: ['health_edu', 'identity'], weak: ['economy'], days: 1 }),
  L({ id: 'kunhalikutty', name: 'P. K. Kunhalikutty', party: { ls2019: 'IUML', ls2024: 'IUML', ls2029: 'IUML' }, role: { ls2019: 'IUML national general secretary', ls2024: 'IUML national general secretary', ls2029: 'IUML leader (as of 2024)' }, home: 'KL', reach: 'regional', recognition: 0.4, homePop: 0.45, awayPop: 0.02, effect: 0.55, strong: ['health_edu', 'economy'], weak: ['economy'], days: 1 }),
];

// Constituency candidacies. Each line is a contest the person is on record as having fought
// in that election, for that party. The game does not use the recorded result.
export interface CandidacyDef { leader?: string; id: string; name: string; scenario: ScenarioId; party: string; state: string; seat: string; recognition: number }

const C = (scenario: ScenarioId, party: string, state: string, seat: string, id: string, name: string, recognition = 0.6): CandidacyDef => ({ id, name, scenario, party, state, seat, recognition });

export const CANDIDACIES: CandidacyDef[] = [
  // 2024
  C('ls2024', 'BJP', 'UP', 'Varanasi', 'modi', 'Narendra Modi', 0.98),
  C('ls2024', 'INC', 'UP', 'Rae Bareli', 'rahul', 'Rahul Gandhi', 0.92),
  C('ls2024', 'INC', 'KL', 'Wayanad', 'rahul', 'Rahul Gandhi', 0.92),
  C('ls2024', 'BJP', 'GJ', 'Gandhinagar', 'shah', 'Amit Shah', 0.85),
  C('ls2024', 'BJP', 'UP', 'Lucknow', 'rajnath', 'Rajnath Singh', 0.75),
  C('ls2024', 'SP', 'UP', 'Kannauj', 'akhilesh', 'Akhilesh Yadav', 0.78),
  C('ls2024', 'SP', 'UP', 'Mainpuri', 'dimple', 'Dimple Yadav', 0.55),
  C('ls2024', 'BJP', 'UP', 'Amethi', 'smriti', 'Smriti Irani', 0.7),
  C('ls2024', 'INC', 'UP', 'Amethi', 'klsharma', 'Kishori Lal Sharma', 0.3),
  C('ls2024', 'INC', 'KL', 'Thiruvananthapuram', 'tharoor', 'Shashi Tharoor', 0.75),
  C('ls2024', 'BJP', 'KL', 'Thiruvananthapuram', 'rajeevc', 'Rajeev Chandrasekhar', 0.5),
  C('ls2024', 'AITC', 'WB', 'Krishnanagar', 'mahua', 'Mahua Moitra', 0.55),
  C('ls2024', 'AITC', 'WB', 'Diamond Harbour', 'abhishek', 'Abhishek Banerjee', 0.5),
  C('ls2024', 'NCPSP', 'MH', 'Baramati', 'supriya', 'Supriya Sule', 0.55),
  C('ls2024', 'NCP', 'MH', 'Baramati', 'sunetra', 'Sunetra Pawar', 0.35),
  C('ls2024', 'BJP', 'MH', 'Nagpur', 'gadkari', 'Nitin Gadkari', 0.75),
  C('ls2024', 'BJP', 'MH', 'Mumbai North', 'goyal', 'Piyush Goyal', 0.55),
  C('ls2024', 'BJP', 'MP', 'Vidisha', 'shivraj', 'Shivraj Singh Chouhan', 0.75),
  C('ls2024', 'BJP', 'MP', 'Guna', 'scindia', 'Jyotiraditya Scindia', 0.65),
  C('ls2024', 'BJP', 'HP', 'Mandi', 'kangana', 'Kangana Ranaut', 0.8),
  C('ls2024', 'BJP', 'RJ', 'Kota', 'birla', 'Om Birla', 0.55),
  C('ls2024', 'BJP', 'UP', 'Mathura', 'hema', 'Hema Malini', 0.8),
  C('ls2024', 'BJP', 'HP', 'Hamirpur', 'anurag', 'Anurag Thakur', 0.6),
  C('ls2024', 'BJP', 'OD', 'Sambalpur', 'pradhan', 'Dharmendra Pradhan', 0.6),
  C('ls2024', 'DMK', 'TN', 'Thoothukudi', 'kanimozhi', 'Kanimozhi Karunanidhi', 0.6),
  C('ls2024', 'INC', 'KL', 'Alappuzha', 'venugopal', 'K. C. Venugopal', 0.45),
  C('ls2024', 'INC', 'AS', 'Jorhat', 'gogoi', 'Gaurav Gogoi', 0.45),
  C('ls2024', 'BJP', 'DL', 'New Delhi', 'bansuri', 'Bansuri Swaraj', 0.4),
  C('ls2024', 'BJP', 'DL', 'North East Delhi', 'tiwari', 'Manoj Tiwari', 0.6),
  C('ls2024', 'INC', 'DL', 'North East Delhi', 'kanhaiya', 'Kanhaiya Kumar', 0.55),
  C('ls2024', 'BJP', 'TN', 'Coimbatore', 'annamalai', 'K. Annamalai', 0.6),
  C('ls2024', 'BJP', 'KA', 'Dharwad', 'joshi', 'Pralhad Joshi', 0.5),
  C('ls2024', 'BJP', 'KA', 'Bangalore South', 'surya', 'Tejasvi Surya', 0.55),
  C('ls2024', 'JDS', 'KA', 'Mandya', 'hdk', 'H. D. Kumaraswamy', 0.55),
  C('ls2024', 'SAD', 'PB', 'Bathinda', 'harsimrat', 'Harsimrat Kaur Badal', 0.5),
  C('ls2024', 'AITC', 'WB', 'Baharampur', 'pathan', 'Yusuf Pathan', 0.7),
  C('ls2024', 'INC', 'WB', 'Baharampur', 'adhir', 'Adhir Ranjan Chowdhury', 0.55),
  C('ls2024', 'AITC', 'WB', 'Asansol', 'shatrughan', 'Shatrughan Sinha', 0.75),
  C('ls2024', 'RJD', 'BR', 'Pataliputra', 'misa', 'Misa Bharti', 0.45),
  C('ls2024', 'BJP', 'BR', 'Patna Sahib', 'rsprasad', 'Ravi Shankar Prasad', 0.55),
  C('ls2024', 'BJP', 'BR', 'Begusarai', 'giriraj', 'Giriraj Singh', 0.5),
  C('ls2024', 'BJP', 'UP', 'Meerut', 'govil', 'Arun Govil', 0.65),
  C('ls2024', 'BJP', 'UP', 'Gorakhpur', 'ravikishan', 'Ravi Kishan', 0.6),
  C('ls2024', 'BJP', 'UP', 'Gautam Buddha Nagar', 'msharma', 'Mahesh Sharma', 0.4),
  // 2019
  C('ls2019', 'BJP', 'UP', 'Varanasi', 'modi', 'Narendra Modi', 0.98),
  C('ls2019', 'INC', 'UP', 'Amethi', 'rahul', 'Rahul Gandhi', 0.9),
  C('ls2019', 'INC', 'KL', 'Wayanad', 'rahul', 'Rahul Gandhi', 0.9),
  C('ls2019', 'BJP', 'UP', 'Amethi', 'smriti', 'Smriti Irani', 0.7),
  C('ls2019', 'INC', 'UP', 'Rae Bareli', 'sonia', 'Sonia Gandhi', 0.88),
  C('ls2019', 'BJP', 'GJ', 'Gandhinagar', 'shah', 'Amit Shah', 0.85),
  C('ls2019', 'BJP', 'UP', 'Lucknow', 'rajnath', 'Rajnath Singh', 0.75),
  C('ls2019', 'SP', 'UP', 'Azamgarh', 'akhilesh', 'Akhilesh Yadav', 0.78),
  C('ls2019', 'SP', 'UP', 'Mainpuri', 'mulayam', 'Mulayam Singh Yadav', 0.75),
  C('ls2019', 'SP', 'UP', 'Kannauj', 'dimple', 'Dimple Yadav', 0.5),
  C('ls2019', 'INC', 'KL', 'Thiruvananthapuram', 'tharoor', 'Shashi Tharoor', 0.72),
  C('ls2019', 'AITC', 'WB', 'Krishnanagar', 'mahua', 'Mahua Moitra', 0.4),
  C('ls2019', 'AITC', 'WB', 'Diamond Harbour', 'abhishek', 'Abhishek Banerjee', 0.45),
  C('ls2019', 'NCP', 'MH', 'Baramati', 'supriya', 'Supriya Sule', 0.55),
  C('ls2019', 'BJP', 'MH', 'Nagpur', 'gadkari', 'Nitin Gadkari', 0.72),
  C('ls2019', 'INC', 'MP', 'Guna', 'scindia', 'Jyotiraditya Scindia', 0.65),
  C('ls2019', 'BJP', 'RJ', 'Kota', 'birla', 'Om Birla', 0.4),
  C('ls2019', 'BJP', 'UP', 'Mathura', 'hema', 'Hema Malini', 0.8),
  C('ls2019', 'BJP', 'HP', 'Hamirpur', 'anurag', 'Anurag Thakur', 0.5),
  C('ls2019', 'DMK', 'TN', 'Thoothukudi', 'kanimozhi', 'Kanimozhi Karunanidhi', 0.55),
  C('ls2019', 'BJP', 'DL', 'North East Delhi', 'tiwari', 'Manoj Tiwari', 0.6),
  C('ls2019', 'BJP', 'KA', 'Dharwad', 'joshi', 'Pralhad Joshi', 0.45),
  C('ls2019', 'BJP', 'KA', 'Bangalore South', 'surya', 'Tejasvi Surya', 0.35),
  C('ls2019', 'INC', 'KA', 'Gulbarga', 'kharge', 'Mallikarjun Kharge', 0.55),
  C('ls2019', 'SAD', 'PB', 'Bathinda', 'harsimrat', 'Harsimrat Kaur Badal', 0.5),
  C('ls2019', 'INC', 'WB', 'Baharampur', 'adhir', 'Adhir Ranjan Chowdhury', 0.5),
  C('ls2019', 'RJD', 'BR', 'Pataliputra', 'misa', 'Misa Bharti', 0.45),
  C('ls2019', 'BJP', 'BR', 'Patna Sahib', 'rsprasad', 'Ravi Shankar Prasad', 0.55),
  C('ls2019', 'INC', 'BR', 'Patna Sahib', 'shatrughan', 'Shatrughan Sinha', 0.75),
  C('ls2019', 'BJP', 'BR', 'Begusarai', 'giriraj', 'Giriraj Singh', 0.5),
  C('ls2019', 'CPI', 'BR', 'Begusarai', 'kanhaiya', 'Kanhaiya Kumar', 0.55),
  C('ls2019', 'BJP', 'UP', 'Gorakhpur', 'ravikishan', 'Ravi Kishan', 0.6),
  C('ls2019', 'AAP', 'PB', 'Sangrur', 'mann', 'Bhagwant Mann', 0.5),
  // 2014
  C('ls2014', 'BJP', 'UP', 'Varanasi', 'modi', 'Narendra Modi', 0.92),
  C('ls2014', 'BJP', 'GJ', 'Vadodara', 'modi', 'Narendra Modi', 0.92),
  C('ls2014', 'AAP', 'UP', 'Varanasi', 'kejriwal', 'Arvind Kejriwal', 0.75),
  C('ls2014', 'INC', 'UP', 'Amethi', 'rahul', 'Rahul Gandhi', 0.88),
  C('ls2014', 'BJP', 'UP', 'Amethi', 'smriti', 'Smriti Irani', 0.55),
  C('ls2014', 'INC', 'UP', 'Rae Bareli', 'sonia', 'Sonia Gandhi', 0.9),
  C('ls2014', 'BJP', 'GJ', 'Gandhinagar', 'advani', 'L. K. Advani', 0.8),
  C('ls2014', 'BJP', 'UP', 'Lucknow', 'rajnath', 'Rajnath Singh', 0.7),
  C('ls2014', 'SP', 'UP', 'Azamgarh', 'mulayam', 'Mulayam Singh Yadav', 0.78),
  C('ls2014', 'SP', 'UP', 'Mainpuri', 'mulayam', 'Mulayam Singh Yadav', 0.78),
  C('ls2014', 'SP', 'UP', 'Kannauj', 'dimple', 'Dimple Yadav', 0.5),
  C('ls2014', 'INC', 'KL', 'Thiruvananthapuram', 'tharoor', 'Shashi Tharoor', 0.7),
  C('ls2014', 'AITC', 'WB', 'Diamond Harbour', 'abhishek', 'Abhishek Banerjee', 0.3),
  C('ls2014', 'NCP', 'MH', 'Baramati', 'supriya', 'Supriya Sule', 0.5),
  C('ls2014', 'BJP', 'MH', 'Nagpur', 'gadkari', 'Nitin Gadkari', 0.65),
  C('ls2014', 'INC', 'MP', 'Guna', 'scindia', 'Jyotiraditya Scindia', 0.65),
  C('ls2014', 'INC', 'MP', 'Chhindwara', 'kamalnath', 'Kamal Nath', 0.6),
  C('ls2014', 'BJP', 'RJ', 'Kota', 'birla', 'Om Birla', 0.35),
  C('ls2014', 'BJP', 'UP', 'Mathura', 'hema', 'Hema Malini', 0.85),
  C('ls2014', 'BJP', 'HP', 'Hamirpur', 'anurag', 'Anurag Thakur', 0.45),
  C('ls2014', 'BJP', 'DL', 'North East Delhi', 'tiwari', 'Manoj Tiwari', 0.6),
  C('ls2014', 'BJP', 'KA', 'Dharwad', 'joshi', 'Pralhad Joshi', 0.45),
  C('ls2014', 'INC', 'KA', 'Gulbarga', 'kharge', 'Mallikarjun Kharge', 0.55),
  C('ls2014', 'SAD', 'PB', 'Bathinda', 'harsimrat', 'Harsimrat Kaur Badal', 0.5),
  C('ls2014', 'INC', 'WB', 'Baharampur', 'adhir', 'Adhir Ranjan Chowdhury', 0.5),
  C('ls2014', 'RJD', 'BR', 'Pataliputra', 'misa', 'Misa Bharti', 0.45),
  C('ls2014', 'BJP', 'BR', 'Patna Sahib', 'shatrughan', 'Shatrughan Sinha', 0.75),
  C('ls2014', 'AAP', 'PB', 'Sangrur', 'mann', 'Bhagwant Mann', 0.45),
  C('ls2014', 'BJP', 'UP', 'Gautam Buddha Nagar', 'msharma', 'Mahesh Sharma', 0.3),
];

export function leadersFor(scenario: string, party: string): LeaderDef[] {
  return LEADERS.filter((l) => l.party[scenario as ScenarioId] === party);
}
export const LEADER_BY_ID = Object.fromEntries(LEADERS.map((l) => [l.id, l]));
