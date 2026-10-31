import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { GameState, Party, Provenance } from '../engine/index.ts';
import { ISSUE_NAME } from '../engine/index.ts';

export function partyColor(g: GameState, id: string) { return g.parties[id]?.color ?? '#555'; }

export function PartyChip({ g, id, full }: { g: GameState; id: string; full?: boolean }) {
  const p = g.parties[id];
  if (!p) return <span className="dim">—</span>;
  return <span className="pchip"><i className="pdot" style={{ background: p.color }} />{full ? p.name : p.short}</span>;
}

// Original, generic glyphs (not ECI-reserved symbols)
const GLYPHS: Record<string, string> = {
  lotus: '✿', palm: '✋', 'broom-glyph': '⌇', 'twin-flower': '❀', 'cycle-glyph': '◎', 'elephant-glyph': '♜', 'rising-sun': '☀', 'two-leaves-glyph': '❦',
  'arrow-glyph': '➶', 'lantern-glyph': '⌂', 'bow-glyph': '⌒', 'torch-glyph': '♨', 'clock-glyph': '◷', 'trumpet-glyph': '♫', 'sickle-star': '☭', 'ear-sickle': '✶',
  'cycle-wheel': '❂', 'fan-glyph': '✣', 'conch-glyph': '◉', 'car-glyph': '⛟', 'scales-glyph': '⚖', 'bow-arrow-glyph': '➹', 'farmer-glyph': '⚘', 'ladder-glyph': '☰', star: '★',
  wheel: '☸', flame: '✦', hand: '✊', book: '▤', tree: '♣', mountain: '▲', drop: '◆',
};
export const SYMBOL_KEYS = ['wheel', 'flame', 'hand', 'book', 'tree', 'mountain', 'drop', 'star'];
// Real parties get a plain name badge: the game does not ship or imitate official party
// logos or ECI symbol artwork. The ECI symbol name is given as text (tooltip and labels).
// Player-founded parties keep the glyph they picked.
export function Symbol({ p, size = 40 }: { p: Pick<Party, 'symbol' | 'color' | 'color2'> & { short?: string; displaySymbol?: string; custom?: boolean }; size?: number }) {
  const bg = `linear-gradient(135deg, ${p.color}, ${shade(p.color, -30)})`;
  const custom = p.custom || (SYMBOL_KEYS.includes(p.symbol) && p.short !== 'OTH');
  if (!custom && p.short) {
    const len = p.short.length;
    return <span className="symbol" title={p.displaySymbol ? `Election symbol: ${p.displaySymbol}` : p.short} style={{ width: size, height: size, background: bg, color: pickInk(p.color), fontSize: size * (len <= 3 ? 0.32 : len <= 5 ? 0.24 : 0.19), fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>{p.short}</span>;
  }
  return <span className="symbol" style={{ width: size, height: size, background: bg, color: pickInk(p.color), fontSize: size * 0.5 }}>{GLYPHS[p.symbol] ?? '★'}</span>;
}

export function IssueChips({ strong, weak, max = 5 }: { strong?: { issue: string; level: number }[]; weak?: { issue: string; level: number }[]; max?: number }) {
  const names = ISSUE_NAME as Record<string, string>;
  return (
    <span className="row wrap" style={{ gap: 4 }}>
      {(strong ?? []).slice(0, max).map((t) => <span key={'s' + t.issue} className="chip good" title={`Strong on ${names[t.issue]} (intensity ${Math.round(t.level * 20)}/20)`}>+ {names[t.issue]}</span>)}
      {(weak ?? []).slice(0, max).map((t) => <span key={'w' + t.issue} className="chip bad" title={`Weak on ${names[t.issue]} (intensity ${Math.round(t.level * 20)}/20)`}>− {names[t.issue]}</span>)}
    </span>
  );
}

export function FitNum({ v }: { v: number }) {
  const n = Math.round(v * 20 / 0.4);
  return <span className="mono" style={{ color: n >= 4 ? '#3ccf8e' : n >= 1 ? '#a6d86a' : n > -2 ? '#e9c46a' : '#ff6b6b' }}>{n > 0 ? '+' : ''}{n}</span>;
}

export function shade(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
export function pickInk(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#0a0a0a' : '#ffffff';
}

export function Panel({ title, extra, children, className = '', style }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {(title || extra) && <div className="panel-h"><h3>{title}</h3><div className="right row">{extra}</div></div>}
      {children}
    </section>
  );
}

export function Stat({ label, value, delta, big, tone }: { label: string; value: ReactNode; delta?: ReactNode; big?: boolean; tone?: 'good' | 'bad' | 'warn' }) {
  return <div className="stat"><span className="l">{label}</span><span className={`v ${big ? 'big' : ''} ${tone ?? ''}`}>{value}</span>{delta && <span className="d">{delta}</span>}</div>;
}

export function Meter({ v, color, max = 1 }: { v: number; color?: string; max?: number }) {
  return <div className="meter"><i style={{ width: `${Math.max(0, Math.min(1, v / max)) * 100}%`, background: color }} /></div>;
}

// FM-style 1-20 attribute display
export function attr20(v: number) { return Math.max(1, Math.min(20, Math.round(v * 20))); }
export function AttrColor(v20: number) { return v20 >= 16 ? '#3ccf8e' : v20 >= 12 ? '#a6d86a' : v20 >= 8 ? '#e9c46a' : '#ff6b6b'; }
export function Attr({ label, v, hidden }: { label: string; v: number; hidden?: boolean }) {
  const n = attr20(v);
  return (
    <div className="attr">
      <span className="muted">{label}</span>
      <span className="attr-num" style={{ color: hidden ? 'var(--ink3)' : AttrColor(n), background: '#0b1017' }}>{hidden ? '?' : n}</span>
    </div>
  );
}

export function Prov({ p }: { p: Provenance }) {
  const label = { historical: 'Historical', estimate: 'Estimate', simulated: 'Simulated', player: 'Player-made', generated: 'Generated' }[p];
  return <span className="badge-prov" title={{ historical: 'Recorded fact from a cited source', estimate: 'A hand-set game estimate, not an official figure', simulated: 'Produced by the simulation', player: 'Created by you', generated: 'Generated narrative' }[p]}>{label}</span>;
}

export function Pct({ v, d = 1 }: { v: number; d?: number }) { return <span className="mono">{(v * 100).toFixed(d)}%</span>; }
export const fmtCr = (v: number) => `₹${v >= 100 ? Math.round(v).toLocaleString('en-IN') : v.toFixed(1)} cr`;

export function StackBar({ g, shares, height = 12 }: { g: GameState; shares: Record<string, number>; height?: number }) {
  const items = Object.entries(shares).filter(([, v]) => v > 0.003).sort((a, b) => b[1] - a[1]);
  return (
    <div className="stack" style={{ height }} role="img" aria-label={items.map(([p, v]) => `${g.parties[p]?.short} ${(v * 100).toFixed(0)}%`).join(', ')}>
      {items.map(([p, v]) => <span key={p} title={`${g.parties[p]?.short}: ${(v * 100).toFixed(1)}%`} style={{ flexBasis: `${v * 100}%`, background: partyColor(g, p) }} />)}
    </div>
  );
}

export interface Col<T> { key: string; label: string; num?: boolean; render: (r: T) => ReactNode; sort?: (r: T) => number | string; width?: number }

export function Table<T>({ rows, cols, onRow, rowKey, selected, initialSort, max }: { rows: T[]; cols: Col<T>[]; onRow?: (r: T) => void; rowKey: (r: T) => string; selected?: string | null; initialSort?: [string, 1 | -1]; max?: number }) {
  const [sort, setSort] = useState<[string, 1 | -1] | undefined>(initialSort);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort[0]);
    if (!c?.sort) return rows;
    return rows.slice().sort((a, b) => { const x = c.sort!(a), y = c.sort!(b); return (x > y ? 1 : x < y ? -1 : 0) * sort[1]; });
  }, [rows, sort, cols]);
  const shown = max ? sorted.slice(0, max) : sorted;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{cols.map((c) => (
          <th key={c.key} className={c.num ? 'num' : ''} style={c.width ? { width: c.width } : undefined}
            onClick={() => c.sort && setSort((s) => (s && s[0] === c.key ? [c.key, (s[1] * -1) as 1 | -1] : [c.key, c.num ? -1 : 1]))}
            aria-sort={sort?.[0] === c.key ? (sort[1] === 1 ? 'ascending' : 'descending') : undefined}>
            {c.label}{sort?.[0] === c.key ? (sort[1] === 1 ? ' ▲' : ' ▼') : ''}
          </th>))}</tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={rowKey(r)} className={`${onRow ? 'click' : ''} ${selected === rowKey(r) ? 'sel' : ''}`} onClick={() => onRow?.(r)} tabIndex={onRow ? 0 : undefined} onKeyDown={(e) => { if (e.key === 'Enter') onRow?.(r); }}>
              {cols.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <div className="empty">Nothing matches these filters.</div>}
      {max && sorted.length > max && <div className="dim small" style={{ padding: 10 }}>Showing {max} of {sorted.length}. Use filters to narrow down.</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true">
      <div className="modal" style={wide ? { width: 'min(1080px, 100%)' } : undefined} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="modal-h">{title}<button className="btn ghost sm right" onClick={onClose} aria-label="Close" autoFocus>✕</button></div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ text, onYes, onNo, yes = 'Confirm' }: { text: ReactNode; onYes: () => void; onNo: () => void; yes?: string }) {
  return (
    <Modal title={<b>Are you sure?</b>} onClose={onNo}>
      <div className="col"><div className="muted">{text}</div><div className="row right"><button className="btn ghost" onClick={onNo}>Cancel</button><button className="btn primary" onClick={onYes}>{yes}</button></div></div>
    </Modal>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return <div className="seg" role="tablist">{options.map((o) => <button key={o.v} role="tab" aria-selected={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>)}</div>;
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return <div className="tabs" role="tablist">{options.map((o) => <button key={o.v} role="tab" aria-selected={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>)}</div>;
}

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return <div className="page-h"><div className="grow"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{children}</div>;
}

// Small multi-series line chart drawn in SVG; series values are plotted against turn index.
export function LineChart({ series, height = 180, yMax, yFmt = (v: number) => String(Math.round(v)), band, refLine }: { series: { name: string; color: string; values: number[]; lo?: number[]; hi?: number[] }[]; height?: number; yMax?: number; yFmt?: (v: number) => string; band?: boolean; refLine?: { v: number; label: string } }) {
  const w = 600, h = height, pad = { l: 36, r: 64, t: 10, b: 20 };
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const max = yMax ?? Math.max(1, ...series.flatMap((s) => s.hi ?? s.values)) * 1.08;
  const x = (i: number) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="hemi" role="img" aria-label="Trend chart">
      {ticks.map((t) => <g key={t}><line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="#18202b" /><text x={pad.l - 6} y={y(t) + 3} fill="#5d6a7b" fontSize="9" textAnchor="end" fontFamily="var(--mono)">{yFmt(t)}</text></g>)}
      {refLine && <g><line x1={pad.l} x2={w - pad.r} y1={y(refLine.v)} y2={y(refLine.v)} stroke="#e9c46a" strokeDasharray="4 4" opacity=".6" /><text x={w - pad.r + 4} y={y(refLine.v) + 3} fill="#e9c46a" fontSize="9">{refLine.label}</text></g>}
      {series.map((s) => (
        <g key={s.name}>
          {band && s.lo && s.hi && <path d={`M${s.hi.map((v, i) => `${x(i)},${y(v)}`).join('L')}L${s.lo.map((v, i) => `${x(i)},${y(v)}`).reverse().join('L')}Z`} fill={s.color} opacity=".12" />}
          <path d={`M${s.values.map((v, i) => `${x(i)},${y(v)}`).join('L')}`} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
          {s.values.length > 0 && <><circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r="3" fill={s.color} /><text x={x(s.values.length - 1) + 6} y={y(s.values[s.values.length - 1]) + 3} fill={s.color} fontSize="10" fontWeight="600">{s.name} {yFmt(s.values[s.values.length - 1])}</text></>}
        </g>
      ))}
      {Array.from({ length: n }, (_, i) => <text key={i} x={x(i)} y={h - 5} fill="#5d6a7b" fontSize="9" textAnchor="middle">{i === 0 ? 'Start' : `W${i}`}</text>)}
    </svg>
  );
}

// Flat 2D parliament arc. `dots` are colours in left-to-right order.
export function hemicyclePoints(n = 543, rows = 10) {
  const radii = Array.from({ length: rows }, (_, i) => 40 + i * 8.6);
  const tot = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.round((r / tot) * n));
  let diff = n - counts.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; diff !== 0; i = (i - 1 + rows) % rows) { counts[i] += Math.sign(diff); diff -= Math.sign(diff); }
  const pts: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, ri) => { const k = counts[ri]; for (let j = 0; j < k; j++) { const a = Math.PI * (1 - (j + 0.5) / k); pts.push({ x: 130 + Math.cos(a) * r, y: 128 - Math.sin(a) * r, a }); } });
  return pts.sort((p, q) => q.a - p.a);
}
const HEMI = hemicyclePoints();
export function Hemicycle({ dots, pulse, label }: { dots: string[]; pulse?: Set<number>; label?: string }) {
  return (
    <svg viewBox="0 0 260 134" className="hemi" role="img" aria-label={label ?? 'Seat distribution'}>
      {HEMI.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={pulse?.has(i) ? 3.4 : 2.7} fill={dots[i] ?? '#1b2330'} style={{ transition: 'fill .5s, r .3s' }} />)}
      <line x1="130" y1="130" x2="130" y2="30" stroke="#e9c46a" strokeDasharray="2 3" opacity=".45" />
      <text x="130" y="26" fill="#e9c46a" fontSize="7" textAnchor="middle" opacity=".7">272</text>
    </svg>
  );
}
export function MiniHemicycle({ g, seats }: { g: GameState; seats: Record<string, number> }) {
  const dots: string[] = [];
  for (const p of orderParties(g, seats)) for (let i = 0; i < (seats[p] ?? 0); i++) dots.push(g.parties[p]?.color ?? '#333');
  return <Hemicycle dots={dots} />;
}

// Order parties for chamber display: by bloc, then size, so allies sit together.
export function orderParties(g: GameState, seats: Record<string, number>): string[] {
  const blocOf = (p: string) => g.alliances.findIndex((a) => a.members.includes(p));
  return Object.keys(seats).filter((p) => (seats[p] ?? 0) > 0).sort((a, b) => {
    const ba = blocOf(a), bb = blocOf(b);
    const ka = ba < 0 ? 99 : ba, kb = bb < 0 ? 99 : bb;
    if (a === 'OTH') return 1; if (b === 'OTH') return -1;
    return ka - kb || (seats[b] ?? 0) - (seats[a] ?? 0);
  });
}

export function campaignDate(g: GameState, turn = g.campaignTurn) {
  const poll = new Date(Date.UTC(g.year, 4, 20));
  const d = new Date(poll.getTime() - (g.config.campaignTurns - turn + 1) * 7 * 86400000);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
