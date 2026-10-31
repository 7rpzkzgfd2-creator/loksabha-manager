import { useEffect, useMemo, useRef, useState } from 'react';
import { countingView, MAJORITY, SCENARIO_BY_ID, STATE_BY_CODE, STATES_LIST } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { Hemicycle, PageHead, Panel, PartyChip, Prov, StackBar, Table, Tabs, orderParties } from '../components.tsx';

export default function Results() {
  const g = useGame();
  if (g.phase === 'counting' && g.counting) return <ElectionNight />;
  if (!g.results.length) return <><PageHead title="Results" /><div className="empty">No election has been held yet.</div></>;
  return <FinalResults />;
}

function ElectionNight() {
  const g = useGame();
  const { me, countStep, countAll, mpInfo, openSeat } = useStore();
  const [playing, setPlaying] = useState(false);
  const ct = g.counting!;
  const view = useMemo(() => countingView(g, ct.round), [g, ct.round]);
  const prevView = useRef(view);
  const [ticker, setTicker] = useState<string[]>([]);
  useEffect(() => {
    const was = prevView.current;
    const lines: string[] = [];
    for (const c of g.seats) {
      const a = was.seats[c.id], b = view.seats[c.id];
      if (b.declared && !a.declared) { if (b.leader !== c.incumbent && lines.length < 6) lines.push(`${g.parties[b.leader].short} GAIN ${c.name} from ${g.parties[c.incumbent]?.short}`); }
      else if (a.leader && b.leader && a.leader !== b.leader && lines.length < 6) lines.push(`${c.name}: ${g.parties[b.leader].short} edges ahead of ${g.parties[a.leader].short}`);
    }
    prevView.current = view;
    if (lines.length) setTicker((t) => [...lines, ...t].slice(0, 30));
  }, [view, g]);
  useEffect(() => {
    if (!playing || mpInfo) return;
    if (ct.round >= ct.totalRounds) { setPlaying(false); return; }
    const t = setTimeout(() => countStep(1), 650);
    return () => clearTimeout(t);
  }, [playing, ct.round, ct.totalRounds, countStep, mpInfo]);

  const tally: Record<string, { won: number; lead: number }> = {};
  for (const [p, n] of Object.entries(view.won)) (tally[p] ??= { won: 0, lead: 0 }).won = n;
  for (const [p, n] of Object.entries(view.leads)) (tally[p] ??= { won: 0, lead: 0 }).lead = n;
  const totals = Object.fromEntries(Object.entries(tally).map(([p, t]) => [p, t.won + t.lead]));
  const dots: string[] = [];
  for (const p of orderParties(g, totals)) {
    for (let i = 0; i < tally[p].won; i++) dots.push(g.parties[p].color);
    for (let i = 0; i < tally[p].lead; i++) dots.push(g.parties[p].color + '77');
  }
  const blocs = g.alliances.map((a) => ({ a, n: a.members.reduce((s, m) => s + (totals[m] ?? 0), 0) }));
  const close = g.seats.filter((c) => view.seats[c.id].leader && view.seats[c.id].margin < 0.02).slice(0, 12);
  const fcAt = g.polls[g.polls.length - 1];
  const declared = Object.values(view.seats).filter((s) => s.declared).length;

  return (
    <>
      <PageHead title="Election night" sub="Counting is under way. Early leads come from partial counts and can flip; a seat is settled only when declared.">
        {!mpInfo && <>
          <button className="btn" onClick={() => setPlaying(!playing)} disabled={ct.round >= ct.totalRounds}>{playing ? 'Pause' : 'Play count'}</button>
          <button className="btn" onClick={() => countStep(1)} disabled={ct.round >= ct.totalRounds}>Next round</button>
        </>}
        <button className="btn continue" onClick={countAll}>{ct.round >= ct.totalRounds ? 'Confirm results' : 'Skip to the end'}</button>
      </PageHead>
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          <Panel title={`Round ${ct.round} of ${ct.totalRounds}`} extra={<span className="mono small">{declared}/543 declared</span>}>
            <Hemicycle dots={dots} label="Leads and wins so far" />
            <div className="tiny dim">Solid = won, faded = leading.</div>
          </Panel>
          <Panel title="Seats" className="flush">
            <Table rows={Object.keys(tally)} rowKey={(p) => p} initialSort={['t', -1]} cols={[
              { key: 'p', label: 'Party', render: (p) => <PartyChip g={g} id={p} full />, sort: (p) => p },
              { key: 'w', label: 'Won', num: true, render: (p) => tally[p].won, sort: (p) => tally[p].won },
              { key: 'l', label: 'Leading', num: true, render: (p) => tally[p].lead, sort: (p) => tally[p].lead },
              { key: 't', label: 'Total', num: true, render: (p) => <b>{totals[p]}</b>, sort: (p) => totals[p] },
              { key: 'f', label: 'Final forecast', num: true, render: (p) => <span className="dim">{fcAt?.seats[p]?.[1] ?? 0}</span>, sort: (p) => fcAt?.seats[p]?.[1] ?? 0 },
            ]} />
          </Panel>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Race to 272" className="glow">
            {blocs.map(({ a, n }) => (
              <div key={a.id} style={{ marginBottom: 10 }}>
                <div className="row small"><b>{a.name}</b><span className="mono right" style={{ color: n >= MAJORITY ? 'var(--good)' : undefined }}>{n}</span></div>
                <div className="meter" style={{ height: 10 }}><i style={{ width: `${(n / 543) * 100}%`, background: g.parties[a.leader].color }} /><span style={{ position: 'absolute', left: `${(MAJORITY / 543) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--gold)' }} /></div>
              </div>
            ))}
            <div className="row small"><PartyChip g={g} id={me} /> <span className="right mono">{totals[me] ?? 0}</span></div>
          </Panel>
          <Panel title="Wire">
            <div className="col small" style={{ gap: 6, maxHeight: 260, overflow: 'auto' }}>
              {ticker.map((t, i) => <div key={i} className={t.includes('GAIN') ? '' : 'muted'}>{t}</div>)}
              {!ticker.length && <div className="dim">Counting has not started. Press Play.</div>}
            </div>
          </Panel>
          <Panel title="Too close to call">
            <div className="col small" style={{ gap: 6 }}>
              {close.map((c) => <div key={c.id} className="row" style={{ cursor: 'pointer' }} onClick={() => openSeat(c.id)}><span className="grow">{c.name} <span className="dim">{c.state}</span></span><PartyChip g={g} id={view.seats[c.id].leader} /><span className="mono dim">{(view.seats[c.id].margin * 100).toFixed(1)}</span></div>)}
              {!close.length && <div className="dim">None right now.</div>}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function FinalResults() {
  const g = useGame();
  const { me, openSeat, go } = useStore();
  const [idx, setIdx] = useState(g.results.length - 1);
  const r = g.results[idx];
  const [tab, setTab] = useState<'overview' | 'autopsy' | 'states' | 'seats'>('overview');
  const sc = SCENARIO_BY_ID[g.config.scenarioId];
  const parties = Object.keys(r.partySeats).sort((a, b) => r.partySeats[b] - r.partySeats[a]);
  const stateRows = STATES_LIST.map((s) => {
    const count: Record<string, number> = {};
    for (const c of g.seats.filter((x) => x.state === s.code)) count[r.seats[c.id].winner] = (count[r.seats[c.id].winner] ?? 0) + 1;
    return { s, count };
  });
  return (
    <>
      <PageHead title={`${r.year} general election`} sub={`Simulated result. Turnout ${(r.turnout * 100).toFixed(1)}%.`}>
        <Prov p="simulated" />
        {g.results.length > 1 && <select className="select" style={{ width: 140 }} value={idx} onChange={(e) => setIdx(+e.target.value)}>{g.results.map((x, i) => <option key={i} value={i}>{x.year}</option>)}</select>}
        {g.phase === 'formation' && <button className="btn continue" onClick={() => go('formation')}>Government formation ›</button>}
      </PageHead>
      <Tabs value={tab} onChange={setTab} options={[{ v: 'overview', label: 'Overview' }, { v: 'autopsy', label: 'Why it happened' }, { v: 'states', label: 'States' }, { v: 'seats', label: 'All seats' }]} />
      {tab === 'overview' && (
        <div className="grid g-main">
          <Panel title="Seats and votes" className="flush">
            <Table rows={parties} rowKey={(p) => p} initialSort={['s', -1]} cols={[
              { key: 'p', label: 'Party', render: (p) => <PartyChip g={g} id={p} full />, sort: (p) => p },
              { key: 's', label: 'Seats', num: true, render: (p) => <b>{r.partySeats[p]}</b>, sort: (p) => r.partySeats[p] },
              { key: 'v', label: 'Vote %', num: true, render: (p) => ((r.voteShare[p] ?? 0) * 100).toFixed(1), sort: (p) => r.voteShare[p] ?? 0 },
              { key: 'ss', label: 'Seat %', num: true, render: (p) => ((r.partySeats[p] / 543) * 100).toFixed(1), sort: (p) => r.partySeats[p] },
              { key: 'f', label: 'Forecast', num: true, render: (p) => <span className="dim">{r.forecastAtPoll[p] ?? 0}</span>, sort: (p) => r.forecastAtPoll[p] ?? 0 },
              { key: 'd', label: 'vs forecast', num: true, render: (p) => { const d = r.partySeats[p] - (r.forecastAtPoll[p] ?? 0); return <span className={d > 0 ? 'good' : d < 0 ? 'bad' : 'dim'}>{d > 0 ? '+' : ''}{d}</span>; } },
            ]} />
          </Panel>
          <div className="col" style={{ gap: 14 }}>
            <Panel title="The new House"><Hemicycle dots={orderParties(g, r.partySeats).flatMap((p) => Array(r.partySeats[p]).fill(g.parties[p].color))} /></Panel>
            <Panel title="Blocs">{g.alliances.map((a) => <div key={a.id} className="row small" style={{ padding: '3px 0' }}><span className="grow">{a.name}</span><b className="mono" style={{ color: (r.blocSeats[a.id] ?? 0) >= MAJORITY ? 'var(--good)' : undefined }}>{r.blocSeats[a.id] ?? 0}</b></div>)}</Panel>
            {sc.recorded && (
              <Panel title={<>The real {sc.year} <Prov p="historical" /></>}>
                <div className="col small" style={{ gap: 4 }}>{Object.entries(sc.recorded.seats).map(([p, n]) => <div key={p} className="row"><PartyChip g={g} id={p} /><span className="mono right">{n}</span><span className="mono dim" style={{ width: 70, textAlign: 'right' }}>you: {r.partySeats[p] ?? 0}</span></div>)}</div>
                <div className="tiny dim" style={{ marginTop: 6 }}>{sc.recorded.source}. The simulation was not steered towards these numbers.</div>
              </Panel>
            )}
          </div>
        </div>
      )}
      {tab === 'autopsy' && (
        <div className="grid g2">
          {r.autopsy.map((a, i) => (
            <Panel key={i} title={a.heading} extra={<span className={`chip ${a.confidence === 'strong' ? 'good' : a.confidence === 'plausible' ? 'info' : 'warn'}`}>{a.confidence === 'strong' ? 'Clear from the count' : a.confidence === 'plausible' ? 'Plausible cause' : 'Uncertain'}</span>}>
              <p className="muted small" style={{ margin: 0 }}>{a.detail}</p>
            </Panel>
          ))}
          <Panel title="A note on causes"><p className="small muted" style={{ margin: 0 }}>The count tells us what happened. Why is harder: several things moved at once, and some differences are just luck on the day. Items marked plausible or uncertain are interpretations, not proof.</p></Panel>
        </div>
      )}
      {tab === 'states' && (
        <Panel className="flush">
          <Table rows={stateRows} rowKey={(x) => x.s.code} cols={[
            { key: 'n', label: 'State', render: (x) => x.s.name, sort: (x) => x.s.name },
            { key: 't', label: 'Seats', num: true, render: (x) => x.s.seats.length, sort: (x) => x.s.seats.length },
            { key: 'm', label: 'You', num: true, render: (x) => x.count[me] ?? 0, sort: (x) => x.count[me] ?? 0 },
            { key: 'w', label: 'Winners', render: (x) => <div className="row wrap" style={{ gap: 6 }}>{Object.entries(x.count).sort((a, b) => b[1] - a[1]).map(([p, n]) => <span key={p} className="row" style={{ gap: 3 }}><PartyChip g={g} id={p} /><span className="mono dim">{n}</span></span>)}</div> },
          ]} />
        </Panel>
      )}
      {tab === 'seats' && (
        <Panel className="flush">
          <div style={{ maxHeight: 'calc(100vh - 270px)', overflow: 'auto' }}>
            <Table rows={g.seats} rowKey={(c) => c.id} onRow={(c) => openSeat(c.id)} max={543} cols={[
              { key: 'n', label: 'Seat', render: (c) => <b>{c.name}</b>, sort: (c) => c.name },
              { key: 's', label: 'State', render: (c) => STATE_BY_CODE[c.state].code, sort: (c) => c.state },
              { key: 'w', label: 'Winner', render: (c) => <PartyChip g={g} id={r.seats[c.id].winner} />, sort: (c) => r.seats[c.id].winner },
              { key: 'k', label: 'MP-elect', render: (c) => r.seats[c.id].winnerCandidate },
              { key: 'ru', label: 'Runner-up', render: (c) => <PartyChip g={g} id={r.seats[c.id].runnerUp} /> },
              { key: 'm', label: 'Margin', num: true, render: (c) => `${(r.seats[c.id].margin * 100).toFixed(1)}`, sort: (c) => r.seats[c.id].margin },
              { key: 'g', label: '', render: (c) => (c.prev && c.prev.winner !== r.seats[c.id].winner ? <span className="chip warn">Gain</span> : null) },
              { key: 'sh', label: 'Shares', render: (c) => <div style={{ width: 140 }}><StackBar g={g} shares={r.seats[c.id].shares} height={8} /></div> },
              { key: 'ld', label: 'Lost deposits', render: (c) => <span className="small dim">{r.seats[c.id].lostDeposits.map((p) => g.parties[p]?.short).join(', ')}</span> },
            ]} />
          </div>
        </Panel>
      )}
    </>
  );
}
