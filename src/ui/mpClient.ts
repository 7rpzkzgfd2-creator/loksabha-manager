// Thin client for the multiplayer server. The server owns the game; this only sends
// intentions (commands, turn submission) and fetches our filtered view.
import type { Command, CommandResult, GameState } from '../engine/index.ts';

export interface Session { lobbyId: string; playerId: string; token: string; name: string; party?: string }

export interface LobbyPlayer { id: string; name: string; party: string | null; ready: boolean; connected: boolean; submitted: boolean; host: boolean }
export interface LobbyView {
  id: string; name: string; scenarioId: string; difficulty: string; campaignTurns: number; status: 'lobby' | 'running' | 'finished';
  players: LobbyPlayer[]; deadline: number | null; turnSeconds: number; chat: { from: string; text: string; at: number; to?: string }[];
  error?: string;
}

const KEY = 'lsm.mp.session';

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `Server error ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

export const listLobbies = () => call<{ lobbies: { id: string; name: string; players: number; status: string; scenarioId: string }[] }>('/api/lobbies');
export const createLobby = (o: { name: string; lobbyName: string; scenarioId: string; difficulty: string; campaignTurns: number; turnSeconds: number }) => call<Session>('/api/lobbies', o);
export const joinLobby = (id: string, name: string) => call<Session>(`/api/lobbies/${id}/join`, { name });
export const claimParty = (s: Session, party: string) => call<CommandResult>(`/api/lobbies/${s.lobbyId}/claim`, { token: s.token, party });
export const setReady = (s: Session, ready: boolean) => call<CommandResult>(`/api/lobbies/${s.lobbyId}/ready`, { token: s.token, ready });
export const startGame = (s: Session) => call<CommandResult>(`/api/lobbies/${s.lobbyId}/start`, { token: s.token });
export const fetchState = (s: Session) => call<{ lobby: LobbyView; game: GameState | null; rev: number; you: { party: string | null } }>(`/api/lobbies/${s.lobbyId}/state?token=${encodeURIComponent(s.token)}`);
export const command = (s: Session, cmd: Command) => call<CommandResult>(`/api/lobbies/${s.lobbyId}/command`, { token: s.token, cmd, nonce: crypto.randomUUID() });
export const submit = (s: Session) => call<CommandResult>(`/api/lobbies/${s.lobbyId}/submit`, { token: s.token });
export const hostAction = (s: Session, action: 'force' | 'count' | 'formation') => call<CommandResult>(`/api/lobbies/${s.lobbyId}/${action}`, { token: s.token });
export const chat = (s: Session, text: string, to?: string) => call<CommandResult>(`/api/lobbies/${s.lobbyId}/chat`, { token: s.token, text, to });

export function storeSession(s: Session) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export function clearSession() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
export function restoreSession(): Session | null { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
