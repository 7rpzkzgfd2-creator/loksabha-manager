// Voter segments, policies, media outlets and name pools.
// Segments are broad economic/life-stage groups used as an aggregate lens. They overlap
// with each other in reality; here they are slices of the electorate so the arithmetic
// stays valid. Social identity (caste, religion, language) is NOT modelled as a voting
// bloc: it enters only through each constituency's historical baseline and calibrated
// offsets, so no identity mechanically determines anyone's vote.

import type { Issue, SegmentId, StaffRole } from '../types.ts';

export interface SegmentDef {
  id: SegmentId;
  name: string;
  salience: Partial<Record<Issue, number>>;
  econPref: number; // preferred econ position
  welfarePref: number;
  turnout: number;
  leaderSens: number; // how much national leadership moves them
  digital: number; // reachable by digital campaigns
  ground: number; // reachable by ground campaigns
}

export const SEGMENTS: SegmentDef[] = [
  { id: 'farmers', name: 'Farmers', salience: { agriculture: 1, inflation: 0.5, welfare: 0.4, infrastructure: 0.3 }, econPref: -0.2, welfarePref: 0.7, turnout: 0.68, leaderSens: 0.8, digital: 0.3, ground: 1 },
  { id: 'agri_labour', name: 'Rural workers', salience: { welfare: 1, jobs: 0.7, inflation: 0.7, identity: 0.3 }, econPref: -0.5, welfarePref: 0.9, turnout: 0.64, leaderSens: 0.9, digital: 0.25, ground: 1 },
  { id: 'urban_middle', name: 'Urban middle class', salience: { economy: 0.9, corruption: 0.6, infrastructure: 0.6, security: 0.5, health_edu: 0.4 }, econPref: 0.4, welfarePref: 0.3, turnout: 0.55, leaderSens: 1.1, digital: 1, ground: 0.5 },
  { id: 'urban_poor', name: 'Urban poor', salience: { inflation: 1, jobs: 0.8, welfare: 0.7, health_edu: 0.4 }, econPref: -0.4, welfarePref: 0.85, turnout: 0.6, leaderSens: 0.9, digital: 0.6, ground: 0.8 },
  { id: 'traders', name: 'Traders & small business', salience: { economy: 1, corruption: 0.5, infrastructure: 0.4, inflation: 0.4 }, econPref: 0.6, welfarePref: 0.3, turnout: 0.66, leaderSens: 1, digital: 0.6, ground: 0.6 },
  { id: 'youth', name: 'First-time & young voters', salience: { jobs: 1, health_edu: 0.6, corruption: 0.5, environment: 0.3 }, econPref: 0.1, welfarePref: 0.5, turnout: 0.5, leaderSens: 1.2, digital: 1.2, ground: 0.5 },
  { id: 'public_sector', name: 'Govt employees & pensioners', salience: { inflation: 0.7, health_edu: 0.6, welfare: 0.4, security: 0.4 }, econPref: -0.1, welfarePref: 0.5, turnout: 0.74, leaderSens: 0.8, digital: 0.6, ground: 0.6 },
  { id: 'welfare_hh', name: 'Welfare-reliant households', salience: { welfare: 1, inflation: 0.8, health_edu: 0.5 }, econPref: -0.5, welfarePref: 1, turnout: 0.66, leaderSens: 0.9, digital: 0.3, ground: 0.9 },
];

export const SEGMENT_BY_ID = Object.fromEntries(SEGMENTS.map((s) => [s.id, s])) as Record<SegmentId, SegmentDef>;

export const ISSUES: { id: Issue; name: string; polarising: number }[] = [
  { id: 'economy', name: 'Economy & growth', polarising: 0.1 },
  { id: 'inflation', name: 'Prices & cost of living', polarising: 0.05 },
  { id: 'jobs', name: 'Jobs', polarising: 0.05 },
  { id: 'agriculture', name: 'Agriculture', polarising: 0.1 },
  { id: 'welfare', name: 'Welfare schemes', polarising: 0.15 },
  { id: 'security', name: 'National security', polarising: 0.35 },
  { id: 'corruption', name: 'Corruption & governance', polarising: 0.15 },
  { id: 'infrastructure', name: 'Infrastructure', polarising: 0.05 },
  { id: 'identity', name: 'Identity & culture', polarising: 0.6 },
  { id: 'federalism', name: 'State rights', polarising: 0.3 },
  { id: 'health_edu', name: 'Health & education', polarising: 0.05 },
  { id: 'environment', name: 'Environment', polarising: 0.15 },
];
export const ISSUE_NAME = Object.fromEntries(ISSUES.map((i) => [i.id, i.name])) as Record<Issue, string>;

