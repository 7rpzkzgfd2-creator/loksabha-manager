import { MAJORITY, SCENARIO_BY_ID, STATES_LIST, ISSUES } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { MiniHemicycle, PageHead, Panel, PartyChip, Prov, Stat, Table } from '../components.tsx';

export default function National() {
  const g = useGame();
  const { me, openSeat } = useStore();
  const last = g.polls[g.polls.length - 1];
  const sc = SCENARIO_BY_ID[g.config.scenarioId];
  const parties = Object.keys(last.seats).filter((p) => last.seats[p][2] > 0 || (last.shares[p] ?? 0) > 0.01).sort((a, b) => last.seats[b][1] - last.seats[a][1]);
  const seats = Object.fromEntries(parties.map((p) => [p, last.seats[p][1]]));
  const maxSeats = Math.max(...parties.map((p) => last.seats[p][2]), 50);
  const stateRows = STATES_LIST.map((s) => {
    const cs = g.seats.filter((c) => c.state === s.code);
    const count: Record<string, number> = {};
    for (const c of cs) { const l = g.seatForecast[c.id]?.leader; if (l) count[l] = (count[l] ?? 0) + 1; }
    const lead = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return { s, n: cs.length, count, lead, mine: count[me] ?? 0 };
  });

  return (
    <>
      <PageHead title="National overview" sub={`${sc.title}. Seats are won constituency by constituency: compare each party's vote share with its seat share.`}><Prov p="simulated" /></PageHead>
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Projected seats and vote share" extra={<span className="dim small">bars show the 80% range, dot the median</span>}>
            <div className="col" style={{ gap: 9 }}>
              {parties.slice(0, 14).map((p) => {
                const [lo, mid, hi] = last.seats[p];
                const vs = last.shares[p] ?? 0;
                return (
                  <div key={p} className="row" style={{ gap: 12 }}>
                    <span style={{ width: 86 }}><PartyChip g={g} id={p} /></span>
                    <div className="grow" style={{ position: 'relative', height: 16, background: '#121923', borderRadius: 4 }}>
                      <div style={{ position: 'absolute', left: `${(lo / maxSeats) * 100}%`, width: `${Math.max(0.6, ((hi - lo) / maxSeats) * 100)}%`, top: 3, bottom: 3, background: g.parties[p].color, opacity: 0.35, borderRadius: 3 }} />
                      <div style={{ position: 'absolute', left: `calc(${(mid / maxSeats) * 100}% - 5px)`, top: 3, width: 10, height: 10, borderRadius: 5, background: g.parties[p].color, boxShadow: '0 0 0 2px #0b0f15' }} />
                      {MAJORITY <= maxSeats && <div style={{ position: 'absolute', left: `${(MAJORITY / maxSeats) * 100}%`, top: -2, bottom: -2, width: 1, background: 'var(--gold)', opacity: 0.5 }} />}
                    </div>
                    <span className="mono" style={{ width: 34, textAlign: 'right' }}>{mid}</span>
                    <span className="mono dim small" style={{ width: 92, textAlign: 'right' }}>{(vs * 100).toFixed(1)}% votes</span>
                    <span className="mono small" style={{ width: 74, textAlign: 'right', color: mid / 543 > vs * 1.1 ? 'var(--good)' : mid / 543 < vs * 0.85 ? 'var(--bad)' : 'var(--ink3)' }}>{((mid / 543) * 100).toFixed(1)}% seats</span>
                  </div>
                );
              })}
            </div>
            <p className="tiny dim" style={{ marginTop: 10 }}>Green seat share means a party's votes are efficiently concentrated; red means many of its votes are piling up in seats it loses. The gold line marks 272.</p>
          </Panel>
          <Panel title="States" className="flush">
            <Table rows={stateRows} rowKey={(r) => r.s.code} onRow={(r) => { const c = g.seats.find((x) => x.state === r.s.code); if (c) openSeat(c.id); }} initialSort={['n', -1]} cols={[
              { key: 'name', label: 'State / UT', render: (r) => r.s.name, sort: (r) => r.s.name },
              { key: 'n', label: 'Seats', num: true, render: (r) => r.n, sort: (r) => r.n },
              { key: 'lead', label: 'Leading party', render: (r) => r.lead ? <span className="row"><PartyChip g={g} id={r.lead[0]} /><span className="mono dim">{r.lead[1]}</span></span> : '—', sort: (r) => r.lead?.[0] ?? '' },
              { key: 'mine', label: `You (${g.parties[me].short})`, num: true, render: (r) => r.mine, sort: (r) => r.mine },
              { key: 'split', label: 'Split', render: (r) => <div className="stack" style={{ width: 140, height: 8 }}>{Object.entries(r.count).sort((a, b) => b[1] - a[1]).map(([p, n]) => <span key={p} style={{ flexBasis: `${(n / r.n) * 100}%`, background: g.parties[p].color }} />)}</div> },
            ]} />
          </Panel>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Projected chamber"><MiniHemicycle g={g} seats={seats} /></Panel>
          <Panel title="Race to 272">
            <div className="col">
              {g.alliances.map((a) => (
                <div key={a.id}>
                  <div className="row small"><b>{a.name}</b><span className="mono right">{last.bloc[a.id] ?? 0}</span></div>
                  <div className="meter" style={{ height: 10, marginTop: 4 }}><i style={{ width: `${Math.min(100, ((last.bloc[a.id] ?? 0) / 543) * 100)}%`, background: g.parties[a.leader].color }} /><span style={{ position: 'absolute', left: `${(MAJORITY / 543) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--gold)' }} /></div>
                  <div className="tiny dim" style={{ marginTop: 3 }}>{a.members.map((m) => g.parties[m].short).join(' · ')}</div>
                </div>
              ))}
              {!g.alliances.length && <div className="dim small">No pre-poll alliances.</div>}
            </div>
          </Panel>
          <Panel title="What voters are talking about">
            <div className="col" style={{ gap: 6 }}>
              {ISSUES.slice().sort((a, b) => (g.salience[b.id] ?? 0) - (g.salience[a.id] ?? 0)).slice(0, 7).map((i) => (
                <div key={i.id} className="attr"><span className="small">{i.name}</span><div className="meter"><i style={{ width: `${Math.min(1, g.salience[i.id] ?? 0) * 100}%`, background: 'var(--info)' }} /></div></div>
              ))}
            </div>
          </Panel>
          <Panel title="Mood">
            <div className="grid g2">
              <Stat label="Economy" value={g.economy > 0.15 ? 'Upbeat' : g.economy < -0.15 ? 'Gloomy' : 'Mixed'} tone={g.economy > 0.15 ? 'good' : g.economy < -0.15 ? 'bad' : undefined} />
              <Stat label="Govt approval" value={`${Math.round((g.government?.approval ?? 0.5) * 100)}%`} />
            </div>
            <div className="tiny dim" style={{ marginTop: 8 }}>Governing: {g.government ? g.parties[g.government.pmParty]?.short : '—'}</div>
          </Panel>
          {sc.notes.length > 0 && <Panel title="About this scenario">{sc.notes.map((n) => <p key={n} className="small muted" style={{ margin: '0 0 6px' }}>{n}</p>)}</Panel>}
        </div>
      </div>
    </>
  );
}
