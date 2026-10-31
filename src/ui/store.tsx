import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  advanceTurn, applyCommand, beginNextCycle, clone, completeCounting, createGame, stepCounting,
  advanceFormation, governanceYear,
} from '../engine/index.ts';
import type { CampaignAction, Command, CommandResult, GameState, GovAction, ScenarioConfig } from '../engine/index.ts';
import { makeRng } from '../engine/rng.ts';
import { saveGame } from './persist.ts';
import { migrateState } from '../engine/traits.ts';
import { STATE_BY_CODE } from '../engine/setup.ts';
import * as mp from './mpClient.ts';

export type Screen =
  | 'home' | 'inbox' | 'warroom' | 'national' | 'map' | 'seats' | 'party' | 'candidates' | 'staff'
  | 'campaign' | 'backroom' | 'manifesto' | 'alliances' | 'media' | 'polling' | 'finances' | 'events'
  | 'results' | 'formation' | 'governance' | 'career' | 'settings' | 'states' | 'state';

interface Toast { id: number; text: string; bad?: boolean }

interface Store {
  game: GameState | null;
  me: string; // party id this client controls
  screen: Screen;
  go: (s: Screen) => void;
  seat: string | null;
  openSeat: (id: string | null) => void;
  stateSel: string | null;
  openState: (code: string) => void;
  start: (cfg: ScenarioConfig) => void;
  loadState: (g: GameState) => void;
  quit: () => void;
  run: (cmd: Command, quiet?: boolean) => CommandResult;
  queue: (a: Omit<CampaignAction, 'party'>) => CommandResult;
  advance: () => void;
  countStep: (n?: number) => void;
  countAll: () => void;
  formationRound: () => void;
  govYear: (choices: GovAction[]) => string[];
  nextCycle: () => void;
  toast: (text: string, bad?: boolean) => void;
  toasts: Toast[];
  busy: boolean;
  mpInfo: mp.Session | null;
  setMp: (s: mp.Session | null) => void;
  mpLobby: mp.LobbyView | null;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;
export const useGame = () => useContext(Ctx)!.game!;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameState | null>(null);
  const [stateSel, setStateSel] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [seat, setSeat] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const [mpInfo, setMpInfo] = useState<mp.Session | null>(() => mp.restoreSession());
  const [mpLobby, setMpLobby] = useState<mp.LobbyView | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  const toast = useCallback((text: string, bad?: boolean) => {
    if (!text) return;
    const id = Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // multiplayer: poll the authoritative server for our filtered view
  useEffect(() => {
    if (!mpInfo) return;
    let alive = true;
    let rev = -1;
    const tick = async () => {
      try {
        const v = await mp.fetchState(mpInfo);
        if (!alive) return;
        setMpLobby(v.lobby);
        if (v.you.party && v.you.party !== mpInfo.party) { const s = { ...mpInfo, party: v.you.party }; mp.storeSession(s); setMpInfo(s); }
        if (v.game && v.rev !== rev) { rev = v.rev; setGame(v.game); }
      } catch (e) {
        if (alive) setMpLobby((l) => (l ? { ...l, error: String((e as Error).message) } : l));
      }
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [mpInfo]);

  const me = mpInfo?.party ?? game?.playerParty ?? '';

  const commit = useCallback((g: GameState) => {
    setGame(g);
    if (!mpInfo) saveGame('autosave', g).catch(() => {});
  }, [mpInfo]);

  const run = useCallback((cmd: Command, quiet = false): CommandResult => {
    const g = gameRef.current;
    if (!g) return { ok: false, text: 'No game.' };
    if (mpInfo) {
      mp.command(mpInfo, cmd).then((r) => { if (!quiet || !r.ok) toast(r.text, !r.ok); }).catch((e) => toast(String(e.message), true));
      return { ok: true, text: 'Sent to server.' };
    }
    const next = clone(g);
    const r = applyCommand(next, next.playerParty, cmd);
    if (r.ok) { gameRef.current = next; setGame(next); }
    if (!quiet || !r.ok) toast(r.text, !r.ok);
    return r;
  }, [mpInfo, toast]);

  const store: Store = useMemo(() => ({
    game, me, screen, seat, toasts, busy, mpInfo, mpLobby, stateSel,
    openState: (code) => { setStateSel(code); setScreen('state'); setSeat(null); document.querySelector('.main')?.scrollTo({ top: 0 }); },
    go: (s) => { setScreen(s); setSeat(null); document.querySelector('.main')?.scrollTo({ top: 0 }); },
    openSeat: setSeat,
    toast,
    start: (cfg) => { setBusy(true); setTimeout(() => { const g = createGame(cfg); commit(g); setScreen('home'); setBusy(false); }, 30); },
    loadState: (g) => { migrateState(g, STATE_BY_CODE); setGame(g); setScreen(g.phase === 'counting' ? 'results' : g.phase === 'formation' ? 'formation' : g.phase === 'governance' ? 'governance' : 'home'); },
    quit: () => { setGame(null); setMpInfo(null); setMpLobby(null); mp.clearSession(); setScreen('home'); },
    run,
    queue: (a) => run({ type: 'queue_action', action: { ...a, party: me } as CampaignAction }),
    advance: () => {
      const g = gameRef.current;
      if (!g || busy) return;
      if (mpInfo) { mp.submit(mpInfo).then((r) => toast(r.text, !r.ok)).catch((e) => toast(e.message, true)); return; }
      setBusy(true);
      setTimeout(() => {
        const next = advanceTurn(g, {});
        commit(next);
        setBusy(false);
        if (next.phase === 'counting') setScreen('results');
      }, 20);
    },
    countStep: (n = 1) => { const g = gameRef.current; if (g && !mpInfo) setGame(stepCounting(g, n)); },
    countAll: () => {
      const g = gameRef.current; if (!g) return;
      if (mpInfo) { mp.hostAction(mpInfo, 'count').then((r) => toast(r.text, !r.ok)); return; }
      commit(completeCounting(g));
    },
    formationRound: () => {
      const g = gameRef.current; if (!g) return;
      if (mpInfo) { mp.hostAction(mpInfo, 'formation').then((r) => toast(r.text, !r.ok)); return; }
      const next = clone(g);
      const notes = advanceFormation(next, makeRng(next.rng ^ 0x5bd1e995));
      commit(next);
      notes.forEach((n) => toast(n));
      if (next.phase !== 'formation') setScreen(next.phase === 'governance' ? 'governance' : 'career');
    },
    govYear: (choices) => {
      const g = gameRef.current; if (!g) return [];
      const next = clone(g);
      const notes = governanceYear(next, next.playerParty, choices, makeRng(next.rng ^ (next.turn * 2654435761)));
      next.rng = (next.rng * 1103515245 + 12345) >>> 0;
      commit(next);
      return notes;
    },
    nextCycle: () => { const g = gameRef.current; if (g) { commit(beginNextCycle(g)); setScreen('home'); } },
    setMp: (s) => { setMpInfo(s); if (s) mp.storeSession(s); else mp.clearSession(); },
  }), [game, me, screen, seat, toasts, busy, mpInfo, mpLobby, run, toast, commit, stateSel]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