export interface PolicyDef {
  id: string;
  name: string;
  issue: Issue;
  cost: number; // fiscal weight 0..5
  econ: number; // where the policy sits
  social: number;
  federal: number;
  appeal: Partial<Record<SegmentId, number>>; // -1..1
  desc: string;
}

export const POLICIES: PolicyDef[] = [
  { id: 'msp_law', name: 'Legal guarantee on crop prices', issue: 'agriculture', cost: 4, econ: -0.5, social: 0, federal: 0, appeal: { farmers: 1, agri_labour: 0.3, urban_middle: -0.3, traders: -0.2 }, desc: 'Statutory minimum support prices for major crops. Popular with growers, expensive, and economists will say so loudly.' },
  { id: 'cash_women', name: 'Monthly cash transfer to women', issue: 'welfare', cost: 5, econ: -0.6, social: -0.1, federal: 0, appeal: { welfare_hh: 1, agri_labour: 0.7, urban_poor: 0.7, urban_middle: -0.3, traders: -0.2 }, desc: 'A direct monthly payment to women heads of household. Huge reach, huge bill.' },
  { id: 'apprentice', name: 'Paid apprenticeship for graduates', issue: 'jobs', cost: 3, econ: -0.2, social: 0, federal: 0, appeal: { youth: 1, urban_poor: 0.4, urban_middle: 0.3 }, desc: 'A year of paid apprenticeship for every graduate under 25.' },
  { id: 'manufacturing', name: 'Manufacturing corridors and PLI expansion', issue: 'economy', cost: 2, econ: 0.6, social: 0, federal: -0.2, appeal: { traders: 0.6, urban_middle: 0.6, youth: 0.4, farmers: -0.1 }, desc: 'Incentives and land banks for factories. Business likes it; land acquisition fights follow.' },
  { id: 'gst_simplify', name: 'Two-rate GST simplification', issue: 'economy', cost: 2, econ: 0.4, social: 0, federal: -0.1, appeal: { traders: 1, urban_middle: 0.4 }, desc: 'Collapse GST slabs into two. Traders cheer; states worry about revenue.' },
  { id: 'fuel_cut', name: 'Fuel tax cut', issue: 'inflation', cost: 3, econ: -0.1, social: 0, federal: -0.1, appeal: { urban_middle: 0.6, urban_poor: 0.6, farmers: 0.5, traders: 0.5, public_sector: 0.3 }, desc: 'Cut central excise on petrol and diesel. Quick relief, real revenue loss.' },
  { id: 'health_cover', name: 'Universal health cover top-up', issue: 'health_edu', cost: 4, econ: -0.4, social: -0.1, federal: 0, appeal: { welfare_hh: 0.7, public_sector: 0.5, urban_poor: 0.6, urban_middle: 0.3 }, desc: 'Expand hospital insurance to every household with a higher ceiling.' },
  { id: 'old_pension', name: 'Restore old pension scheme', issue: 'welfare', cost: 4, econ: -0.6, social: 0, federal: 0, appeal: { public_sector: 1, urban_middle: -0.2, youth: -0.3 }, desc: 'Defined-benefit pensions for government staff. Loved by employees, criticised as fiscally reckless.' },
  { id: 'anti_graft', name: 'Independent anti-corruption ombudsman', issue: 'corruption', cost: 1, econ: 0, social: -0.1, federal: 0.1, appeal: { urban_middle: 0.8, youth: 0.5, traders: 0.3 }, desc: 'A Lokpal with teeth and fixed timelines.' },
  { id: 'border_infra', name: 'Defence modernisation and border roads', issue: 'security', cost: 3, econ: 0.1, social: 0.6, federal: -0.4, appeal: { urban_middle: 0.5, public_sector: 0.4, traders: 0.2 }, desc: 'Bigger capital budget for forces and frontier infrastructure.' },
  { id: 'uniform_code', name: 'Uniform civil code', issue: 'identity', cost: 0, econ: 0, social: 0.9, federal: -0.5, appeal: { urban_middle: 0.3, welfare_hh: -0.2 }, desc: 'One civil code for all communities. Mobilises supporters and opponents in equal heat.' },
  { id: 'caste_census', name: 'Nationwide caste census', issue: 'identity', cost: 1, econ: -0.3, social: -0.4, federal: 0.2, appeal: { agri_labour: 0.5, welfare_hh: 0.4, urban_middle: -0.3 }, desc: 'Count every community and revisit reservations from the data.' },
  { id: 'state_share', name: 'Raise states’ share of central taxes', issue: 'federalism', cost: 2, econ: 0, social: 0, federal: 0.9, appeal: { public_sector: 0.2 }, desc: 'Devolve more revenue to states. Strong in the south and east, unpopular with centralisers.' },
  { id: 'rural_roads', name: 'Rural roads and water in every village', issue: 'infrastructure', cost: 3, econ: 0, social: 0, federal: 0, appeal: { farmers: 0.6, agri_labour: 0.6, welfare_hh: 0.4 }, desc: 'Last-mile roads, piped water and power reliability.' },
  { id: 'metro_transit', name: 'Metro and urban transit fund', issue: 'infrastructure', cost: 3, econ: 0.2, social: 0, federal: -0.1, appeal: { urban_middle: 0.8, urban_poor: 0.5, youth: 0.3 }, desc: 'Central fund for metros and buses in 100 cities.' },
  { id: 'green_jobs', name: 'Green energy jobs mission', issue: 'environment', cost: 2, econ: 0.1, social: -0.2, federal: 0, appeal: { youth: 0.6, urban_middle: 0.4, farmers: 0.1 }, desc: 'Rooftop solar, grid storage and training for the jobs that come with them.' },
  { id: 'farm_loan', name: 'Farm loan waiver', issue: 'agriculture', cost: 5, econ: -0.6, social: 0, federal: 0, appeal: { farmers: 1, agri_labour: 0.2, urban_middle: -0.5, traders: -0.3 }, desc: 'Write off small farm loans. Fast relief; banks and economists object.' },
  { id: 'school_quality', name: 'Government school overhaul', issue: 'health_edu', cost: 3, econ: -0.2, social: -0.1, federal: 0.1, appeal: { urban_poor: 0.6, welfare_hh: 0.5, public_sector: 0.3, youth: 0.3 }, desc: 'Teachers, labs and accountability for public schools.' },
];
export const POLICY_BY_ID = Object.fromEntries(POLICIES.map((p) => [p.id, p]));

