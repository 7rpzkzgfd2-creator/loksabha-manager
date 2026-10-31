import { useMemo, useState } from 'react';
import { STATES_LIST, STATE_BY_CODE, ISSUE_NAME, candidateAppeal } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import type { Constituency } from '../../engine/index.ts';
import { PageHead, PartyChip, Seg, StackBar } from '../components.tsx';
import { ratingFor, RATING_COLOR } from '../derive.ts';
import type { Rating } from '../derive.ts';

interface TileLayer { color: string; height: number; dim?: boolean }

const CELL = 15;
function tilePos(c: Constituency): [number, number] {
  const st = STATES_LIST.find((s) => s.code === c.state)!;
  const [gx, gy, cols] = st.grid;
  return [gx + (c.idx % cols), gy + Math.floor(c.idx / cols)];
}

type LayerId = 'leader' | 'mine' | 'swing' | 'activity' | 'org' | 'candidate' | 'turnout' | 'alliance' | 'result';

const heat = (v: number) => { // 0..1 blue → amber → red
  const a = [40, 80, 160], b = [233, 196, 106], c = [229, 72, 72];
  const [x, y, t] = v < 0.5 ? [a, b, v * 2] : [b, c, (v - 0.5) * 2];
  return `rgb(${x.map((k, i) => Math.round(k + (y[i] - k) * t)).join(',')})`;
};
const diverge = (v: number) => (v >= 0 ? `rgb(${Math.round(40 + 20 * (1 - v))},${Math.round(120 + 100 * v)},${Math.round(90 + 40 * v)})` : `rgb(${Math.round(160 + 80 * -v)},${Math.round(70 - 20 * -v)},${Math.round(70 - 20 * -v)})`);

