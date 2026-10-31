import { useMemo } from 'react';
import { MAJORITY, STATE_BY_CODE, STATES_LIST } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { Meter, PageHead, Panel, PartyChip, Stat, Table, fmtCr } from '../components.tsx';
import { margin, ratingFor, RATING_COLOR, recommendations } from '../derive.ts';
import type { Rating } from '../derive.ts';

export default function WarRoom() {
  const g = useGame();
  const { me, go, openSeat } = useStore();
  const p = g.parties[me];
  const recs = recommendations(g, me);
  const last = g.polls[g.polls.length - 1];
  const ratings = useMemo(() => {
    const r: Record<Rating, number> = { Safe: 0, Likely: 0, Lean: 0, 'Toss-up': 0, 'Lean opp.': 0, 'Likely opp.': 0, 'Safe opp.': 0, 'Not contesting': 0 };
    for (const c of g.seats) r[ratingFor(g, c, me)]++;
    return r;
  }, [g, me]);
  const battle = useMemo(() => g.seats.filter((c) => c.candidates[me]).map((c) => ({ c, pr: g.seatForecast[c.id]?.probs[me] ?? 0 })).filter((x) => x.pr > 0.2 && x.pr < 0.8).sort((a, b) => Math.abs(a.pr - 0.5) - Math.abs(b.pr - 0.5)), [g, me]);
  const states = useMemo(() => STATES_LIST.map((s) => {
    const seats = g.seats.filter((c) => c.state === s.code);
    const lead = seats.filter((c) => g.seatForecast[c.id]?.leader === me).length;
    const comp = seats.filter((c) => { const pr = g.seatForecast[c.id]?.probs[me] ?? 0; return pr > 0.25 && pr < 0.75; }).length;
    const visits = seats.reduce((a, c) => a + (c.visits[me] ?? 0), 0);
    const org = seats.reduce((a, c) => a + (c.org[me] ?? 0), 0) / seats.length;
    return { s, n: seats.length, lead, comp, visits, org };
  }).filter((x) => x.comp > 0 || x.lead > 0).sort((a, b) => b.comp - a.comp), [g, me]);
  const tot = last.seats[me];

  return (
    <>
      <PageHead title="War room" sub="What the numbers say, what to worry about, and why. Forecasts are simulated estimates with real uncertainty." />
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Panel><Stat label="Projected seats" value={tot[1]} big delta={<span className="dim">80% range {tot[0]}–{tot[2]}</span>} tone={tot[1] >= MAJORITY ? 'good' : undefined} /></Panel>
        <Panel><Stat label="Projected vote" value={`${((last.shares[me] ?? 0) * 100).toFixed(1)}%`} big delta={<span className="dim">seat share {(tot[1] / 5.43).toFixed(1)}%</span>} /></Panel>
        <Panel><Stat label="Toss-ups" value={ratings['Toss-up'] + ratings.Lean + ratings['Lean opp.']} big delta={<span className="dim">seats that could go either way</span>} /></Panel>
        <Panel><Stat label="Forecast confidence" value={p.staff.some((s) => s.role === 'data_analyst') ? 'Medium' : 'Low'} big delta={<span className="dim">{g.config.campaignTurns - g.campaignTurn} weeks of uncertainty left</span>} /></Panel>
      </div>
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Seat ratings for you">
            <div className="stack" style={{ height: 22 }}>
              {(Object.keys(ratings) as Rating[]).filter((r) => r !== 'Not contesting').map((r) => <span key={r} title={`${r}: ${ratings[r]}`} style={{ flexBasis: `${ratings[r] / 5.43}%`, background: RATING_COLOR[r] }} />)}
            </div>
            <div className="row wrap small" style={{ marginTop: 10, gap: 14 }}>
              {(Object.keys(ratings) as Rating[]).map((r) => <span key={r} className="row" style={{ gap: 5 }}><i className="pdot" style={{ background: RATING_COLOR[r] }} />{r} <b className="mono">{ratings[r]}</b></span>)}
            </div>
          </Panel>
          <Panel title="Battleground seats" extra={<span className="dim small">closest first · click for detail</span>} className="flush">
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              <Table rows={battle} rowKey={(x) => x.c.id} onRow={(x) => openSeat(x.c.id)} max={60} cols={[
                { key: 'n', label: 'Seat', render: (x) => <b>{x.c.name}</b>, sort: (x) => x.c.name },
                { key: 's', label: 'State', render: (x) => STATE_BY_CODE[x.c.state].code, sort: (x) => x.c.state },
                { key: 'p', label: 'Win %', num: true, render: (x) => `${Math.round(x.pr * 100)}`, sort: (x) => x.pr },
                { key: 'l', label: 'Leader', render: (x) => <PartyChip g={g} id={g.seatForecast[x.c.id].leader} /> },
                { key: 'm', label: 'Margin', num: true, render: (x) => `${(margin(g, x.c) * 100).toFixed(1)}`, sort: (x) => margin(g, x.c) },
                { key: 'o', label: 'Org', num: true, render: (x) => `${Math.round((x.c.org[me] ?? 0) * 100)}`, sort: (x) => x.c.org[me] ?? 0 },
                { key: 'v', label: 'Events', num: true, render: (x) => `${x.c.visits[me] ?? 0}`, sort: (x) => x.c.visits[me] ?? 0 },
              ]} />
            </div>
          </Panel>
          <Panel title="State outlook" className="flush">
            <Table rows={states} rowKey={(x) => x.s.code} onRow={() => go('map')} cols={[
              { key: 'n', label: 'State', render: (x) => x.s.name, sort: (x) => x.s.name },
              { key: 't', label: 'Seats', num: true, render: (x) => x.n, sort: (x) => x.n },
              { key: 'l', label: 'Leading', num: true, render: (x) => x.lead, sort: (x) => x.lead },
              { key: 'c', label: 'Competitive', num: true, render: (x) => x.comp, sort: (x) => x.comp },
              { key: 'o', label: 'Org', render: (x) => <div style={{ width: 80 }}><Meter v={x.org} /></div>, sort: (x) => x.org },
              { key: 'v', label: 'Events', num: true, render: (x) => x.visits, sort: (x) => x.visits },
            ]} initialSort={['c', -1]} />
          </Panel>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Risks and recommendations" className="glow">
            <div className="col" style={{ gap: 12 }}>
              {recs.length === 0 && <div className="dim">No pressing problems found.</div>}
              {recs.map((r, i) => (
                <div key={i} className="col" style={{ gap: 4, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                  <div className="row"><span className={`chip ${r.sev === 'critical' ? 'bad' : r.sev === 'high' ? 'warn' : 'info'}`}>{r.sev}</span><b className="small">{r.title}</b></div>
                  <div className="small muted">{r.why}</div>
                  <div className="row">{r.seat && <button className="btn sm" onClick={() => openSeat(r.seat!)}>Inspect seat</button>}{r.go && <button className="btn sm ghost" onClick={() => go(r.go!)}>Go ›</button>}</div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Strategic trade-offs">
            <div className="col small">
              <TradeOff a="Spend now" b="Conserve" v={1 - Math.min(1, p.stats.funds / Math.max(1, p.stats.funds + g.outcomes.filter((o) => o.party === me).reduce((x, o) => x + o.cost, 0)))} note={`${fmtCr(p.stats.funds)} left with ${g.config.campaignTurns - g.campaignTurn + 1} weeks to go.`} />
              <TradeOff a="Leader-led" b="Local faces" v={1 - p.stats.leaderCentrality} note={`Leader standing ${Math.round(p.stats.leaderPop * 100)}. A popular leader lifts every seat; a polarising one costs some.`} />
              <TradeOff a="Safe seats" b="Marginals" v={(() => { const s = g.seats.filter((c) => c.candidates[me]); const m = s.filter((c) => { const pr = g.seatForecast[c.id]?.probs[me] ?? 0; return pr > 0.25 && pr < 0.75; }).reduce((a, c) => a + (c.spend[me] ?? 0), 0); const t = s.reduce((a, c) => a + (c.spend[me] ?? 0), 0); return t ? m / t : 0.5; })()} note="Where your local money has gone so far." />
              <TradeOff a="Advertising" b="Organisation" v={(() => { const o = g.outcomes.filter((x) => x.party === me); const org = o.filter((x) => x.type === 'org_build' || x.type === 'door_to_door' || x.type === 'volunteer_drive').reduce((a, x) => a + x.cost, 0); const all = o.reduce((a, x) => a + x.cost, 0); return all ? org / all : 0.5; })()} note="Organisation is slow but lasts; ads are quick and fade." />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function TradeOff({ a, b, v, note }: { a: string; b: string; v: number; note: string }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row"><span>{a}</span><span className="right">{b}</span></div>
      <div className="meter" style={{ height: 8 }}><i style={{ left: `calc(${Math.max(0, Math.min(1, v)) * 100}% - 4px)`, width: 8, background: 'var(--ink)' }} /></div>
      <span className="tiny dim">{note}</span>
    </div>
  );
}