export interface OutletDef { id: string; name: string; lean: 'government' | 'opposition' | 'neutral' | 'regional' | 'sensational'; region?: string }
export const OUTLETS: OutletDef[] = [
  { id: 'rashtra', name: 'Rashtra Times', lean: 'government' },
  { id: 'ledger', name: 'The Daily Ledger', lean: 'neutral' },
  { id: 'janpath', name: 'Janpath Express', lean: 'opposition' },
  { id: 'southern', name: 'Southern Chronicle', lean: 'regional', region: 'South' },
  { id: 'purba', name: 'Purba Barta', lean: 'regional', region: 'East' },
  { id: 'netnagrik', name: 'NetNagrik Live', lean: 'sensational' },
];

export const STAFF_ROLES: { id: StaffRole; name: string; desc: string }[] = [
  { id: 'campaign_manager', name: 'Campaign manager', desc: 'Adds campaign capacity. Overloaded managers make coordination mistakes.' },
  { id: 'strategist', name: 'Political strategist', desc: 'Sharpens war-room recommendations and reads rival intentions from public moves.' },
  { id: 'data_analyst', name: 'Data analyst', desc: 'Reduces polling error and spots inflated crowd reports.' },
  { id: 'communications', name: 'Communications director', desc: 'Improves message resonance and lowers the chance of gaffes.' },
  { id: 'finance', name: 'Finance manager', desc: 'Improves lawful fundraising and flags overspending.' },
  { id: 'regional_coordinator', name: 'Regional coordinator', desc: 'Builds organisation in an assigned state and adds local capacity there.' },
  { id: 'candidate_manager', name: 'Candidate manager', desc: 'Vets candidates and exposes hidden controversy risk before tickets lock.' },
  { id: 'policy_adviser', name: 'Policy adviser', desc: 'Raises manifesto credibility and warns about contradictions.' },
  { id: 'negotiator', name: 'Coalition negotiator', desc: 'Better terms in alliance and coalition talks.' },
  { id: 'volunteer_coordinator', name: 'Volunteer coordinator', desc: 'Door-to-door work goes further and volunteer morale holds up.' },
  { id: 'crisis_adviser', name: 'Crisis communications adviser', desc: 'Softens the damage when stories break.' },
];
export const STAFF_ROLE_NAME = Object.fromEntries(STAFF_ROLES.map((r) => [r.id, r.name])) as Record<StaffRole, string>;