export default function MapScreen() {
  const g = useGame();
  const { me, openSeat, seat } = useStore();
  const [layer, setLayer] = useState<LayerId>(g.results.length && g.phase !== 'campaign' ? 'result' : 'leader');
  const [st, setSt] = useState('');
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const lastRes = g.results[g.results.length - 1];

  const tiles = useMemo(() => {
    const out: Record<string, TileLayer> = {};
    for (const c of g.seats) {
      const fc = g.seatForecast[c.id];
      const dim = !!st && c.state !== st;
      let t: TileLayer;
      switch (layer) {
        case 'leader': t = { color: g.parties[fc?.leader]?.color ?? '#333', height: fc?.probs[fc.leader] ?? 0.3 }; break;
        case 'mine': { const r = ratingFor(g, c, me); t = { color: RATING_COLOR[r], height: fc?.shares[me] ?? 0 }; break; }
        case 'swing': { const now = fc?.shares[me] ?? 0, was = c.prev?.shares[me] ?? 0; const d = now - was; t = { color: diverge(Math.max(-1, Math.min(1, d * 8))), height: Math.abs(d) * 4 + 0.02 }; break; }
        case 'activity': { const v = Math.min(1, (c.visits[me] ?? 0) / 4 + (c.spend[me] ?? 0) / 30); t = { color: heat(v), height: v }; break; }
        case 'org': t = { color: heat(c.org[me] ?? 0), height: c.org[me] ?? 0 }; break;
        case 'candidate': { const a = c.candidates[me] ? candidateAppeal(c, me) : 0; t = { color: c.candidates[me] ? heat(a) : '#1a2029', height: a * 0.8 }; break; }
        case 'turnout': t = { color: heat((c.turnoutBase - 0.45) / 0.4), height: c.turnoutBase - 0.3 }; break;
        case 'alliance': { const a = g.alliances.find((x) => x.seatAlloc[c.id]); t = { color: a ? g.parties[a.leader].color : g.parties[fc?.leader]?.color ?? '#333', height: a ? 0.5 : 0.15, dim: !a }; break; }
        case 'result': { const r = lastRes?.seats[c.id]; t = r ? { color: g.parties[r.winner]?.color ?? '#333', height: Math.min(1, r.margin * 4 + 0.08) } : { color: '#222', height: 0.1 }; break; }
      }
      out[c.id] = { ...t, dim: dim || t.dim };
    }
    return out;
  }, [g, layer, st, me, lastRes]);

  const hc = hover ? g.seats.find((c) => c.id === hover.id) : null;
  const legend = useMemo(() => {
    if (layer === 'leader' || layer === 'result') {
      const count: Record<string, number> = {};
      for (const c of g.seats) { const w = layer === 'result' ? lastRes?.seats[c.id]?.winner : g.seatForecast[c.id]?.leader; if (w) count[w] = (count[w] ?? 0) + 1; }
      return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([p, n]) => <span key={p} className="row" style={{ gap: 5 }}><PartyChip g={g} id={p} /><b className="mono">{n}</b></span>);
    }
    if (layer === 'mine') return (Object.keys(RATING_COLOR) as Rating[]).map((r) => <span key={r} className="row" style={{ gap: 5 }}><i className="pdot" style={{ background: RATING_COLOR[r] }} />{r}</span>);
    if (layer === 'swing') return [<span key="a" className="row" style={{ gap: 5 }}><i className="pdot" style={{ background: diverge(0.8) }} />Gaining vs last time</span>, <span key="b" className="row" style={{ gap: 5 }}><i className="pdot" style={{ background: diverge(-0.8) }} />Losing</span>, <span key="c" className="dim">Brightness = size of the change</span>];
    if (layer === 'alliance') return g.alliances.map((a) => <span key={a.id} className="row" style={{ gap: 5 }}><i className="pdot" style={{ background: g.parties[a.leader].color }} />{a.name}</span>);
    return [<span key="lo" className="row" style={{ gap: 5 }}><i className="pdot" style={{ background: heat(0.05) }} />Low</span>, <span key="hi" className="row" style={{ gap: 5 }}><i className="pdot" style={{ background: heat(0.95) }} />High</span>];
  }, [layer, g, lastRes]);

  return (
    <>
      <PageHead title="Map" sub="One tile per constituency, grouped by state at rough geographic positions (a schematic, not exact boundaries). Brighter tiles mean a stronger value. Click any tile to open the seat.">
        <select className="select" style={{ maxWidth: 220 }} value={st} onChange={(e) => setSt(e.target.value)} aria-label="Highlight state"><option value="">All states</option>{STATES_LIST.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
      </PageHead>
      <div className="map-wrap">
        <svg viewBox={`-10 -40 ${58 * CELL} ${45 * CELL}`} style={{ width: '100%', height: '100%', display: 'block' }} role="img" aria-label="Constituency tile map. The Constituencies screen has the same data as a keyboard-friendly table."
          onMouseLeave={() => setHover(null)}>
          {STATES_LIST.map((s) => {
            const [gx, gy, cols] = s.grid;
            const rows = Math.ceil(s.seats.length / cols), w = Math.min(cols, s.seats.length);
            return <g key={s.code} opacity={st && st !== s.code ? 0.35 : 1}>
              <rect x={gx * CELL - 3} y={gy * CELL - 3} width={w * CELL + 5} height={rows * CELL + 5} rx={4} fill="#0f151e" stroke="#1d2633" />
              <text x={gx * CELL + (w * CELL) / 2} y={(gy + rows) * CELL + 11} fill="#6b7889" fontSize="8.5" fontWeight="600" textAnchor="middle" fontFamily="var(--mono)">{s.code}</text>
            </g>;
          })}
          {g.seats.map((c) => {
            const [x, y] = tilePos(c);
            const t = tiles[c.id];
            const on = seat === c.id || hover?.id === c.id;
            return <rect key={c.id} x={x * CELL} y={y * CELL} width={CELL - 2} height={CELL - 2} rx={2.5}
              fill={t.color} opacity={t.dim ? 0.18 : 0.35 + Math.min(1, t.height) * 0.65}
              stroke={on ? '#fff' : 'none'} strokeWidth={1.5} style={{ cursor: 'pointer', transition: 'fill .4s, opacity .4s' }}
              onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect(); setHover({ id: c.id, x: e.clientX - r.left, y: e.clientY - r.top }); }}
              onClick={() => openSeat(c.id)} />;
          })}
        </svg>
        <div className="map-hud">
          <Seg value={layer} onChange={setLayer} options={[
            { v: 'leader', label: 'Forecast' }, { v: 'mine', label: 'My chances' }, { v: 'swing', label: 'Swing' }, { v: 'activity', label: 'Campaign' },
            { v: 'org', label: 'Organisation' }, { v: 'candidate', label: 'Candidates' }, { v: 'turnout', label: 'Turnout' }, { v: 'alliance', label: 'Alliances' },
            ...(lastRes ? [{ v: 'result' as LayerId, label: 'Results' }] : []),
          ]} />
        </div>
        {hc && hover && (
          <div className="map-tip" style={{ left: Math.min(hover.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 520), top: hover.y + 16 }}>
            <div className="row"><b>{hc.name}</b><span className="dim tiny right">{STATE_BY_CODE[hc.state].code}</span></div>
            <div className="tiny dim" style={{ marginBottom: 6 }}>Held by {g.parties[hc.incumbent]?.short} · {hc.localIssues.map((i) => ISSUE_NAME[i]).join(', ')}</div>
            {g.seatForecast[hc.id] && <StackBar g={g} shares={layer === 'result' && lastRes ? lastRes.seats[hc.id].shares : g.seatForecast[hc.id].shares} />}
            <div className="row tiny" style={{ marginTop: 6 }}><span>You: {Math.round((g.seatForecast[hc.id]?.probs[me] ?? 0) * 100)}% win</span><span className="right">org {Math.round((hc.org[me] ?? 0) * 100)} · events {hc.visits[me] ?? 0}</span></div>
          </div>
        )}
        <div className="legend">{legend}</div>
      </div>
    </>
  );
}
