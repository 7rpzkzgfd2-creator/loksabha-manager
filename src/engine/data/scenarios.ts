// Scenarios. State-level vote shares are rounded approximations of the general shape of
// past Lok Sabha contests, entered by hand as starting conditions for the game. They are
// labelled 'estimate' everywhere in the UI and are not ECI figures. "Recorded" national
// seat totals are listed only for the largest parties and only for comparison after a
// game ends; the simulation never steers towards them.
//
// Known simplifications:
// - All scenarios use the 2008 delimitation map (2014 is played on post-bifurcation
//   Andhra Pradesh and Telangana boundaries; Assam uses pre-2023 names).
// - Small parties not in the database are folded into OTH.

import type { Issue } from '../types.ts';

type ShareTable = Record<string, Record<string, number>>;

const BASE_2024: ShareTable = {
  AP: { TDP: 0.37, YSRCP: 0.4, BJP: 0.11, INC: 0.03 },
  AR: { BJP: 0.55, INC: 0.25 },
  AS: { BJP: 0.37, INC: 0.37 },
  BR: { BJP: 0.21, JDU: 0.19, RJD: 0.22, INC: 0.09 },
  CG: { BJP: 0.52, INC: 0.41 },
  GA: { BJP: 0.51, INC: 0.43 },
  GJ: { BJP: 0.61, INC: 0.32, AAP: 0.03 },
  HR: { BJP: 0.46, INC: 0.44, AAP: 0.04 },
  HP: { BJP: 0.56, INC: 0.42 },
  JH: { BJP: 0.44, INC: 0.19, JMM: 0.15 },
  KA: { BJP: 0.46, INC: 0.45, JDS: 0.06 },
  KL: { INC: 0.35, CPIM: 0.26, BJP: 0.17, IUML: 0.06, CPI: 0.06 },
  MP: { BJP: 0.59, INC: 0.32 },
  MH: { BJP: 0.26, INC: 0.17, SHS: 0.13, SSUBT: 0.17, NCP: 0.04, NCPSP: 0.1 },
  MN: { INC: 0.48, BJP: 0.16 },
  ML: { INC: 0.3, BJP: 0.1 },
  MZ: { INC: 0.2, BJP: 0.05 },
  NL: { INC: 0.48, BJP: 0.1 },
  OD: { BJP: 0.45, BJD: 0.37, INC: 0.13 },
  PB: { INC: 0.26, AAP: 0.26, SAD: 0.13, BJP: 0.18 },
  RJ: { BJP: 0.49, INC: 0.38 },
  SK: { BJP: 0.05, INC: 0.02 },
  TN: { DMK: 0.27, AIADMK: 0.21, BJP: 0.11, INC: 0.11, CPI: 0.02, CPIM: 0.02 },
  TG: { INC: 0.4, BJP: 0.35, BRS: 0.17 },
  TR: { BJP: 0.7, INC: 0.13, CPIM: 0.11 },
  UP: { BJP: 0.41, SP: 0.34, BSP: 0.09, INC: 0.09 },
  UK: { BJP: 0.56, INC: 0.33 },
  WB: { AITC: 0.46, BJP: 0.39, CPIM: 0.06, INC: 0.05 },
  AN: { BJP: 0.45, INC: 0.44 },
  CH: { INC: 0.48, BJP: 0.48 },
  DN: { BJP: 0.45, INC: 0.2 },
  DD: { BJP: 0.4, INC: 0.35 },
  JK: { BJP: 0.24, INC: 0.19 },
  LA: { INC: 0.2, BJP: 0.3 },
  LD: { INC: 0.5 },
  DL: { BJP: 0.54, INC: 0.19, AAP: 0.24 },
  PY: { INC: 0.53, BJP: 0.37 },
};

const OVERRIDES_2019: ShareTable = {
  AP: { YSRCP: 0.5, TDP: 0.4, INC: 0.01, BJP: 0.01 },
  TG: { BRS: 0.41, BJP: 0.2, INC: 0.29 },
  OD: { BJD: 0.43, BJP: 0.38, INC: 0.14 },
  UP: { BJP: 0.5, SP: 0.18, BSP: 0.19, INC: 0.06 },
  MH: { BJP: 0.28, SHS: 0.23, INC: 0.16, NCP: 0.16 },
  WB: { AITC: 0.43, BJP: 0.4, CPIM: 0.06, INC: 0.06 },
  KA: { BJP: 0.51, INC: 0.32, JDS: 0.1 },
  RJ: { BJP: 0.59, INC: 0.34 },
  MP: { BJP: 0.58, INC: 0.35 },
  GJ: { BJP: 0.62, INC: 0.32 },
  BR: { BJP: 0.24, JDU: 0.22, RJD: 0.15, INC: 0.08 },
  TN: { DMK: 0.33, AIADMK: 0.19, INC: 0.12, BJP: 0.04 },
  KL: { INC: 0.37, CPIM: 0.26, BJP: 0.13, IUML: 0.05, CPI: 0.06 },
  DL: { BJP: 0.56, INC: 0.22, AAP: 0.18 },
  PB: { INC: 0.4, SAD: 0.27, AAP: 0.07, BJP: 0.1 },
  HR: { BJP: 0.58, INC: 0.28 },
  JH: { BJP: 0.51, INC: 0.15, JMM: 0.11 },
  CG: { BJP: 0.5, INC: 0.4 },
  AS: { BJP: 0.36, INC: 0.35 },
};

