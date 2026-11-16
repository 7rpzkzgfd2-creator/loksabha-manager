import { useMemo, useState } from 'react';
import { STATES_LIST, STATE_BY_CODE, seatShares } from '../../engine/index.ts';
import type { Constituency } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { PageHead, Panel, PartyChip, Table } from '../components.tsx';

const pct = (x: number) => (x * 100).toFixed(1);

function Delta({ d }: { d: number | null }) {
  if (d === null) return <span className="dim">—</span>;
  const v = d * 100;
  if (Math.abs(v) < 0.05) return <span className="dim">0.0</span>;
  return <span style={{ color: v > 0 ? 'var(--good)' : 'var(--bad)' }}>{v > 0 ? '▲ +' : '▼ −'}{Math.abs(v).toFixed(1)}</span>;
}

export default function Tracker() {
  const g = useGame();
  const { me, openSeat } = useStore();
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [show, setShow] = useState<'all' | 'leading' | 'close' | 'behind'>('all');
  const [pick, setPick] = useState<string>('');
  const now = useMemo(() => seatShares(g), [g]);
  const prev = g.prevShares;

  const data = useMemo(() => g.seats.filter((c) => !!c.candidates[me]).map((c) => {
    const sh = now[c.id] ?? {};
    const ranked = Object.entries(sh).filter(([p]) => !!c.candidates[p]).sort((a, b) => b[1] - a[1]);
    const mine = sh[me] ?? 0;
    const rank = ranked.findIndex(([p]) => p === me) + 1;
    const first = ranked[0], second = ranked[1];
    const rival = rank === 1 ? second : first; // the one to beat or the one chasing
    const gap = mine - (rival?.[1] ?? 0);
    const before = prev?.[c.id]?.[me];
    return { c, mine, rank, first, second, gap, delta: before === undefined ? null : mine - before };
  }), [g, now, prev, me]);

  const rows = data.filter((r) => (!q || r.c.name.toLowerCase().includes(q.toLowerCase())) && (!st || r.c.state === st)
    && (show === 'all' || (show === 'leading' ? r.rank === 1 : show === 'behind' ? r.rank > 1 && r.gap < -0.05 : Math.abs(r.gap) <= 0.05)));

  const lead = data.filter((r) => r.rank === 1).length;
  const close = data.filter((r) => Math.abs(r.gap) <= 0.05).length;
  const avg = data.length ? data.reduce((t, r) => t + r.mine, 0) / data.length : 0;
  const moved = data.filter((r) => r.delta !== null);
  const avgD = moved.length ? moved.reduce((t, r) => t + (r.delta ?? 0), 0) / moved.length : null;

  const cand = (c: Constituency, pid?: string) => pid ? c.candidates[pid]?.name ?? '' : '';
  const Top = ({ c, e }: { c: Constituency; e?: [string, number] }) => !e ? <span className="dim">—</span> : (
    <span className="col" style={{ gap: 2 }}>
      <span className="row" style={{ gap: 6 }}><PartyChip g={g} id={e[0]} /><b className="mono">{pct(e[1])}%</b></span>
      <span className="tiny dim ellipsis" style={{ maxWidth: 170 }}>{cand(c, e[0])}</span>
    </span>
  );

  const sel = data.find((r) => r.c.id === pick) ?? data.slice().sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))[0];
  const bars: { pid: string; v: number; tag: string }[] = [];
  if (sel) {
    if (sel.first) bars.push({ pid: sel.first[0], v: sel.first[1], tag: '1st' });
    if (sel.second) bars.push({ pid: sel.second[0], v: sel.second[1], tag: '2nd' });
    if (sel.rank > 2) bars.push({ pid: me, v: sel.mine, tag: `You · ${sel.rank}th` });
  }
  const top = Math.max(0.01, ...bars.map((b) => b.v));

  return (
    <>
      <PageHead title="Vote share tracker" sub="Your estimated vote share in every seat you contest, against the top two candidates. Change is since the start of last week." />
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Panel><div className="upper">Seats contested</div><div className="display" style={{ fontSize: 28 }}>{data.length}</div></Panel>
        <Panel><div className="upper">Leading in</div><div className="display" style={{ fontSize: 28, color: 'var(--good)' }}>{lead}</div></Panel>
        <Panel><div className="upper">Within 5 points</div><div className="display" style={{ fontSize: 28, color: 'var(--warn)' }}>{close}</div></Panel>
        <Panel><div className="upper">Average share</div><div className="display" style={{ fontSize: 28 }}>{pct(avg)}% <span className="small"><Delta d={avgD} /></span></div></Panel>
      </div>
      {sel && (
        <Panel style={{ marginBottom: 14 }}>
          <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <select className="select" style={{ maxWidth: 320 }} value={sel.c.id} onChange={(e) => setPick(e.target.value)} aria-label="Choose constituency">
              {data.slice().sort((a, b) => a.c.name.localeCompare(b.c.name)).map((r) => <option key={r.c.id} value={r.c.id}>{r.c.name} ({STATE_BY_CODE[r.c.state].name})</option>)}
            </select>
            <span className="row small">
              <span className="dim">Gap:</span><b style={{ color: sel.gap >= 0 ? 'var(--good)' : 'var(--bad)' }}>{sel.gap >= 0 ? `${pct(sel.gap)} pts ahead` : `${pct(-sel.gap)} pts behind`}</b>
              <button className="btn sm ghost" onClick={() => openSeat(sel.c.id)}>Open seat ›</button>
            </span>
          </div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 'clamp(18px, 6vw, 64px)', height: 230 }}>
            {bars.map((b) => {
              const p = g.parties[b.pid];
              const isMe = b.pid === me;
              return (
                <div key={b.pid} className="col" style={{ alignItems: 'center', gap: 6, width: 'clamp(70px, 18vw, 130px)', height: '100%', justifyContent: 'flex-end' }}>
                  <b className="mono" style={{ fontSize: 22 }}>{pct(b.v)}%</b>
                  <div style={{ width: '100%', height: `${(b.v / top) * 150}px`, minHeight: 4, background: p?.color ?? '#888', borderRadius: '6px 6px 0 0', outline: isMe ? '2px solid var(--ink)' : undefined, outlineOffset: 2, transition: 'height .5s cubic-bezier(.16,1,.3,1)' }} />
                  <PartyChip g={g} id={b.pid} />
                  <span className="tiny dim ellipsis" style={{ maxWidth: '100%', textAlign: 'center' }}>{b.tag}{isMe && b.tag.length < 4 ? ' · you' : ''} · {cand(sel.c, b.pid)}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
      <Panel style={{ marginBottom: 14 }}>
        <div className="row wrap">
          <input className="input" style={{ maxWidth: 220 }} placeholder="Search seat…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search constituencies" />
          <select className="select" style={{ maxWidth: 200 }} value={st} onChange={(e) => setSt(e.target.value)} aria-label="State"><option value="">All states</option>{STATES_LIST.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
          <select className="select" style={{ maxWidth: 200 }} value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show">
            <option value="all">All my seats</option><option value="leading">Leading</option><option value="close">Close (within 5 pts)</option><option value="behind">Behind by 5+ pts</option>
          </select>
          <span className="small dim">{rows.length} shown</span>
        </div>
      </Panel>
      <Panel className="flush">
        <div style={{ maxHeight: 'calc(100vh - 360px)', minHeight: 300, overflow: 'auto' }}>
          {data.length === 0 ? <div className="empty" style={{ margin: 14 }}>You are not contesting any seats yet. Pick candidates first.</div> : (
            <Table rows={rows} rowKey={(r) => r.c.id} onRow={(r) => { setPick(r.c.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} selected={sel?.c.id} max={300} initialSort={['g', 1]} cols={[
              { key: 'n', label: 'Constituency', render: (r) => <span className="col" style={{ gap: 2 }}><b>{r.c.name}</b><span className="tiny dim">{STATE_BY_CODE[r.c.state].name}</span></span>, sort: (r) => r.c.name },
              { key: 'm', label: 'Your share', num: true, render: (r) => <b className="mono">{pct(r.mine)}%</b>, sort: (r) => r.mine },
              { key: 'd', label: 'Change', num: true, render: (r) => <Delta d={r.delta} />, sort: (r) => r.delta ?? 0 },
              { key: 'k', label: 'Rank', num: true, render: (r) => r.rank === 1 ? <span style={{ color: 'var(--good)' }}>1st</span> : r.rank === 2 ? '2nd' : r.rank === 3 ? '3rd' : `${r.rank}th`, sort: (r) => r.rank },
              { key: 'a', label: '1st place', render: (r) => <Top c={r.c} e={r.first} /> },
              { key: 'b', label: '2nd place', render: (r) => <Top c={r.c} e={r.second} /> },
              { key: 'g', label: 'Gap', num: true, render: (r) => <span className="mono" style={{ color: r.gap >= 0 ? 'var(--good)' : Math.abs(r.gap) <= 0.05 ? 'var(--warn)' : 'var(--bad)' }}>{r.gap >= 0 ? `+${pct(r.gap)} ahead` : `${pct(-r.gap)} behind`}</span>, sort: (r) => Math.abs(r.gap) },
            ]} />
          )}
        </div>
      </Panel>
    </>
  );
}
