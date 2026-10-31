// Multiplayer server. Turn-based and server-authoritative: clients send intentions
// (commands, "I'm done with this week"); the server validates them with the same engine
// the single-player game uses, advances turns, runs the AI for unclaimed parties and
// sends each player a filtered view that hides rivals' private information.
//
// Run: node server/server.ts   (Node 23.6+ runs TypeScript directly)
// Protocol: JSON over HTTP, clients poll GET /api/lobbies/:id/state every ~1.5s.

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createGame, advanceTurn, applyCommand, completeCounting, advanceFormation, PARTY_BY_ID, SCENARIO_BY_ID, clone, autopsy,
} from '../src/engine/index.ts';
import type { Command, GameState } from '../src/engine/index.ts';
import { makeRng } from '../src/engine/rng.ts';
import { migrateState } from '../src/engine/traits.ts';
import { STATE_BY_CODE } from '../src/engine/setup.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = process.env.LSM_DATA ?? join(ROOT, 'server', 'data');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8787);
mkdirSync(DATA, { recursive: true });

interface Player { id: string; name: string; token: string; party: string | null; ready: boolean; submitted: boolean; host: boolean; lastSeen: number }
interface Lobby {
  id: string; name: string; scenarioId: string; difficulty: 'easy' | 'normal' | 'hard'; campaignTurns: number; turnSeconds: number;
  status: 'lobby' | 'running' | 'finished'; players: Player[]; game: GameState | null; rev: number; deadline: number | null;
  chat: { from: string; text: string; at: number; to?: string }[]; nonces: string[]; createdAt: number;
}

const lobbies = new Map<string, Lobby>();

// --- persistence: every change is written to disk so a restart (or a crash) loses nothing
function persist(l: Lobby) {
  try { writeFileSync(join(DATA, `${l.id}.json`), JSON.stringify(l)); } catch (e) { console.error('persist failed', l.id, e); }
}
for (const f of existsSync(DATA) ? readdirSync(DATA) : []) {
  if (!f.endsWith('.json')) continue;
  try { const l = JSON.parse(readFileSync(join(DATA, f), 'utf8')) as Lobby; if (l.game) migrateState(l.game, STATE_BY_CODE); lobbies.set(l.id, l); } catch { console.error('could not load', f); }
}

// --- helpers
const send = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) throw new Error('Request too large.'); }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('Invalid JSON.'); }
}
const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const code = () => randomBytes(3).toString('hex').toUpperCase();

// simple token-bucket rate limit
const buckets = new Map<string, { t: number; n: number }>();
function limited(key: string, perSec = 15): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { t: now, n: perSec };
  b.n = Math.min(perSec, b.n + ((now - b.t) / 1000) * perSec);
  b.t = now;
  if (b.n < 1) { buckets.set(key, b); return true; }
  b.n -= 1; buckets.set(key, b);
  return false;
}

function auth(l: Lobby, token: unknown): Player {
  const p = l.players.find((x) => x.token === token);
  if (!p) throw Object.assign(new Error('Not a member of this lobby.'), { status: 403 });
  p.lastSeen = Date.now();
  return p;
}

function publicLobby(l: Lobby, viewer?: Player) {
  return {
    id: l.id, name: l.name, scenarioId: l.scenarioId, difficulty: l.difficulty, campaignTurns: l.campaignTurns, status: l.status, turnSeconds: l.turnSeconds, deadline: l.deadline,
    players: l.players.map((p) => ({ id: p.id, name: p.name, party: p.party, ready: p.ready, submitted: p.submitted, host: p.host, connected: Date.now() - p.lastSeen < 10_000 })),
    chat: l.chat.filter((c) => !c.to || c.to === viewer?.id || c.from === viewer?.name).slice(-80),
  };
}