const OVERRIDES_2014: ShareTable = {
  AP: { TDP: 0.4, YSRCP: 0.45, BJP: 0.07, INC: 0.03 },
  TG: { BRS: 0.34, INC: 0.25, BJP: 0.1 },
  OD: { BJD: 0.44, BJP: 0.21, INC: 0.26 },
  UP: { BJP: 0.42, SP: 0.22, BSP: 0.2, INC: 0.07 },
  MH: { BJP: 0.27, SHS: 0.21, INC: 0.18, NCP: 0.16 },
  WB: { AITC: 0.4, CPIM: 0.23, BJP: 0.17, INC: 0.1 },
  KA: { BJP: 0.43, INC: 0.41, JDS: 0.11 },
  RJ: { BJP: 0.55, INC: 0.3 },
  MP: { BJP: 0.54, INC: 0.35 },
  GJ: { BJP: 0.59, INC: 0.33 },
  BR: { BJP: 0.29, JDU: 0.16, RJD: 0.2, INC: 0.08 },
  TN: { AIADMK: 0.44, DMK: 0.24, BJP: 0.05, INC: 0.04 },
  KL: { INC: 0.32, CPIM: 0.21, BJP: 0.1, IUML: 0.05, CPI: 0.06 },
  DL: { BJP: 0.46, AAP: 0.33, INC: 0.15 },
  PB: { SAD: 0.26, INC: 0.33, AAP: 0.24, BJP: 0.09 },
  HR: { BJP: 0.35, INC: 0.23 },
  JH: { BJP: 0.4, INC: 0.13, JMM: 0.09 },
  CG: { BJP: 0.49, INC: 0.39 },
  AS: { BJP: 0.37, INC: 0.3 },
};

export interface AlliancePreset {
  id: string;
  name: string;
  leader: string;
  members: string[];
  friendlyFights: string[];
}

export interface Scenario {
  id: string;
  title: string;
  year: number;
  kind: 'hypothetical' | 'historical';
  blurb: string;
  incumbentGov: string; // party leading the outgoing government
  parties: string[];
  shares: ShareTable;
  alliances: AlliancePreset[];
  economy: number;
  salience: Partial<Record<Issue, number>>;
  recorded?: { source: string; seats: Record<string, number> };
  notes: string[];
}

const ALL_2024 = ['BJP', 'INC', 'AAP', 'AITC', 'SP', 'BSP', 'DMK', 'AIADMK', 'JDU', 'RJD', 'SHS', 'SSUBT', 'NCP', 'NCPSP', 'CPIM', 'CPI', 'TDP', 'YSRCP', 'BJD', 'BRS', 'SAD', 'JMM', 'JDS', 'IUML', 'OTH'];
const PRE_SPLIT = ALL_2024.filter((p) => p !== 'SSUBT' && p !== 'NCPSP');

