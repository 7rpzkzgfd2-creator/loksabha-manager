import { useState } from 'react';
import { MAJORITY, OUTLETS } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { LineChart, PageHead, Panel, PartyChip, Prov, Seg } from '../components.tsx';

export function Media() {
  const g = useGame();
  const { me } = useStore();
  const [f, setF] = useState<'all' | 'me' | string>('all');
  const items = g.news.filter((n) => f === 'all' || (f === 'me' ? n.parties.includes(me) : n.outlet === f));
  const mine = g.news.filter((n) => n.parties[0] === me).slice(0, 20);
  const tone = mine.length ? mine.reduce((a, n) => a + n.tone, 0) / mine.length : 0;
  return (
    <>
      <PageHead title="Media" sub="Every story comes from something that happened in the game. Outlets lean: the grey line is the record, the italic line is the outlet's spin.">
        <select className="select" style={{ maxWidth: 220 }} value={f} onChange={(e) => setF(e.target.value)}><option value="all">All outlets</option><option value="me">About us</option>{OUTLETS.map((o) => <option key={o.id} value={o.name}>{o.name} ({o.lean})</option>)}</select>
      </PageHead>
      <div className="grid g-main">
        <Panel className="flush">
          <div style={{ maxHeight: 'calc(100vh - 210px)', overflow: 'auto' }}>
            {items.map((n) => (
              <article key={n.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <div className="row tiny"><span className="upper" style={{ color: 'var(--ink2)' }}>{n.outlet}</span><span className="dim">week {n.turn}</span><span className="right row">{n.parties.slice(0, 2).map((p) => <PartyChip key={p} g={g} id={p} />)}</span></div>
                <h3 className="display" style={{ margin: '6px 0 4px', fontSize: 17 }}>{n.headline}</h3>
                <div className="small dim">Record: {n.fact}</div>
                <div className="small" style={{ fontStyle: 'italic', color: n.tone > 0.1 ? 'var(--good)' : n.tone < -0.1 ? '#ff9aa6' : 'var(--ink2)' }}>{n.spin}</div>
              </article>
            ))}
            {!items.length && <div className="empty" style={{ margin: 16 }}>No stories yet.</div>}
          </div>
        </Panel>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="How we're covered">
            <div className="mono" style={{ fontSize: 28, color: tone > 0.05 ? 'var(--good)' : tone < -0.05 ? 'var(--bad)' : 'var(--ink)' }}>{tone > 0.05 ? 'Favourable' : tone < -0.05 ? 'Hostile' : 'Mixed'}</div>
            <div className="small muted">Average tone of the last {mine.length} stories about us. Attention is not the same as approval: a viral moment can raise visibility while costing trust.</div>
          </Panel>
          <Panel title="Outlets">
            {OUTLETS.map((o) => <div key={o.id} className="row small" style={{ padding: '4px 0' }}><span className="grow">{o.name}</span><span className="dim">{o.lean}{o.region ? ` · ${o.region}` : ''}</span></div>)}
            <div className="tiny dim" style={{ marginTop: 6 }}>Outlets are fictional.</div>
          </Panel>
        </div>
      </div>
    </>
  );
}

export function Polling() {
  const g = useGame();
  const { me } = useStore();
  const [mode, setMode] = useState<'seats' | 'votes' | 'blocs'>('seats');
  const top = Object.entries(g.polls[g.polls.length - 1].seats).filter(([p]) => p !== 'OTH').sort((a, b) => b[1][1] - a[1][1]).slice(0, 6).map(([p]) => p);
  if (!top.includes(me)) top.push(me);
  const series: { name: string; color: string; values: number[]; lo?: number[]; hi?: number[] }[] = mode === 'blocs'
    ? g.alliances.map((a) => ({ name: a.id, color: g.parties[a.leader].color, values: g.polls.map((pt) => pt.bloc[a.id] ?? 0) }))
    : top.map((p) => ({
      name: g.parties[p].short, color: g.parties[p].color,
      values: g.polls.map((pt) => (mode === 'seats' ? pt.seats[p]?.[1] ?? 0 : (pt.shares[p] ?? 0) * 100)),
      lo: mode === 'seats' ? g.polls.map((pt) => pt.seats[p]?.[0] ?? 0) : undefined,
      hi: mode === 'seats' ? g.polls.map((pt) => pt.seats[p]?.[2] ?? 0) : undefined,
    }));
  const last = g.polls[g.polls.length - 1], prev = g.polls[g.polls.length - 2];
  return (
    <>
      <PageHead title="Polling" sub="In-game polls built on the simulation, with a hidden systematic error you can shrink with research and a data analyst. These are not real-world polls."><Prov p="simulated" /></PageHead>
      <Panel title="Trend" extra={<Seg value={mode} onChange={setMode} options={[{ v: 'seats', label: 'Seats' }, { v: 'votes', label: 'Vote %' }, { v: 'blocs', label: 'Blocs' }]} />}>
        <LineChart series={series} height={260} band={mode === 'seats'} yFmt={(v) => (mode === 'votes' ? `${v.toFixed(0)}%` : String(Math.round(v)))} refLine={mode !== 'votes' ? { v: MAJORITY, label: '272' } : undefined} yMax={mode === 'votes' ? undefined : Math.max(300, ...series.flatMap((s) => s.hi ?? s.values)) * 1.05} />
        {mode === 'seats' && <div className="tiny dim">Shaded bands are 80% ranges. The range narrows as polling day approaches.</div>}
      </Panel>
      <div className="grid g3" style={{ marginTop: 14 }}>
        {top.map((p) => {
          const d = prev ? last.seats[p][1] - prev.seats[p][1] : 0;
          return (
            <Panel key={p}>
              <div className="row"><PartyChip g={g} id={p} full /><span className={`right mono ${d > 0 ? 'good' : d < 0 ? 'bad' : 'dim'}`}>{d > 0 ? '+' : ''}{d}</span></div>
              <div className="row" style={{ marginTop: 8, alignItems: 'baseline' }}><span className="mono" style={{ fontSize: 26 }}>{last.seats[p][1]}</span><span className="dim small">seats ({last.seats[p][0]}–{last.seats[p][2]})</span><span className="mono right">{((last.shares[p] ?? 0) * 100).toFixed(1)}%</span></div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

export function Events() {
  const g = useGame();
  const { me, run } = useStore();
  const [tab, setTab] = useState<'open' | 'past' | 'memory' | 'delayed'>('open');
  const open = g.events.filter((e) => e.party === me && !e.resolved);
  const past = g.events.filter((e) => e.party === me && e.resolved).slice().reverse();
  const mem = g.memory.filter((m) => m.party === me || m.other === me).slice().reverse();
  const delayed = g.delayed.filter((d) => d.party === me);
  return (
    <>
      <PageHead title="Events & memory" sub="Developments that need a decision, what you decided, and what the political world remembers about you.">
        <Seg value={tab} onChange={setTab} options={[{ v: 'open', label: `Decisions (${open.length})` }, { v: 'past', label: 'History' }, { v: 'memory', label: 'Political memory' }, { v: 'delayed', label: `Coming up (${delayed.length})` }]} />
      </PageHead>
      {tab === 'open' && (
        <div className="col" style={{ gap: 14 }}>
          {!open.length && <div className="empty">No decisions waiting.</div>}
          {open.map((e) => (
            <Panel key={e.id} title={e.title} extra={<span className={`chip ${e.severity > 0.45 ? 'bad' : 'warn'}`}>{e.severity > 0.45 ? 'Serious' : 'Moderate'}</span>} className="glow">
              <p className="muted" style={{ marginTop: 0 }}>{e.body}</p>
              <div className="grid g2">
                {e.options.map((o) => (
                  <button key={o.id} className="opt" onClick={() => run({ type: 'respond_event', eventId: e.id, option: o.id })}>
                    <b>{o.label}{o.cost ? <span className="dim"> · ₹{o.cost} cr</span> : null}</b><span className="small muted">{o.detail}</span><span className="risk">Risk: {o.risk}</span>
                  </button>
                ))}
              </div>
              <div className="tiny dim" style={{ marginTop: 8 }}>No answer by Continue means the passive option applies.</div>
            </Panel>
          ))}
        </div>
      )}
      {tab === 'past' && (
        <Panel className="flush">{past.map((e) => <div key={e.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}><div className="row"><b className="small">{e.title}</b><span className="dim tiny right">week {e.turn}</span></div><div className="small">Chose: <b>{e.options.find((o) => o.id === e.resolved)?.label}</b></div><div className="small muted">{e.outcome}</div></div>)}{!past.length && <div className="empty" style={{ margin: 14 }}>Nothing yet.</div>}</Panel>
      )}
      {tab === 'memory' && (
        <Panel className="flush">{mem.map((m) => <div key={m.id} className="row small" style={{ padding: '9px 16px', borderBottom: '1px solid var(--line)' }}><span className="mono dim" style={{ width: 70 }}>C{m.cycle} W{m.turn}</span><span className="chip">{m.kind.replace('_', ' ')}</span><span className="grow">{m.text}</span>{m.party !== me && <PartyChip g={g} id={m.party} />}</div>)}{!mem.length && <div className="empty" style={{ margin: 14 }}>Nothing remembered yet.</div>}</Panel>
      )}
      {tab === 'delayed' && (
        <Panel>{delayed.map((d) => <div key={d.id} className="row small" style={{ padding: '6px 0' }}><span className="mono dim">Week {d.dueTurn}</span><span>{d.note}</span></div>)}{!delayed.length && <div className="empty">Nothing pending that we know of. Not every consequence announces itself.</div>}</Panel>
      )}
    </>
  );
}
