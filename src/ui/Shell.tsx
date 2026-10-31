import { lazy, Suspense, useEffect, useState } from 'react';
import { limits, usage, MAJORITY } from '../engine/index.ts';
import { useStore } from './store.tsx';
import type { Screen } from './store.tsx';
import { Confirm, campaignDate, fmtCr, Symbol } from './components.tsx';
import SeatDetail from './screens/SeatDetail.tsx';
import Tutorial from './Tutorial.tsx';
import Home from './screens/Home.tsx';
import Inbox from './screens/Inbox.tsx';
import WarRoom from './screens/WarRoom.tsx';
import National from './screens/National.tsx';
import Seats from './screens/Seats.tsx';
import { PartyScreen, Candidates, Staff, Finances } from './screens/PartyScreens.tsx';
import { Campaign, Backroom } from './screens/Campaign.tsx';
import { StatesHQ, StateDetail } from './screens/States.tsx';
import { Manifesto, Alliances } from './screens/Platform.tsx';
import { Media, Polling, Events } from './screens/World.tsx';
import Results from './screens/Results.tsx';
import { Formation, Governance, Career } from './screens/Government.tsx';
import Settings from './screens/Settings.tsx';

const MapScreen = lazy(() => import('./screens/MapScreen.tsx'));

interface NavItem { s: Screen; label: string; ico: string; show?: boolean; count?: number; soft?: boolean }