export const FIRST_NAMES = {
  North: ['Amit', 'Sunita', 'Rakesh', 'Pooja', 'Vikas', 'Neha', 'Sanjay', 'Kiran', 'Deepak', 'Anjali', 'Manoj', 'Rekha', 'Arvind', 'Shalini', 'Rahul', 'Farhan', 'Nazia', 'Gurpreet', 'Harleen', 'Ashok'],
  West: ['Hemant', 'Bhavna', 'Nilesh', 'Snehal', 'Paresh', 'Jigna', 'Sachin', 'Ashwini', 'Mahesh', 'Rupali', 'Kunal', 'Hetal', 'Tushar', 'Yasmin', 'Prakash'],
  Central: ['Rajendra', 'Savita', 'Dilip', 'Mamta', 'Naresh', 'Kusum', 'Ravi', 'Seema', 'Gopal', 'Lata', 'Shahid'],
  East: ['Subrata', 'Moumita', 'Ranjit', 'Payel', 'Abhijit', 'Shreya', 'Biswajit', 'Rina', 'Manas', 'Sangeeta', 'Rafiq', 'Tapas', 'Lipika'],
  Northeast: ['Bhaskar', 'Ritu', 'Lalthanga', 'Kuntala', 'Imtisunep', 'Dorjee', 'Pranjal', 'Mitali', 'Thangjam'],
  South: ['Karthik', 'Lakshmi', 'Suresh', 'Divya', 'Venkatesh', 'Anitha', 'Ramesh', 'Priya', 'Arjun', 'Meenakshi', 'Joseph', 'Mary', 'Shibu', 'Fathima', 'Naveen', 'Kavya'],
};
export const SURNAMES = {
  North: ['Sharma', 'Verma', 'Singh', 'Gupta', 'Chauhan', 'Yadav', 'Tiwari', 'Khan', 'Ahmed', 'Sandhu', 'Gill', 'Rawat', 'Negi', 'Malik', 'Pandey', 'Mishra', 'Rathore'],
  West: ['Patel', 'Shah', 'Desai', 'Joshi', 'Patil', 'Kulkarni', 'Shinde', 'Jadhav', 'Mehta', 'Rathod', 'Chavan', 'Sheikh'],
  Central: ['Tomar', 'Dubey', 'Sahu', 'Bhagat', 'Thakur', 'Patel', 'Markam', 'Netam', 'Qureshi'],
  East: ['Banerjee', 'Das', 'Ghosh', 'Mahato', 'Mondal', 'Sahoo', 'Mohanty', 'Kumar', 'Paswan', 'Jha', 'Hansda', 'Ansari'],
  Northeast: ['Bora', 'Gogoi', 'Sangma', 'Lyngdoh', 'Debbarma', 'Singh', 'Ao', 'Lepcha', 'Saikia'],
  South: ['Reddy', 'Naidu', 'Iyer', 'Pillai', 'Nair', 'Gowda', 'Rao', 'Kumar', 'Menon', 'Thomas', 'Varghese', 'Raju', 'Selvam', 'Shetty', 'Basha'],
};
