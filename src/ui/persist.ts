// Save games live in IndexedDB (a full game is a few MB, too big for localStorage).
import type { GameState } from '../engine/index.ts';

const DB = 'loksabha-manager';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export interface SaveMeta { slot: string; party: string; partyName: string; year: number; turn: number; phase: string; savedAt: number; mode: string; scenario: string }

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function saveGame(slot: string, g: GameState): Promise<void> {
  const meta: SaveMeta = { slot, party: g.playerParty, partyName: g.parties[g.playerParty].name, year: g.year, turn: g.campaignTurn, phase: g.phase, savedAt: Date.now(), mode: g.config.mode, scenario: g.config.scenarioId };
  await tx('readwrite', (s) => s.put({ meta, game: g }, slot));
}

export async function loadGame(slot: string): Promise<GameState | null> {
  const v = await tx<{ game: GameState } | undefined>('readonly', (s) => s.get(slot));
  return v?.game ?? null;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<{ meta: SaveMeta }[]>('readonly', (s) => s.getAll());
  return all.map((x) => x.meta).sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(slot: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(slot));
}

export function pref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem('lsm.' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function setPref(key: string, v: unknown) {
  try { localStorage.setItem('lsm.' + key, JSON.stringify(v)); } catch { /* private mode */ }
}
