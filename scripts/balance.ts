// Automated balance batch: 500 simulated elections across controlled experiments, run in
// parallel worker processes. Writes docs/BALANCE.md with what it found.
//
//   node scripts/balance.ts            (all experiments)
//   node scripts/balance.ts worker <experiment> <seed> <count>   (internal)

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGame, advanceTurn, completeCounting, advanceFormation, applyCommand, MAJORITY } from '../src/engine/index.ts';
import type { GameState, ScenarioConfig, Difficulty } from '../src/engine/index.ts';
import { setForecastSims } from '../src/engine/forecast.ts';
import { makeRng } from '../src/engine/rng.ts';

interface Exp { id: string; runs: number; label: string }
const EXPERIMENTS: Exp[] = [
  { id: 'base-easy', runs: 40, label: 'AI-only, 2029, easy' },
  { id: 'base-normal', runs: 50, label: 'AI-only, 2029, normal' },
  { id: 'base-hard', runs: 40, label: 'AI-only, 2029, hard' },
  { id: 'hist-2019', runs: 30, label: 'AI-only, 2019 scenario' },
  { id: 'hist-2014', runs: 30, label: 'AI-only, 2014 scenario' },
  { id: 'rich-inc', runs: 40, label: 'AI-only, INC war chest x4' },
  { id: 'no-alliances', runs: 40, label: 'AI-only, no pre-poll alliances' },
  { id: 'strat-idle', runs: 30, label: 'Scripted INC: does nothing' },
  { id: 'strat-rallyspam', runs: 30, label: 'Scripted INC: leader rallies in the same few seats' },
  { id: 'strat-targeted', runs: 30, label: 'Scripted INC: town halls and doors in toss-ups, org early' },
  { id: 'strat-targeted-easy', runs: 30, label: 'Scripted INC targeted, easy AI' },
  { id: 'strat-targeted-hard', runs: 30, label: 'Scripted INC targeted, hard AI' },
  { id: 'custom-party', runs: 40, label: 'Custom party in Maharashtra, targeted play' },
  { id: 'shadow', runs: 40, label: 'Scripted INC: targeted + backdoor money every week' },
]; // 500 runs

interface RunOut {
  exp: string; seed: number; seats: Record<string, number>; votes: Record<string, number>; blocs: Record<string, number>;
  incumbentHeld: number; incumbentTotal: number; maxWeeklySwing: number; forecastErr: number; topVoteNotTopSeat: boolean;
  focus: { seats: number; votes: number; funds: number; caught: boolean }; gov: string; turnout: number;
}

const DIFF: Record<string, Difficulty> = { 'base-easy': 'easy', 'base-hard': 'hard', 'strat-targeted-easy': 'easy', 'strat-targeted-hard': 'hard' };

function configFor(exp: string, seed: number): ScenarioConfig {
  const c: ScenarioConfig = { scenarioId: exp === 'hist-2019' ? 'ls2019' : exp === 'hist-2014' ? 'ls2014' : 'ls2029', mode: 'quick', difficulty: DIFF[exp] ?? 'normal', playerParty: 'INC', seed, campaignTurns: 8, eventFrequency: 1 };
  if (exp === 'no-alliances') { c.mode = 'sandbox'; c.sandbox = { noAlliances: true }; }
  if (exp === 'custom-party') {
    c.playerParty = 'CUSTOM';
    c.customParty = { name: 'Test Morcha', short: 'TM', color: '#7c5cff', color2: '#ffffff', symbol: 'star', ideology: { econ: 0.1, social: -0.1, federal: 0.4, welfare: 0.6 }, homeState: 'MH', leaderName: 'Test', leaderStyle: 'populist', structure: 'federated', recruitment: 'local_notables', focusIssues: ['jobs', 'agriculture'], startingFunds: 150, recognition: 0.35 };
  }
  return c;
}

