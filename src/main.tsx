import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import { StoreProvider, useStore } from './ui/store.tsx';
import Title from './ui/screens/Title.tsx';
import type { Mode } from './ui/screens/Title.tsx';
import NewGame from './ui/screens/NewGame.tsx';
import Shell from './ui/Shell.tsx';
import Lobby from './ui/screens/Lobby.tsx';
import Landing from './ui/screens/Landing.tsx';

function App() {
  const { game, mpInfo, mpLobby, toasts } = useStore();
  const [mode, setMode] = useState<Mode | null>(null);
  const [entered, setEntered] = useState(() => { try { return sessionStorage.getItem('ls-entered') === '1'; } catch { return false; } });
  const enter = () => { setEntered(true); try { sessionStorage.setItem('ls-entered', '1'); } catch { /* private mode */ } window.scrollTo(0, 0); };
  if (game && (!mpInfo || mpLobby?.status !== 'lobby')) return <Shell />;
  if (mpInfo || mode === 'multiplayer') return <><Lobby onBack={() => setMode(null)} /><Toasts t={toasts} /></>;
  if (!entered && !mode) return <Landing onPlay={enter} onMulti={() => { enter(); setMode('multiplayer'); }} />;
  if (mode) return <NewGame mode={mode} onBack={() => setMode(null)} />;
  return <><Title onNew={setMode} /><Toasts t={toasts} /></>;
}

function Toasts({ t }: { t: { id: number; text: string; bad?: boolean }[] }) {
  return <div className="toasts">{t.map((x) => <div key={x.id} className={`toast ${x.bad ? 'bad' : ''}`}>{x.text}</div>)}</div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><StoreProvider><App /></StoreProvider></StrictMode>);
