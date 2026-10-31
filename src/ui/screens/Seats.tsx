import { useMemo, useState } from 'react';
import { STATES_LIST, STATE_BY_CODE, ISSUES, ISSUE_NAME, candidateAppeal } from '../../engine/index.ts';
import type { Issue } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { PageHead, Panel, PartyChip, Table, attr20, AttrColor } from '../components.tsx';
import { margin, ratingFor, RATING_COLOR } from '../derive.ts';
import type { Rating } from '../derive.ts';

export default function Seats() {
  const g = useGame();
  const { me, openSeat } = useStore();
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [rating, setRating] = useState<Rating | ''>('');
  const [issue, setIssue] = useState<Issue | ''>('');
  const [mine, setMine] = useState(true);
  const [opp, setOpp] = useState(false);
  const rows = useMemo(() => g.seats.filter((c) =>
    (!q || c.name.toLowerCase().includes(q.toLowerCase())) && (!st || c.state === st) && (!rating || ratingFor(g, c, me) === rating)
    && (!issue || c.localIssues.includes(issue)) && (!mine || !!c.candidates[me])
    && (!opp || (() => { const pr = g.seatForecast[c.id]?.probs[me] ?? 0; return pr > 0.25 && pr < 0.75 && (c.visits[me] ?? 0) === 0; })())
  ), [g, q, st, rating, issue, mine, opp, me]);

  return (
    <>
      <PageHead title="Constituencies" sub={`All 543 seats. ${rows.length} shown. Click a row for the full picture and campaign options.`} />
      <Panel style={{ marginBottom: 14 }}>
        <div className="row wrap">
          <input className="input" style={{ maxWidth: 220 }} placeholder="Search seat…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search constituencies" />
          <select className="select" style={{ maxWidth: 200 }} value={st} onChange={(e) => setSt(e.target.value)} aria-label="State"><option value="">All states</option>{STATES_LIST.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
          <select className="select" style={{ maxWidth: 170 }} value={rating} onChange={(e) => setRating(e.target.value as Rating)} aria-label="Rating"><option value="">Any rating</option>{(Object.keys(RATING_COLOR) as Rating[]).map((r) => <option key={r}>{r}</option>)}</select>
          <select className="select" style={{ maxWidth: 200 }} value={issue} onChange={(e) => setIssue(e.target.value as Issue)} aria-label="Local issue"><option value="">Any local issue</option>{ISSUES.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <label className="row small"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only seats I contest</label>
          <label className="row small"><input type="checkbox" checked={opp} onChange={(e) => setOpp(e.target.checked)} /> Untouched opportunities</label>
        </div>
      </Panel>
      <Panel className="flush">
        <div style={{ maxHeight: 'calc(100vh - 290px)', overflow: 'auto' }}>
          <Table rows={rows} rowKey={(c) => c.id} onRow={(c) => openSeat(c.id)} max={250} initialSort={['p', -1]} cols={[
            { key: 'n', label: 'Constituency', render: (c) => <b>{c.name}</b>, sort: (c) => c.name },
            { key: 's', label: 'State', render: (c) => STATE_BY_CODE[c.state].name, sort: (c) => c.state },
            { key: 'i', label: 'Held by', render: (c) => <PartyChip g={g} id={c.incumbent} />, sort: (c) => c.incumbent },
            { key: 'l', label: 'Forecast leader', render: (c) => <PartyChip g={g} id={g.seatForecast[c.id]?.leader} />, sort: (c) => g.seatForecast[c.id]?.leader ?? '' },
            { key: 'r', label: 'Rating', render: (c) => { const r = ratingFor(g, c, me); return <span className="chip" style={{ color: RATING_COLOR[r], borderColor: RATING_COLOR[r] + '55' }}>{r}</span>; }, sort: (c) => g.seatForecast[c.id]?.probs[me] ?? 0 },
            { key: 'p', label: 'Win %', num: true, render: (c) => Math.round((g.seatForecast[c.id]?.probs[me] ?? 0) * 100), sort: (c) => g.seatForecast[c.id]?.probs[me] ?? 0 },
            { key: 'm', label: 'Margin', num: true, render: (c) => (margin(g, c) * 100).toFixed(1), sort: (c) => margin(g, c) },
            { key: 'k', label: 'Your candidate', render: (c) => c.candidates[me] ? <span className="row"><span className="attr-num" style={{ color: AttrColor(attr20(candidateAppeal(c, me))), background: '#0b1017' }}>{attr20(candidateAppeal(c, me))}</span>{c.candidates[me].name}</span> : <span className="dim">—</span>, sort: (c) => candidateAppeal(c, me) },
            { key: 'o', label: 'Org', num: true, render: (c) => Math.round((c.org[me] ?? 0) * 100), sort: (c) => c.org[me] ?? 0 },
            { key: 'v', label: 'Events', num: true, render: (c) => c.visits[me] ?? 0, sort: (c) => c.visits[me] ?? 0 },
            { key: 'li', label: 'Local issues', render: (c) => <span className="small muted">{c.localIssues.map((i) => ISSUE_NAME[i]).join(', ')}</span> },
          ]} />
        </div>
      </Panel>
    </>
  );
}
