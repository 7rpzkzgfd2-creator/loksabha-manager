import { MAJORITY, SCENARIO_BY_ID } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { MiniHemicycle, Panel, PartyChip, Stat, fmtCr, PageHead } from '../components.tsx';
import { recommendations } from '../derive.ts';

const IMP = { critical: 'var(--bad)', high: 'var(--warn)', normal: 'var(--info)', low: 'var(--line2)' };

export default function Home() {
  const g = useGame();
  const { me, go } = useStore();
  const p = g.parties[me];
  const last = g.polls[g.polls.length - 1];
  const prev = g.polls[g.polls.length - 2];
  const seats = Object.fromEntries(Object.entries(last.seats).map(([k, v]) => [k, v[1]]));
  const proj = last.seats[me];
  const delta = prev ? proj[1] - prev.seats[me][1] : 0;
  const mail = g.inbox.filter((m) => m.party === me).slice(0, 7);
  const recs = recommendations(g, me).slice(0, 4);
  const sc = SCENARIO_BY_ID[g.config.scenarioId];
  const a = g.alliances.find((x) => x.members.includes(me));
  const left = g.config.campaignTurns - g.campaignTurn;
  const topRivals = Object.entries(seats).filter(([k]) => k !== me && k !== 'OTH').sort((x, y) => y[1] - x[1]).slice(0, 4);

  return (
    <>
      <PageHead title={<>{p.short} campaign office</>} sub={g.phase === 'campaign' ? `${sc.title}. ${left > 0 ? `${left} week${left > 1 ? 's' : ''} to polling day.` : 'Polling day is next.'} ${g.stage === 'preparation' ? 'Tickets, manifesto and alliances lock at the end of week 2.' : ''}` : `Phase: ${g.phase}.`} />
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          {g.turnSummary.length > 0 && (
            <Panel title="Since last week" className="glow">
              <ul style={{ margin: 0, paddingLeft: 18 }} className="col">{g.turnSummary.map((s, i) => <li key={i} className={i === 0 ? '' : 'muted'}>{s}</li>)}</ul>
            </Panel>
          )}
          <Panel title="Inbox" extra={<button className="btn sm ghost" onClick={() => go('inbox')}>Open inbox ›</button>} className="flush">
            {mail.length === 0 && <div className="empty" style={{ margin: 14 }}>No messages.</div>}
            {mail.map((m) => (
              <div key={m.id} className={`msg ${m.read ? '' : 'unread'}`} onClick={() => go(m.kind === 'event' ? 'events' : 'inbox')}>
                <span className="imp" style={{ background: IMP[m.importance] }} />
                <div className="ellipsis"><div className="subj ellipsis">{m.subject}</div><div className="tiny dim">{m.from} · week {m.turn}</div></div>
              </div>
            ))}
          </Panel>
          <Panel title="War room says" extra={<button className="btn sm ghost" onClick={() => go('warroom')}>All advice ›</button>}>
            <div className="col">
              {recs.length === 0 && <div className="dim">Nothing urgent. A good week to think long-term.</div>}
              {recs.map((r, i) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start', cursor: r.go ? 'pointer' : undefined }} onClick={() => r.go && go(r.go)}>
                  <span className={`chip ${r.sev === 'critical' ? 'bad' : r.sev === 'high' ? 'warn' : 'info'}`}>{r.sev}</span>
                  <div className="grow"><b className="small">{r.title}</b><div className="small muted">{r.why}</div></div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Seat projection" extra={<span className="badge-prov">Simulated</span>}>
            <MiniHemicycle g={g} seats={seats} />
            <div className="row" style={{ marginTop: 8 }}>
              <Stat label={p.short} value={proj[1]} big delta={<span className={delta >= 0 ? 'good' : 'bad'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} · range {proj[0]}–{proj[2]}</span>} tone={proj[1] >= MAJORITY ? 'good' : undefined} />
              {a && <div className="right"><Stat label={a.name} value={last.bloc[a.id] ?? 0} delta={<span className="dim">bloc median</span>} /></div>}
            </div>
            <div className="col" style={{ gap: 6, marginTop: 10 }}>
              {topRivals.map(([k, v]) => <div key={k} className="row small"><PartyChip g={g} id={k} /><span className="mono right">{v}</span></div>)}
            </div>
          </Panel>
          <Panel title="Party at a glance">
            <div className="grid g2" style={{ gap: 12 }}>
              <Stat label="War chest" value={fmtCr(p.stats.funds)} />
              <Stat label="Leader standing" value={`${Math.round(p.stats.leaderPop * 100)}`} />
              <Stat label="Unity" value={`${Math.round(p.stats.cohesion * 100)}%`} tone={p.stats.cohesion < 0.5 ? 'bad' : undefined} />
              <Stat label="Momentum" value={p.stats.momentum > 0.05 ? 'Rising' : p.stats.momentum < -0.05 ? 'Falling' : 'Flat'} tone={p.stats.momentum > 0.05 ? 'good' : p.stats.momentum < -0.05 ? 'bad' : undefined} />
            </div>
          </Panel>
          <Panel title="Calendar">
            <div className="col small">
              {Array.from({ length: g.config.campaignTurns }, (_, i) => i + 1).map((w) => (
                <div key={w} className="row" style={{ opacity: w < g.campaignTurn ? 0.4 : 1 }}>
                  <span className="mono" style={{ width: 34, color: w === g.campaignTurn ? 'var(--accent)' : undefined }}>W{w}</span>
                  <span className="grow">{w <= 2 ? 'Preparation: tickets, manifesto, alliances' : w >= g.config.campaignTurns - 1 ? 'Final push' : 'Campaign'}{w === 2 ? ' · locks at end of week' : ''}</span>
                  {w === g.campaignTurn && <span className="chip info">Now</span>}
                </div>
              ))}
              <div className="row"><span className="mono" style={{ width: 34 }}>★</span><span>Polling day and counting</span></div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