function merge(base: ShareTable, over: ShareTable, drop: string[] = []): ShareTable {
  const out: ShareTable = {};
  for (const st of Object.keys(base)) {
    const row = { ...(over[st] ?? base[st]) };
    for (const d of drop) delete row[d];
    out[st] = row;
  }
  return out;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'ls2029', title: '2029: The Next Mandate', year: 2029, kind: 'hypothetical',
    blurb: 'A hypothetical next general election starting from rough 2024-style conditions. The NDA governs with allies it needs; the INDIA bloc is loose and quarrelsome.',
    incumbentGov: 'BJP', parties: ALL_2024, shares: BASE_2024,
    alliances: [
      { id: 'NDA', name: 'National Democratic Alliance', leader: 'BJP', members: ['BJP', 'TDP', 'JDU', 'SHS', 'NCP', 'JDS'], friendlyFights: [] },
      { id: 'INDIA', name: 'INDIA bloc', leader: 'INC', members: ['INC', 'SP', 'DMK', 'RJD', 'SSUBT', 'NCPSP', 'CPIM', 'CPI', 'JMM', 'IUML', 'AAP'], friendlyFights: ['KL', 'PB', 'DL'] },
    ],
    economy: 0.05, salience: { jobs: 0.75, inflation: 0.65 },
    notes: ['Fully simulated future scenario. Starting shares are estimates shaped like 2024, not a forecast.'],
  },
  {
    id: 'ls2024', title: '2024: Abki Baar?', year: 2024, kind: 'historical',
    blurb: 'Replay 2024 from approximate pre-campaign conditions. The ruling party is aiming high; the opposition has formed a broad bloc.',
    incumbentGov: 'BJP', parties: ALL_2024, shares: BASE_2024,
    alliances: [
      { id: 'NDA', name: 'National Democratic Alliance', leader: 'BJP', members: ['BJP', 'TDP', 'JDU', 'SHS', 'NCP', 'JDS'], friendlyFights: [] },
      { id: 'INDIA', name: 'INDIA bloc', leader: 'INC', members: ['INC', 'SP', 'DMK', 'RJD', 'SSUBT', 'NCPSP', 'CPIM', 'CPI', 'JMM', 'IUML', 'AAP'], friendlyFights: ['KL', 'PB', 'WB'] },
    ],
    economy: 0.1, salience: { jobs: 0.7, inflation: 0.6, identity: 0.6 },
    recorded: { source: 'Election Commission of India, 2024 results (largest parties only)', seats: { BJP: 240, INC: 99, SP: 37, AITC: 29, DMK: 22, TDP: 16, JDU: 12, SSUBT: 9, NCPSP: 8, SHS: 7 } },
    notes: ['Starting shares are approximate and resemble the eventual result, so the replay starts from the end-state mood rather than true pre-campaign polling, which is not reproduced here.'],
  },
  {
    id: 'ls2019', title: '2019: The Second Wave', year: 2019, kind: 'historical',
    blurb: 'An incumbent seeking re-election against a fragmented opposition. The big UP alliance is SP with BSP.',
    incumbentGov: 'BJP', parties: PRE_SPLIT, shares: merge(BASE_2024, OVERRIDES_2019, ['SSUBT', 'NCPSP']),
    alliances: [
      { id: 'NDA', name: 'National Democratic Alliance', leader: 'BJP', members: ['BJP', 'SHS', 'JDU', 'SAD', 'AIADMK'], friendlyFights: [] },
      { id: 'UPA', name: 'United Progressive Alliance', leader: 'INC', members: ['INC', 'DMK', 'RJD', 'NCP', 'JMM', 'IUML', 'JDS'], friendlyFights: ['KL'] },
      { id: 'MGB', name: 'UP Mahagathbandhan', leader: 'SP', members: ['SP', 'BSP'], friendlyFights: [] },
    ],
    economy: 0.0, salience: { security: 0.8, jobs: 0.6 },
    recorded: { source: 'Election Commission of India, 2019 results (largest parties only)', seats: { BJP: 303, INC: 52, DMK: 23, AITC: 22, YSRCP: 22, SHS: 18, JDU: 16, BJD: 12, BSP: 10, BRS: 9 } },
    notes: ['TRS is shown under its later name BRS.', 'Shares are approximate estimates.'],
  },
  {
    id: 'ls2014', title: '2014: Wave Election', year: 2014, kind: 'historical',
    blurb: 'A tired ten-year incumbent, a charged challenger, and anger about corruption and prices.',
    incumbentGov: 'INC', parties: PRE_SPLIT, shares: merge(BASE_2024, OVERRIDES_2014, ['SSUBT', 'NCPSP']),
    alliances: [
      { id: 'NDA', name: 'National Democratic Alliance', leader: 'BJP', members: ['BJP', 'SHS', 'TDP', 'SAD'], friendlyFights: [] },
      { id: 'UPA', name: 'United Progressive Alliance', leader: 'INC', members: ['INC', 'NCP', 'RJD', 'JMM', 'IUML'], friendlyFights: [] },
    ],
    economy: -0.3, salience: { corruption: 0.85, inflation: 0.8, economy: 0.7 },
    recorded: { source: 'Election Commission of India, 2014 results (largest parties only)', seats: { BJP: 282, INC: 44, AIADMK: 37, AITC: 34, BJD: 20, SHS: 18, TDP: 16, BRS: 11 } },
    notes: ['Played on post-2014 Andhra Pradesh/Telangana boundaries.', 'Shares are approximate estimates.'],
  },
];

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