let nonce = 0;
function scriptedTurn(g: GameState, exp: string) {
  const me = g.playerParty;
  const q = (action: Record<string, unknown>) => applyCommand(g, me, { type: 'queue_action', action: { id: `s${nonce++}`, party: me, ...action } as never });
  if (exp === 'strat-rallyspam') {
    const seats = g.seats.filter((c) => c.candidates[me]).sort((a, b) => (b.base[me] ?? 0) - (a.base[me] ?? 0)).slice(0, 3);
    for (let i = 0; i < 5; i++) q({ type: 'rally', constituency: seats[i % 3].id, speaker: 'leader', issue: 'jobs' });
    return;
  }
  if (exp.startsWith('strat-targeted') || exp === 'custom-party' || exp === 'shadow') {
    if (g.stage === 'preparation') {
      const home = g.parties[me].homeStates[0] ?? 'KA';
      q({ type: 'org_build', state: home, budget: Math.min(30, Math.max(3, Math.floor(g.parties[me].stats.funds * 0.15))) });
      q({ type: 'research', state: home });
    }
    const toss = g.seats.filter((c) => c.candidates[me]).map((c) => ({ c, p: g.seatForecast[c.id]?.probs[me] ?? 0 })).filter((x) => x.p > 0.2 && x.p < 0.8).sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5));
    for (const { c } of toss.slice(0, 2)) q({ type: 'rally', constituency: c.id, speaker: 'leader', issue: c.localIssues[0] });
    for (const { c } of toss.slice(2, 10)) ((c.org[me] ?? 0) > 0.25 ? q({ type: 'door_to_door', constituency: c.id }) : q({ type: 'town_hall', constituency: c.id, issue: c.localIssues[0] }));
    if (exp === 'shadow') applyCommand(g, me, { type: 'backdoor', amount: 25 });
    if (exp === 'custom-party' && g.stage !== 'final_push') {
      // a new party's realistic shortcut: bring over disgruntled local notables
      const home = g.parties[me].homeStates[0];
      const pick = g.seats.filter((c) => c.state === home && c.candidates[me]).flatMap((c) => Object.entries(c.candidates).filter(([p, k]) => p !== me && p !== 'OTH' && k.loyalty < 0.4).map(([p, k]) => ({ c, p, v: k.localRep * (c.base[p] ?? 0) }))).sort((a, b) => b.v - a.v)[0];
      if (pick) applyCommand(g, me, { type: 'poach', seat: pick.c.id, from: pick.p, mult: 1.3 });
    }
  }
}

function runOne(exp: string, seed: number): RunOut {
  let g = createGame(configFor(exp, seed));
  const focus = g.playerParty;
  if (exp === 'rich-inc') g.parties.INC.stats.funds *= 4;
  const scripted = exp.startsWith('strat') || exp === 'custom-party' || exp === 'shadow';
  if (!scripted) g.parties[focus].controlledBy = 'ai'; // pure AI-only election
  let maxSwing = 0;
  while (g.phase === 'campaign') {
    if (scripted && exp !== 'strat-idle') scriptedTurn(g, exp);
    const prev = g.polls[g.polls.length - 1];
    g = advanceTurn(g, {});
    const cur = g.polls[g.polls.length - 1];
    if (cur !== prev && g.phase === 'campaign') for (const p of Object.keys(cur.seats)) maxSwing = Math.max(maxSwing, Math.abs(cur.seats[p][1] - prev.seats[p][1]));
  }
  g = completeCounting(g);
  const r = g.results[0];
  const rng = makeRng(seed);
  while (g.phase === 'formation') advanceFormation(g, rng);
  let held = 0, tot = 0;
  for (const c of g.seats) { if (c.prev) { tot++; if (r.seats[c.id].winner === c.prev.winner) held++; } }
  const topVote = Object.entries(r.voteShare).filter(([p]) => p !== 'OTH').sort((a, b) => b[1] - a[1])[0][0];
  const topSeat = Object.entries(r.partySeats).filter(([p]) => p !== 'OTH').sort((a, b) => b[1] - a[1])[0][0];
  const err = Object.keys(r.partySeats).reduce((a, p) => a + Math.abs((r.partySeats[p] ?? 0) - (r.forecastAtPoll[p] ?? 0)), 0) / 2;
  return {
    exp, seed, seats: r.partySeats, votes: r.voteShare, blocs: r.blocSeats, incumbentHeld: held, incumbentTotal: tot, maxWeeklySwing: maxSwing,
    forecastErr: err, topVoteNotTopSeat: topVote !== topSeat, turnout: r.turnout,
    focus: { seats: r.partySeats[focus] ?? 0, votes: r.voteShare[focus] ?? 0, funds: g.parties[focus].stats.funds, caught: g.memory.some((m) => m.party === focus && m.kind === 'finance') },
    gov: g.government?.pmParty ?? '',
  };
}