// What one player is allowed to see. Rivals' money, staff, queued plans, private ledger,
// inbox and hidden polling error never leave the server.
export function viewFor(g: GameState, party: string): GameState {
  const v = clone(g);
  v.playerParty = party;
  for (const p of Object.values(v.parties)) {
    if (p.id === party) continue;
    p.stats.funds = 0; p.stats.shadowExposure = 0; p.stats.shadowTotal = 0; p.staff = []; p.stateBudget = {}; p.stateSpent = {};
    for (const f of p.factions) f.grievances = [];
  }
  v.queued = { [party]: g.queued[party] ?? [] };
  v.inbox = g.inbox.filter((m) => m.party === party);
  v.shadow = g.shadow.filter((d) => d.party === party);
  v.pollBias = {};
  v.delayed = g.delayed.filter((d) => d.party === party);
  v.proposals = g.proposals.filter((x) => x.from === party || x.to === party);
  v.events = g.events.filter((e) => e.party === party || e.visibility === 'public').map((e) => (e.party === party ? e : { ...e, options: [], params: {} }));
  v.outcomes = g.outcomes.map((o) => (o.party === party ? o : { ...o, reported: '', notes: [], quality: 0, cost: 0, attendance: undefined, reportedAttendance: undefined }));
  v.results = g.results.map((r) => ({ ...r, autopsy: autopsy(g, r, party) }));
  if (party !== g.playerParty) {
    const last = g.polls[g.polls.length - 1], prev = g.polls[g.polls.length - 2];
    v.turnSummary = last && g.phase === 'campaign' ? [`Projection: ${last.seats[party]?.[1] ?? 0} seats (${last.seats[party]?.[0] ?? 0}–${last.seats[party]?.[2] ?? 0})${prev ? `, ${(last.seats[party]?.[1] ?? 0) - (prev.seats[party]?.[1] ?? 0) >= 0 ? 'up' : 'down'} ${Math.abs((last.seats[party]?.[1] ?? 0) - (prev.seats[party]?.[1] ?? 0))} on last week` : ''}.`] : g.turnSummary.slice(0, 1);
  }
  v.rng = 0; // the seed stream stays server-side so nobody can predict draws
  return v;
}

function startGame(l: Lobby) {
  const human: Record<string, string> = {};
  for (const p of l.players) if (p.party) human[p.party] = p.id;
  const first = l.players.find((p) => p.party)!.party!;
  l.game = createGame({ scenarioId: l.scenarioId, mode: 'multiplayer', difficulty: l.difficulty, playerParty: first, seed: randomBytes(4).readUInt32LE(0), campaignTurns: l.campaignTurns, eventFrequency: 1, humanParties: human });
  l.status = 'running';
  l.deadline = Date.now() + l.turnSeconds * 1000;
  for (const p of l.players) p.submitted = false;
}

function resolveTurn(l: Lobby) {
  if (!l.game || l.game.phase !== 'campaign') return;
  l.game = advanceTurn(l.game, {});
  for (const p of l.players) p.submitted = false;
  l.deadline = l.game.phase === 'campaign' ? Date.now() + l.turnSeconds * 1000 : null;
  l.rev++;
}

// turn deadlines
setInterval(() => {
  for (const l of lobbies.values()) {
    if (l.status === 'running' && l.deadline && Date.now() > l.deadline && l.game?.phase === 'campaign') {
      l.chat.push({ from: 'Server', text: 'Turn deadline reached. The week has been resolved.', at: Date.now() });
      resolveTurn(l); persist(l);
    }
  }
}, 2000).unref();

