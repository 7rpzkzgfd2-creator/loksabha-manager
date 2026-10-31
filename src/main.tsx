import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import { StoreProvider, useStore } from './ui/store.tsx';
import Title from './ui/screens/Title.tsx';
import type { Mode } from './ui/screens/Title.tsx';
import NewGame from './ui/screens/NewGame.tsx';
import Shell from './ui/Shell.tsx';
import Lobby from './ui/screens/Lobby.tsx';

function App() {
  const { game, mpInfo, mpLobby, toasts } = useStore();
  const [mode, setMode] = useState<Mode | null>(null);
  if (game && (!mpInfo || mpLobby?.status !== 'lobby')) return <Shell />;
  if (mpInfo || mode === 'multiplayer') return <><Lobby onBack={() => setMode(null)} /><Toasts t={toasts} /></>;
  if (mode) return <NewGame mode={mode} onBack={() => setMode(null)} />;
  return <><Title onNew={setMode} /><Toasts t={toasts} /></>;
}

function Toasts({ t }: { t: { id: number; text: string; bad?: boolean }[] }) {
  return <div className="toasts">{t.map((x) => <div key={x.id} className={`toast ${x.bad ? 'bad' : ''}`}>{x.text}</div>)}</div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><StoreProvider><App /></StoreProvider></StrictMode>);
