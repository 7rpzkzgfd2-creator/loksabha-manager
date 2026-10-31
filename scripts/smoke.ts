// Quick end-to-end run: create a game, play every turn with AI only, count, form govt.
import { createGame, advanceTurn, completeCounting, advanceFormation, MAJORITY } from '../src/engine/index.ts';
import { makeRng } from '../src/engine/rng.ts';

const t0 = performance.now();
let s = createGame({ scenarioId: process.argv[2] ?? 'ls2029', mode: 'quick', difficulty: 'normal', playerParty: 'INC', seed: Number(process.argv[3] ?? 42), campaignTurns: 8, eventFrequency: 1 });
console.log('setup ms', Math.round(performance.now() - t0));
const top = (rec: Record<string, number>) => Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${typeof v === 'number' && v < 1 ? (v * 100).toFixed(1) + '%' : v}`).join(' ');
console.log('initial forecast', top(Object.fromEntries(Object.entries(s.polls[0].seats).map(([k, v]) => [k, v[1]]))));
while (s.phase === 'campaign') {
  const t = performance.now();
  s = advanceTurn(s, {});
  const last = s.polls[s.polls.length - 1];
  console.log(`turn ${s.turn} ${Math.round(performance.now() - t)}ms`, s.phase === 'campaign' ? top(Object.fromEntries(Object.entries(last.seats).map(([k, v]) => [k, v[1]]))) : 'POLLING', 'events', s.events.filter(e => e.turn === s.turn).length);
}
s = completeCounting(s);
const r = s.results[0];
console.log('RESULT seats', top(r.partySeats));
console.log('RESULT votes', top(r.voteShare));
console.log('blocs', r.blocSeats, 'turnout', r.turnout.toFixed(3));
const sum = Object.values(r.partySeats).reduce((a, b) => a + b, 0);
console.log('seat sum', sum);
const rng = makeRng(1);
while (s.phase === 'formation') console.log(advanceFormation(s, rng).join(' | '));
console.log('gov', s.government?.pmParty, s.government?.partners, 'phase', s.phase, 'majority', MAJORITY);
console.log('news sample', s.news.slice(0, 5).map(n => n.headline));