// --- routes
async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const parts = url.pathname.split('/').filter(Boolean); // ['api','lobbies',id,action]
  const ip = req.socket.remoteAddress ?? 'x';
  if (limited(ip, 40)) return send(res, 429, { error: 'Too many requests. Slow down.' });

  if (req.method === 'GET' && url.pathname === '/api/lobbies') {
    return send(res, 200, { lobbies: [...lobbies.values()].filter((l) => l.status !== 'finished').map((l) => ({ id: l.id, name: l.name, players: l.players.length, status: l.status, scenarioId: l.scenarioId })) });
  }
  if (req.method === 'POST' && url.pathname === '/api/lobbies') {
    const b = await readBody(req);
    const name = clean(b.name, 24);
    if (!name) return send(res, 400, { error: 'Pick a name.' });
    const scenarioId = SCENARIO_BY_ID[String(b.scenarioId)] ? String(b.scenarioId) : 'ls2029';
    const difficulty = (['easy', 'normal', 'hard'] as const).find((d) => d === b.difficulty) ?? 'normal';
    const id = code();
    const host: Player = { id: randomUUID(), name, token: randomUUID(), party: null, ready: false, submitted: false, host: true, lastSeen: Date.now() };
    const l: Lobby = { id, name: clean(b.lobbyName, 40) || `${name}'s lobby`, scenarioId, difficulty, campaignTurns: Math.max(6, Math.min(12, Number(b.campaignTurns) || 8)), turnSeconds: Math.max(60, Math.min(3600, Number(b.turnSeconds) || 300)), status: 'lobby', players: [host], game: null, rev: 0, deadline: null, chat: [], nonces: [], createdAt: Date.now() };
    lobbies.set(id, l); persist(l);
    return send(res, 200, { lobbyId: id, playerId: host.id, token: host.token, name });
  }
  if (parts[0] !== 'api' || parts[1] !== 'lobbies' || !parts[2]) return send(res, 404, { error: 'Not found.' });
  const l = lobbies.get(parts[2].toUpperCase());
  if (!l) return send(res, 404, { error: 'No such lobby.' });
  const action = parts[3];

  if (req.method === 'GET' && action === 'state') {
    const p = auth(l, url.searchParams.get('token'));
    const game = l.game && p.party ? viewFor(l.game, p.party) : null;
    return send(res, 200, { lobby: publicLobby(l, p), game, rev: l.rev, you: { party: p.party } });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const b = await readBody(req);

  if (action === 'join') {
    const name = clean(b.name, 24);
    if (!name) return send(res, 400, { error: 'Pick a name.' });
    if (l.status !== 'lobby') return send(res, 409, { error: 'This game has already started.' });
    if (l.players.length >= 8) return send(res, 409, { error: 'Lobby is full.' });
    const p: Player = { id: randomUUID(), name, token: randomUUID(), party: null, ready: false, submitted: false, host: false, lastSeen: Date.now() };
    l.players.push(p); l.rev++; persist(l);
    return send(res, 200, { lobbyId: l.id, playerId: p.id, token: p.token, name });
  }

  const p = auth(l, b.token);
  if (limited(p.token, 10)) return send(res, 429, { error: 'Too many requests.' });

  switch (action) {
    case 'claim': {
      if (l.status !== 'lobby') return send(res, 409, { error: 'Parties are fixed once the game starts.' });
      const party = String(b.party);
      if (!PARTY_BY_ID[party]?.playable || !SCENARIO_BY_ID[l.scenarioId].parties.includes(party)) return send(res, 400, { error: 'Not a playable party in this scenario.' });
      if (l.players.some((x) => x.party === party && x !== p)) return send(res, 409, { error: 'Someone already leads that party.' });
      p.party = party; p.ready = false; l.rev++; persist(l);
      return send(res, 200, { ok: true, text: `You lead the ${PARTY_BY_ID[party].short}.` });
    }
    case 'ready': {
      if (!p.party) return send(res, 400, { error: 'Pick a party first.' });
      p.ready = !!b.ready; l.rev++; persist(l);
      return send(res, 200, { ok: true, text: p.ready ? 'Ready.' : 'Not ready.' });
    }
    case 'start': {
      if (!p.host) return send(res, 403, { error: 'Only the host can start.' });
      if (l.status !== 'lobby') return send(res, 409, { error: 'Already started.' });
      if (!l.players.every((x) => x.ready && x.party)) return send(res, 409, { error: 'Everyone must pick a party and be ready.' });
      startGame(l); persist(l);
      return send(res, 200, { ok: true, text: 'The campaign begins.' });
    }
    case 'command': {
      if (!l.game || !p.party) return send(res, 409, { error: 'No game running.' });
      const nonce = String(b.nonce ?? '');
      if (!nonce || l.nonces.includes(nonce)) return send(res, 409, { error: 'Duplicate request ignored.' });
      l.nonces.push(nonce); if (l.nonces.length > 500) l.nonces.splice(0, 100);
      if (p.submitted && (b.cmd as Command)?.type !== 'mark_read' && (b.cmd as Command)?.type !== 'mark_all_read') return send(res, 409, { error: 'You have submitted this week. Wait for the others.' });
      const cmd = b.cmd as Command;
      if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return send(res, 400, { error: 'Bad command.' });
      if (cmd.type === 'queue_action' && cmd.action && (l.game.queued[p.party] ?? []).some((a) => a.id === cmd.action.id)) return send(res, 409, { error: 'Duplicate action.' });
      // the engine ignores any party named inside the command and uses the authenticated one
      const r = applyCommand(l.game, p.party, cmd);
      if (r.ok) { l.rev++; persist(l); }
      return send(res, r.ok ? 200 : 400, r.ok ? r : { error: r.text });
    }
    case 'submit': {
      if (!l.game || l.game.phase !== 'campaign') return send(res, 409, { error: 'Nothing to submit right now.' });
      if (p.submitted) return send(res, 409, { error: 'Already submitted.' });
      p.submitted = true; l.rev++;
      const waiting = l.players.filter((x) => x.party && !x.submitted);
      if (!waiting.length) resolveTurn(l);
      persist(l);
      return send(res, 200, { ok: true, text: waiting.length ? `Submitted. Waiting for ${waiting.map((x) => x.name).join(', ')}.` : 'Everyone is in. The week has been resolved.' });
    }
    case 'force': {
      if (!p.host) return send(res, 403, { error: 'Only the host can force the turn.' });
      if (!l.deadline || Date.now() < l.deadline - l.turnSeconds * 500) return send(res, 409, { error: 'Give players at least half the turn time first.' });
      resolveTurn(l); persist(l);
      return send(res, 200, { ok: true, text: 'Turn forced.' });
    }
    case 'count': {
      if (!p.host) return send(res, 403, { error: 'Only the host can declare the results.' });
      if (!l.game || l.game.phase !== 'counting') return send(res, 409, { error: 'Nothing to count.' });
      l.game = completeCounting(l.game); l.rev++; persist(l);
      return send(res, 200, { ok: true, text: 'All results declared.' });
    }
    case 'formation': {
      if (!p.host) return send(res, 403, { error: 'Only the host can close a negotiating round.' });
      if (!l.game || l.game.phase !== 'formation') return send(res, 409, { error: 'No negotiations under way.' });
      const notes = advanceFormation(l.game, makeRng(randomBytes(4).readUInt32LE(0)));
      if (l.game.phase !== 'formation') { l.status = 'finished'; }
      for (const n of notes) l.chat.push({ from: 'Server', text: n, at: Date.now() });
      l.rev++; persist(l);
      return send(res, 200, { ok: true, text: notes.join(' ') || 'Round closed.' });
    }
    case 'chat': {
      const text = clean(b.text, 300);
      if (!text) return send(res, 400, { error: 'Empty message.' });
      const to = b.to ? String(b.to) : undefined;
      l.chat.push({ from: p.name, text, at: Date.now(), to }); if (l.chat.length > 300) l.chat.splice(0, 50);
      l.rev++; persist(l);
      return send(res, 200, { ok: true, text: '' });
    }
  }
  return send(res, 404, { error: 'Unknown action.' });
}

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end('Build the client first: npm run build'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

export const server = createServer((req, res) => {
  if (!req.url?.startsWith('/api/')) return serveStatic(req, res);
  route(req, res).catch((e: Error & { status?: number }) => { if (!res.headersSent) send(res, e.status ?? 400, { error: e.message || 'Server error.' }); });
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, () => console.log(`Lok Sabha Manager server on http://localhost:${PORT} (${lobbies.size} saved lobbies loaded)`));
}
