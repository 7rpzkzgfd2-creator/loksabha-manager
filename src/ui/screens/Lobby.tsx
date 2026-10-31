import { useEffect, useState } from 'react';
import { PARTY_DEFS, SCENARIOS, SCENARIO_BY_ID } from '../../engine/index.ts';
import { useStore } from '../store.tsx';
import * as mp from '../mpClient.ts';
import { Panel, Seg, Symbol } from '../components.tsx';

export default function Lobby({ onBack }: { onBack: () => void }) {
  const { mpInfo, setMp, mpLobby, toast, quit } = useStore();
  const [name, setName] = useState('');
  const [lobbies, setLobbies] = useState<Awaited<ReturnType<typeof mp.listLobbies>>['lobbies'] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState({ lobbyName: 'Friday night politics', scenarioId: 'ls2029', difficulty: 'normal', campaignTurns: 8, turnSeconds: 300 });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (mpInfo) return;
    const load = () => mp.listLobbies().then((r) => { setLobbies(r.lobbies); setErr(null); }).catch(() => setErr('The multiplayer server is not running. Start it with "npm run server" (see README).'));
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [mpInfo]);

  const wrap = async <T,>(fn: () => Promise<T>) => { try { return await fn(); } catch (e) { toast((e as Error).message, true); return null; } };

  if (!mpInfo) {
    return (
      <div className="wizard"><div className="wizard-in" style={{ maxWidth: 980 }}>
        <button className="btn ghost" onClick={onBack}>← Main menu</button>
        <h1 className="display" style={{ fontSize: 36, margin: '18px 0 6px' }}>Multiplayer</h1>
        <p className="muted">Turn-based. Every player leads a party; the server runs the simulation and checks every action, and the AI plays the parties nobody picks. Each week everyone plans, then submits; the turn resolves when all have submitted or the host forces it after the deadline.</p>
        {err && <div className="panel" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}><b className="bad">No server</b><div className="small muted">{err}</div></div>}
        <div className="field" style={{ maxWidth: 320, marginBottom: 16 }}><label>Your name</label><input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meera" /></div>
        <div className="grid g2">
          <Panel title="Host a lobby">
            <div className="col">
              <div className="field"><label>Lobby name</label><input className="input" value={cfg.lobbyName} maxLength={40} onChange={(e) => setCfg({ ...cfg, lobbyName: e.target.value })} /></div>
              <div className="field"><label>Scenario</label><select className="select" value={cfg.scenarioId} onChange={(e) => setCfg({ ...cfg, scenarioId: e.target.value })}>{SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
              <div className="field"><label>AI difficulty</label><Seg value={cfg.difficulty} onChange={(v) => setCfg({ ...cfg, difficulty: v })} options={[{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }]} /></div>
              <div className="field"><label>Campaign weeks: {cfg.campaignTurns}</label><input type="range" min={6} max={12} value={cfg.campaignTurns} onChange={(e) => setCfg({ ...cfg, campaignTurns: +e.target.value })} /></div>
              <div className="field"><label>Turn deadline: {Math.round(cfg.turnSeconds / 60)} min</label><input type="range" min={60} max={1800} step={60} value={cfg.turnSeconds} onChange={(e) => setCfg({ ...cfg, turnSeconds: +e.target.value })} /></div>
              <button className="btn primary" disabled={!name.trim() || !!err} onClick={async () => { const s = await wrap(() => mp.createLobby({ name: name.trim(), ...cfg })); if (s) setMp(s); }}>Create lobby</button>
            </div>
          </Panel>
          <Panel title="Join a lobby">
            <div className="col">
              {lobbies?.map((l) => (
                <div key={l.id} className="row panel" style={{ padding: 10 }}>
                  <div className="grow"><b className="small">{l.name}</b><div className="tiny dim">{SCENARIO_BY_ID[l.scenarioId]?.title} · {l.players} player{l.players === 1 ? '' : 's'} · {l.status}</div></div>
                  <button className="btn sm" disabled={!name.trim() || l.status !== 'lobby'} onClick={async () => { const s = await wrap(() => mp.joinLobby(l.id, name.trim())); if (s) setMp(s); }}>Join</button>
                </div>
              ))}
              {lobbies && !lobbies.length && <div className="empty">No open lobbies. Host one.</div>}
            </div>
          </Panel>
        </div>
      </div></div>
    );
  }

  const L = mpLobby;
  const me = L?.players.find((p) => p.id === mpInfo.playerId);
  const taken = new Set(L?.players.map((p) => p.party).filter(Boolean));
  const sc = L ? SCENARIO_BY_ID[L.scenarioId] : undefined;
  return (
    <div className="wizard"><div className="wizard-in" style={{ maxWidth: 1100 }}>
      <div className="row"><button className="btn ghost" onClick={() => { quit(); onBack(); }}>← Leave lobby</button><span className="upper right">Lobby {mpInfo.lobbyId}</span></div>
      <h1 className="display" style={{ fontSize: 34, margin: '14px 0 4px' }}>{L?.name ?? 'Connecting…'}</h1>
      <p className="muted">{sc?.title} · AI {L?.difficulty} · {L?.campaignTurns} weeks · share the lobby code <b className="mono">{mpInfo.lobbyId}</b> with friends on the same server.</p>
      {L?.error && <div className="chip bad">Connection problem: {L.error}. Retrying…</div>}
      <div className="grid g-main" style={{ marginTop: 14 }}>
        <Panel title="Pick your party">
          <div className="grid g4" style={{ gap: 8 }}>
            {PARTY_DEFS.filter((p) => p.playable && sc?.parties.includes(p.id)).map((p) => {
              const mine = me?.party === p.id;
              const busy = taken.has(p.id) && !mine;
              return (
                <button key={p.id} className={`party-card ${mine ? 'on' : ''}`} disabled={busy || me?.ready} style={{ ['--pc' as string]: p.color, ['--pc2' as string]: p.color2, opacity: busy ? 0.4 : 1, padding: 10 }} onClick={() => wrap(() => mp.claimParty(mpInfo, p.id))}>
                  <div className="stripe" /><div className="row"><Symbol p={p} size={26} /><b className="small">{p.short}</b></div>
                  {busy && <div className="tiny dim">{L?.players.find((x) => x.party === p.id)?.name}</div>}
                </button>
              );
            })}
          </div>
        </Panel>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Players">
            {L?.players.map((p) => (
              <div key={p.id} className="row small" style={{ padding: '5px 0' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: p.connected ? 'var(--good)' : 'var(--ink3)' }} />
                <b>{p.name}</b>{p.host && <span className="chip">host</span>}
                <span className="grow dim">{p.party ?? 'choosing…'}</span>
                <span className={`chip ${p.ready ? 'good' : ''}`}>{p.ready ? 'Ready' : 'Not ready'}</span>
              </div>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" disabled={!me?.party} onClick={() => wrap(() => mp.setReady(mpInfo, !me?.ready))}>{me?.ready ? 'Not ready' : 'Ready'}</button>
              {me?.host && <button className="btn primary right" disabled={!L?.players.every((p) => p.ready && p.party)} onClick={() => wrap(() => mp.startGame(mpInfo))}>Start game</button>}
            </div>
          </Panel>
          <Panel title="Chat">
            <div className="col small" style={{ maxHeight: 200, overflow: 'auto', gap: 4 }}>{L?.chat.map((c, i) => <div key={i}><b>{c.from}:</b> {c.text}</div>)}</div>
            <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (msg.trim()) { wrap(() => mp.chat(mpInfo, msg.trim())); setMsg(''); } }}><input className="input" value={msg} maxLength={300} onChange={(e) => setMsg(e.target.value)} placeholder="Say something…" /><button className="btn">Send</button></form>
          </Panel>
        </div>
      </div>
    </div></div>
  );
}