export default function Shell() {
  const { game: g, me, screen, go, seat, advance, busy, toasts, mpInfo, mpLobby } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmGo, setConfirmGo] = useState(false);
  const p = g!.parties[me];

  useEffect(() => { document.documentElement.style.setProperty('--accent', p.color); }, [p.color]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      if (e.key === ' ' && e.shiftKey) { e.preventDefault(); onContinue(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const game = g!;
  const unread = game.inbox.filter((m) => m.party === me && !m.read).length;
  const pending = game.events.filter((e) => e.party === me && !e.resolved).length;
  const queued = game.queued[me] ?? [];
  const u = usage(game, me, queued);
  const lim = limits(game, me);
  const last = game.polls[game.polls.length - 1];
  const proj = last?.seats[me];
  const post = game.results.length > 0;

  const groups: { title: string; items: NavItem[] }[] = [
    { title: 'Overview', items: [
      { s: 'home', label: 'Home', ico: '⌂' },
      { s: 'inbox', label: 'Inbox', ico: '✉', count: unread },
      { s: 'warroom', label: 'War room', ico: '◎' },
    ] },
    { title: 'Electorate', items: [
      { s: 'national', label: 'National overview', ico: '▦' },
      { s: 'map', label: 'Map', ico: '◈' },
      { s: 'seats', label: 'Constituencies', ico: '☰' },
      { s: 'polling', label: 'Polling', ico: '∿' },
    ] },
    { title: 'Campaign', items: [
      { s: 'states', label: 'State campaign HQ', ico: '▣' },
      { s: 'campaign', label: 'Weekly plan & extras', ico: '▶', count: queued.length, soft: true },
      { s: 'manifesto', label: 'Manifesto', ico: '❡' },
      { s: 'alliances', label: 'Alliances', ico: '⚭' },
      { s: 'backroom', label: 'Backroom', ico: '◐' },
    ] },
    { title: 'Organisation', items: [
      { s: 'party', label: 'Party', ico: '♜' },
      { s: 'candidates', label: 'Candidates', ico: '☺' },
      { s: 'staff', label: 'Staff', ico: '✦' },
      { s: 'finances', label: 'Finances', ico: '₹' },
    ] },
    { title: 'World', items: [
      { s: 'media', label: 'Media', ico: '❝' },
      { s: 'events', label: 'Events & memory', ico: '⚑', count: pending },
    ] },
    { title: 'Results & power', items: [
      { s: 'results', label: game.phase === 'counting' ? 'Election night' : 'Election results', ico: '★', show: post || game.phase === 'counting' },
      { s: 'formation', label: 'Government formation', ico: '⚖', show: game.phase === 'formation' },
      { s: 'governance', label: 'Government', ico: '⛬', show: game.phase === 'governance' },
      { s: 'career', label: 'Career history', ico: '⌛' },
      { s: 'settings', label: 'Settings & saves', ico: '⚙' },
    ] },
  ];

  const titles: Record<Screen, string> = {
    home: 'Home', inbox: 'Inbox', warroom: 'War room', national: 'National overview', map: 'Map', seats: 'Constituencies', party: 'Party', candidates: 'Candidates', staff: 'Staff',
    campaign: 'Campaign planner', backroom: 'Backroom', manifesto: 'Manifesto', alliances: 'Alliances', media: 'Media', polling: 'Polling', finances: 'Finances', events: 'Events & memory',
    states: 'State campaign HQ', state: 'State campaign', results: 'Results', formation: 'Government formation', governance: 'Government', career: 'Career history', settings: 'Settings',
  };

  const me_ = mpLobby?.players.find((x) => x.id === mpInfo?.playerId);
  function onContinue() {
    if (game.phase === 'counting') { go('results'); return; }
    if (game.phase === 'formation') { go('formation'); return; }
    if (game.phase === 'governance') { go('governance'); return; }
    if (game.phase !== 'campaign') { go('career'); return; }
    if (pending > 0 && !confirmGo) { setConfirmGo(true); return; }
    setConfirmGo(false);
    advance();
  }
  const continueLabel = game.phase === 'campaign'
    ? (mpInfo ? (me_?.submitted ? 'Waiting for others…' : 'Submit turn') : game.campaignTurn === game.config.campaignTurns ? 'Go to polling day' : 'Continue')
    : game.phase === 'counting' ? 'Election night' : game.phase === 'formation' ? 'Negotiate' : game.phase === 'governance' ? 'Govern' : 'Career';

  return (
    <div className="shell">
      <aside className={`side ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><span className="logo">LS</span><b>Lok Sabha Manager</b></div>
        <nav className="nav" onClick={() => setMenuOpen(false)}>
          {groups.map((grp) => (
            <div key={grp.title}>
              <div className="grp upper">{grp.title}</div>
              {grp.items.filter((i) => i.show !== false).map((i) => (
                <a key={i.s} className={screen === i.s || (screen === 'state' && i.s === 'states') ? 'on' : ''} onClick={() => go(i.s)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(i.s)}>
                  <span className="ico">{i.ico}</span>{i.label}{!!i.count && <span className={`cnt ${i.soft ? 'soft' : ''}`}>{i.count}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid var(--line)' }} className="row">
          <Symbol p={p} size={30} />
          <div className="grow"><div className="small ellipsis"><b>{p.short}</b> · {p.leader}</div><div className="tiny dim">{mpInfo ? `Multiplayer · ${mpLobby?.name ?? ''}` : `${game.config.mode} · ${game.config.difficulty}`}</div></div>
        </div>
      </aside>
      <header className="top">
        <button className="btn ghost sm menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">☰</button>
        <div className="crumb">
          <span className="upper">{game.phase === 'campaign' ? `${game.stage === 'preparation' ? 'Preparation' : game.stage === 'final_push' ? 'Final push' : 'Campaign'} · week ${game.campaignTurn} of ${game.config.campaignTurns}` : game.phase}</span>
          <b className="ellipsis">{titles[screen]}</b>
        </div>
        <div className="meta">
          {game.phase === 'campaign' && <div className="kv hide-sm"><span>Date</span><span>{campaignDate(game)}</span></div>}
          <div className="kv"><span>Funds</span><span style={{ color: p.stats.funds - u.funds < 0 ? 'var(--bad)' : undefined }}>{fmtCr(p.stats.funds - u.funds)}</span></div>
          {game.phase === 'campaign' && <div className="kv hide-sm"><span>Leader days</span><span>{lim.leaderDays - u.leaderDays}/{lim.leaderDays}</span></div>}
          {game.phase === 'campaign' && <div className="kv hide-sm"><span>Team</span><span>{lim.team - u.team}/{lim.team}</span></div>}
          {proj && game.phase === 'campaign' && <div className="kv"><span>Projection</span><span style={{ color: proj[1] >= MAJORITY ? 'var(--good)' : undefined }}>{proj[1]}</span></div>}
          <button className="btn continue" onClick={onContinue} disabled={busy || (!!mpInfo && !!me_?.submitted && game.phase === 'campaign')} title="Shift+Space">
            {busy ? 'Processing…' : continueLabel} <span aria-hidden>›</span>
          </button>
        </div>
      </header>
      <main className="main" key={screen}>
        <div className="fade-in">
          {screen === 'home' && <Home />}
          {screen === 'inbox' && <Inbox />}
          {screen === 'warroom' && <WarRoom />}
          {screen === 'national' && <National />}
          {screen === 'map' && <Suspense fallback={<div className="empty">Loading map…</div>}><MapScreen /></Suspense>}
          {screen === 'seats' && <Seats />}
          {screen === 'party' && <PartyScreen />}
          {screen === 'candidates' && <Candidates />}
          {screen === 'staff' && <Staff />}
          {screen === 'finances' && <Finances />}
          {screen === 'campaign' && <Campaign />}
          {screen === 'states' && <StatesHQ />}
          {screen === 'state' && <StateDetail />}
          {screen === 'backroom' && <Backroom />}
          {screen === 'manifesto' && <Manifesto />}
          {screen === 'alliances' && <Alliances />}
          {screen === 'media' && <Media />}
          {screen === 'polling' && <Polling />}
          {screen === 'events' && <Events />}
          {screen === 'results' && <Results />}
          {screen === 'formation' && <Formation />}
          {screen === 'governance' && <Governance />}
          {screen === 'career' && <Career />}
          {screen === 'settings' && <Settings />}
        </div>
      </main>
      {seat && <SeatDetail id={seat} />}
      {confirmGo && <Confirm text={`You have ${pending} decision${pending > 1 ? 's' : ''} waiting. If you continue, the passive default ("wait" or "ignore") will apply.`} yes="Continue anyway" onYes={() => { setConfirmGo(false); advance(); }} onNo={() => { setConfirmGo(false); go('events'); }} />}
      <Tutorial />
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.bad ? 'bad' : ''}`}>{t.text}</div>)}</div>
    </div>
  );
}
