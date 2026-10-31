// Shared helpers for writing to the political record: memory, news, inbox, logs and
// delayed consequences.

import { OUTLETS } from './data/catalog.ts';
import type { Rng } from './rng.ts';
import { uid } from './rng.ts';
import type { DelayedEffect, GameState, InboxMessage, MemoryEntry, NewsItem } from './types.ts';

export function remember(state: GameState, rng: Rng, e: Omit<MemoryEntry, 'id' | 'turn' | 'cycle'>) {
  state.memory.push({ ...e, id: uid(rng, 'mem'), turn: state.turn, cycle: state.cycle });
}

export function schedule(state: GameState, rng: Rng, e: Omit<DelayedEffect, 'id'>) {
  state.delayed.push({ ...e, id: uid(rng, 'dly') });
}

export function mail(state: GameState, rng: Rng, m: Omit<InboxMessage, 'id' | 'turn' | 'read'>) {
  if (state.parties[m.party]?.controlledBy !== 'human') return;
  state.inbox.unshift({ ...m, id: uid(rng, 'msg'), turn: state.turn, read: false });
}

export function log(state: GameState, text: string, party?: string) {
  state.log.push({ turn: state.turn, text, party });
}

export function relate(state: GameState, a: string, b: string, delta: number) {
  if (!state.relations[a] || !state.relations[b]) return;
  state.relations[a][b] = Math.max(-1, Math.min(1, (state.relations[a][b] ?? 0) + delta));
  state.relations[b][a] = Math.max(-1, Math.min(1, (state.relations[b][a] ?? 0) + delta * 0.7));
}

// News: one neutral fact plus an outlet's slant. `tone` is how the event reads for parties[0].
export function report(state: GameState, rng: Rng, n: { headline: string; fact: string; parties: string[]; tone: number; region?: string }) {
  const gov = state.government?.pmParty;
  const subject = n.parties[0];
  const isGov = subject === gov || !!state.government?.partners.includes(subject);
  const candidates = OUTLETS.filter((o) => o.lean !== 'regional' || o.region === n.region);
  const outlet = rng.pick(candidates);
  let tone = n.tone;
  if (outlet.lean === 'government') tone += isGov ? 0.3 : -0.2;
  if (outlet.lean === 'opposition') tone += isGov ? -0.3 : 0.2;
  if (outlet.lean === 'sensational') tone *= 1.5;
  const name = state.parties[subject]?.short ?? subject;
  const spin = tone > 0.35 ? `${outlet.name} calls it a clear win for the ${name}.`
    : tone > 0.05 ? `${outlet.name} says the ${name} will be pleased, with caveats.`
    : tone > -0.05 ? `${outlet.name} treats it as a wash.`
    : tone > -0.35 ? `${outlet.name} reads it as a stumble for the ${name}.`
    : `${outlet.name} calls it a serious blow to the ${name}.`;
  const item: NewsItem = { id: uid(rng, 'news'), turn: state.turn, outlet: outlet.name, headline: n.headline, fact: n.fact, spin, parties: n.parties, tone: Math.max(-1, Math.min(1, tone)) };
  state.news.unshift(item);
  if (state.news.length > 250) state.news.length = 250;
}