// --- worker
if (process.argv[2] === 'worker') {
  setForecastSims(40);
  const [exp, seed0, n] = [process.argv[3], Number(process.argv[4]), Number(process.argv[5])];
  for (let i = 0; i < n; i++) process.stdout.write(JSON.stringify(runOne(exp, seed0 + i)) + '\n');
  process.exit(0);
}

// --- orchestrator
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const pct = (xs: number[], f: number) => { const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };

async function main() {
  const t0 = Date.now();
  const jobs: { exp: string; seed: number; n: number }[] = [];
  for (const e of EXPERIMENTS) for (let s = 0; s < e.runs; s += 5) jobs.push({ exp: e.id, seed: 1000 + s, n: Math.min(5, e.runs - s) });
  const results: RunOut[] = [];
  const conc = Math.max(1, cpus().length - 1);
  let next = 0, done = 0;
  const self = fileURLToPath(import.meta.url);
  await new Promise<void>((resolve) => {
    const launch = () => {
      if (next >= jobs.length) { if (done === jobs.length) resolve(); return; }
      const j = jobs[next++];
      const child = spawn(process.execPath, [self, 'worker', j.exp, String(j.seed), String(j.n)], { stdio: ['ignore', 'pipe', 'inherit'] });
      let buf = '';
      child.stdout.on('data', (d) => { buf += d; });
      child.on('close', () => {
        for (const line of buf.split('\n')) if (line.trim()) results.push(JSON.parse(line));
        done++;
        process.stderr.write(`\r${results.length}/500 runs`);
        launch();
        if (done === jobs.length) resolve();
      });
    };
    for (let i = 0; i < conc; i++) launch();
  });
  const by = (id: string) => results.filter((r) => r.exp === id);
  const lines: string[] = [];
  const P = (s = '') => lines.push(s);
  P('# Balance report');
  P();
  P(`Generated by \`npm run balance\` on ${new Date().toISOString().slice(0, 10)}: ${results.length} simulated elections in ${Math.round((Date.now() - t0) / 1000)}s. Forecasts inside these runs used 40 simulations per week instead of 90 to save time. Every number here is simulated; none of it is a prediction of a real election.`);
  P();
  P('## Seat outcomes by experiment');
  P();
  P('| Experiment | Runs | Focus party seats (mean ± sd) | Focus vote % | Largest party seats (p10–p90) | Hung parliaments |');
  P('|---|---|---|---|---|---|');
  for (const e of EXPERIMENTS) {
    const rs = by(e.id);
    if (!rs.length) continue;
    const fs = rs.map((r) => r.focus.seats);
    const top = rs.map((r) => Math.max(...Object.entries(r.seats).filter(([p]) => p !== 'OTH').map(([, n]) => n)));
    const hung = rs.filter((r) => Math.max(...Object.values(r.seats)) < MAJORITY).length;
    P(`| ${e.label} | ${rs.length} | ${mean(fs).toFixed(1)} ± ${sd(fs).toFixed(1)} | ${(mean(rs.map((r) => r.focus.votes)) * 100).toFixed(1)} | ${pct(top, 0.1)}–${pct(top, 0.9)} | ${hung} |`);
  }
  P();
  const base = by('base-normal');
  const incBase = mean(base.map((r) => r.seats.INC ?? 0));
  const incRich = mean(by('rich-inc').map((r) => r.seats.INC ?? 0));
  P('## Questions the batch was asked');
  P();
  P(`**Does wealth dominate?** INC with four times the money averaged ${incRich.toFixed(1)} seats against ${incBase.toFixed(1)} at normal funding (${(incRich - incBase >= 0 ? '+' : '')}${(incRich - incBase).toFixed(1)}). Money is capped by leader days and team capacity, so a richer party cannot simply buy every seat.`);
  P();
  const noAll = by('no-alliances');
  const blocMembers = { NDA: ['BJP', 'TDP', 'JDU', 'SHS', 'NCP', 'JDS'], INDIA: ['INC', 'SP', 'DMK', 'RJD', 'SSUBT', 'NCPSP', 'CPIM', 'CPI', 'JMM', 'IUML', 'AAP'] };
  for (const [bloc, members] of Object.entries(blocMembers)) {
    const w = mean(base.map((r) => members.reduce((a, m) => a + (r.seats[m] ?? 0), 0)));
    const wo = mean(noAll.map((r) => members.reduce((a, m) => a + (r.seats[m] ?? 0), 0)));
    const losers = members.filter((m) => mean(base.map((r) => r.seats[m] ?? 0)) < mean(noAll.map((r) => r.seats[m] ?? 0)) - 0.5);
    P(`**Do alliances always help? (${bloc})** Members won ${w.toFixed(1)} seats together with the alliance and ${wo.toFixed(1)} without it. ${losers.length ? `Members who did worse inside the alliance: ${losers.join(', ')}.` : 'No member did clearly worse inside it.'}`);
    P();
  }
  const idle = mean(by('strat-idle').map((r) => r.focus.seats));
  const spam = mean(by('strat-rallyspam').map((r) => r.focus.seats));
  const targ = mean(by('strat-targeted').map((r) => r.focus.seats));
  P(`**Does rally spam beat strategy?** Scripted INC strategies at normal difficulty: doing nothing ${idle.toFixed(1)} seats, leader rallies hammered into the same three safe seats ${spam.toFixed(1)}, targeted town halls and door-to-door in toss-ups ${targ.toFixed(1)}.`);
  P();
  const inc = base.reduce((a, r) => a + r.incumbentHeld, 0) / Math.max(1, base.reduce((a, r) => a + r.incumbentTotal, 0));
  P(`**Are incumbents unbeatable?** In AI-only normal runs, ${(inc * 100).toFixed(0)}% of seats stayed with the party that won them in the (simulated) previous contest. Real Lok Sabha seat retention varies a lot between elections; anything far above about 75% would suggest the model is too sticky.`);
  P();
  P(`**Do preferences move too easily?** The largest one-week change in any party's projected seats averaged ${mean(base.map((r) => r.maxWeeklySwing)).toFixed(1)} (max ${Math.max(...base.map((r) => r.maxWeeklySwing))}).`);
  P();
  P(`**Votes vs seats.** The party with the most votes failed to win the most seats in ${results.filter((r) => r.topVoteNotTopSeat).length} of ${results.length} runs. Mean final-forecast seat error (half the sum of absolute errors) was ${mean(results.map((r) => r.forecastErr)).toFixed(1)} seats.`);
  P();
  const cust = by('custom-party').map((r) => r.focus.seats);
  P(`**Can small parties grow?** A new custom party based in Maharashtra won ${mean(cust).toFixed(1)} seats on average (best ${Math.max(...cust)}, ${cust.filter((x) => x > 0).length}/${cust.length} runs with at least one seat), on ${(mean(by('custom-party').map((r) => r.focus.votes)) * 100).toFixed(1)}% of the national vote.`);
  P();
  const e = mean(by('strat-targeted-easy').map((r) => r.focus.seats)), h = mean(by('strat-targeted-hard').map((r) => r.focus.seats));
  P(`**Does difficulty work through AI behaviour?** The same scripted INC strategy won ${e.toFixed(1)} seats on easy, ${targ.toFixed(1)} on normal and ${h.toFixed(1)} on hard. The vote arithmetic is identical across difficulties; only rival decision quality and the player's starting money and gaffe and crisis forgiveness differ.`);
  P();
  const sh = by('shadow');
  P(`**Does dirty money pay?** Taking ₹25 cr off the books every week: ${mean(sh.map((r) => r.focus.seats)).toFixed(1)} seats against ${targ.toFixed(1)} for the clean version of the same strategy; caught in ${sh.filter((r) => r.focus.caught).length} of ${sh.length} runs.`);
  P();
  P('## Plausibility checks');
  P();
  const gov = new Map<string, number>(); for (const r of base) gov.set(r.gov, (gov.get(r.gov) ?? 0) + 1);
  P(`- Government formed by (normal AI-only): ${[...gov.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  P(`- Mean turnout ${(mean(results.map((r) => r.turnout)) * 100).toFixed(1)}%.`);
  P(`- 2019 scenario: BJP ${mean(by('hist-2019').map((r) => r.seats.BJP ?? 0)).toFixed(0)} seats on average (recorded: 303). 2014 scenario: BJP ${mean(by('hist-2014').map((r) => r.seats.BJP ?? 0)).toFixed(0)} (recorded: 282). Starting shares are rough estimates, so these are sanity checks, not calibration targets.`);
  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/BALANCE.md', lines.join('\n') + '\n');
  writeFileSync('docs/balance-raw.json', JSON.stringify(results));
  process.stderr.write(`\nWrote docs/BALANCE.md\n`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) main();
