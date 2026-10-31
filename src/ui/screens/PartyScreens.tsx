import { useMemo, useState } from 'react';
import { STATES_LIST, STATE_BY_CODE, ISSUES, STAFF_ROLE_NAME, STAFF_ROLES, aspirants, market, candidateAppeal, candidateFit, ACTIONS, teamCapacity, leaderDays } from '../../engine/index.ts';
import type { ActionType } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { Attr, Confirm, FitNum, IssueChips, Meter, PageHead, Panel, Prov, Stat, Symbol, Table, attr20, AttrColor, fmtCr, Seg } from '../components.tsx';
import { CandidateCard } from './SeatDetail.tsx';
import { ratingFor, RATING_COLOR } from '../derive.ts';

export function PartyScreen() {
  const g = useGame();
  const { me, run } = useStore();
  const p = g.parties[me];
  const [cent, setCent] = useState(p.stats.leaderCentrality);
  const orgRows = useMemo(() => STATES_LIST.map((s) => {
    const cs = g.seats.filter((c) => c.state === s.code);
    return { s, org: cs.reduce((a, c) => a + (c.org[me] ?? 0), 0) / cs.length, contest: cs.filter((c) => c.candidates[me]).length, n: cs.length };
  }).filter((r) => r.contest > 0 || r.org > 0.1), [g, me]);
  const mem = g.memory.filter((m) => m.party === me).slice(-8).reverse();
  return (
    <>
      <PageHead title={p.name} sub={`Led by ${p.leader} (fictional). A party is many people with their own goals; keep them pulling the same way.`}><Prov p={p.provenance} /></PageHead>
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          <Panel>
            <div className="row" style={{ gap: 16 }}>
              <Symbol p={p} size={64} />
              <div className="grow"><div className="display" style={{ fontSize: 24, fontWeight: 700 }}>{p.short}</div><div className="muted">{p.national ? 'National party' : 'Regional party'} · {p.leaderStyle} leadership · home: {p.homeStates.map((h) => STATE_BY_CODE[h]?.name).join(', ') || '—'}</div></div>
            </div>
            <div className="grid g4" style={{ marginTop: 16 }}>
              <Stat label="Leader standing" value={attr20(p.stats.leaderPop)} />
              <Stat label="Unity" value={`${Math.round(p.stats.cohesion * 100)}%`} tone={p.stats.cohesion < 0.5 ? 'bad' : undefined} />
              <Stat label="Public trust" value={`${Math.round(p.stats.trust * 100)}%`} />
              <Stat label="Volunteer morale" value={`${Math.round(p.stats.volunteerMorale * 100)}%`} />
              <Stat label="Machine" value={attr20(p.stats.organisation)} />
              <Stat label="Media presence" value={attr20(p.stats.media)} />
              <Stat label="Fiscal credibility" value={attr20(p.stats.fiscalCredibility)} />
              <Stat label="Weekly capacity" value={`${leaderDays(p)}d · ${teamCapacity(p)}t`} />
            </div>
          </Panel>
          <Panel title="Factions">
            <div className="col">
              {p.factions.map((f) => (
                <div key={f.id} className="row" style={{ alignItems: 'flex-start', gap: 14, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                  <div style={{ width: 180 }}><b className="small">{f.name}</b><div className="tiny dim">{f.outlook} · {Math.round(f.strength * 100)}% of the party</div></div>
                  <div className="grow"><Meter v={f.satisfaction} color={f.satisfaction < 0.45 ? 'var(--bad)' : f.satisfaction < 0.6 ? 'var(--warn)' : 'var(--good)'} /><div className="tiny dim" style={{ marginTop: 4 }}>{f.grievances.length ? `Grievances: ${f.grievances.join('; ')}` : 'No open grievances.'}</div></div>
                  <span className="mono small">{Math.round(f.satisfaction * 100)}%</span>
                </div>
              ))}
            </div>
            <p className="tiny dim">Ceding seats to allies upsets regional leaders. Outsider tickets upset loyalists. Dropping sitting MPs angers their faction and can create rebels.</p>
          </Panel>
          <Panel title="Organisation by state" className="flush">
            <Table rows={orgRows} rowKey={(r) => r.s.code} initialSort={['o', -1]} cols={[
              { key: 'n', label: 'State', render: (r) => r.s.name, sort: (r) => r.s.name },
              { key: 'c', label: 'Contesting', num: true, render: (r) => `${r.contest}/${r.n}`, sort: (r) => r.contest },
              { key: 'o', label: 'Organisation', render: (r) => <div className="row" style={{ width: 160 }}><div className="grow"><Meter v={r.org} /></div><span className="mono small">{Math.round(r.org * 100)}</span></div>, sort: (r) => r.org },
            ]} />
          </Panel>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Shape of the campaign">
            <div className="row small"><span>Local faces</span><span className="right">Leader-led</span></div>
            <input type="range" min={0.1} max={0.95} step={0.05} value={cent} onChange={(e) => setCent(+e.target.value)} disabled={g.stage !== 'preparation'} />
            <p className="small muted">{cent > 0.6 ? `Everything rides on ${p.leader}. Good if voters like the leader; regional bosses feel sidelined.` : cent < 0.35 ? 'Regional leaders and candidates front the campaign. Less national lift, happier local units.' : 'A balance of national and local.'}</p>
            <button className="btn sm" disabled={g.stage !== 'preparation' || Math.abs(cent - p.stats.leaderCentrality) < 0.01} onClick={() => run({ type: 'set_centrality', value: cent })}>Apply</button>
            {g.stage !== 'preparation' && <div className="tiny dim">Can only be changed during preparation.</div>}
          </Panel>
          <Panel title="Issue credibility">
            <div className="col" style={{ gap: 6 }}>
              {ISSUES.slice().sort((a, b) => p.issueOwn[b.id] - p.issueOwn[a.id]).map((i) => <div key={i.id} className="attr"><span className="small">{i.name}</span><span className="attr-num" style={{ color: AttrColor(attr20(p.issueOwn[i.id])), background: '#0b1017' }}>{attr20(p.issueOwn[i.id])}</span></div>)}
            </div>
            <p className="tiny dim">Messages on issues you are trusted on land better. Credibility moves slowly.</p>
          </Panel>
          <Panel title="The party remembers">
            {mem.length ? <div className="col small">{mem.map((m) => <div key={m.id}><span className="dim mono">W{m.turn}</span> {m.text}</div>)}</div> : <div className="dim small">Nothing yet.</div>}
          </Panel>
        </div>
      </div>
    </>
  );
}

export function Candidates() {
  const g = useGame();
  const { me, run, openSeat } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'marginal' | 'weak' | 'unvetted' | 'misfit'>('marginal');
  const rows = useMemo(() => g.seats.filter((c) => c.candidates[me]).filter((c) => {
    const pr = g.seatForecast[c.id]?.probs[me] ?? 0;
    if (filter === 'marginal') return pr > 0.2 && pr < 0.8;
    if (filter === 'weak') return candidateAppeal(c, me) < 0.45;
    if (filter === 'unvetted') return !c.candidates[me].vetted;
    if (filter === 'misfit') return candidateFit(g, c, c.candidates[me]).seatFit < -0.05;
    return true;
  }), [g, me, filter]);
  const c = sel ? g.seats.find((x) => x.id === sel) : null;
  const prep = g.stage === 'preparation' && g.phase === 'campaign';
  return (
    <>
      <PageHead title="Candidates" sub={prep ? 'Tickets are open until the end of week 2. Popular outsiders win votes but upset loyalists; loyal organisers keep the party calm.' : 'Tickets are locked for this election.'}>
        <Seg value={filter} onChange={setFilter} options={[{ v: 'marginal', label: 'Marginal seats' }, { v: 'weak', label: 'Weak candidates' }, { v: 'unvetted', label: 'Unvetted' }, { v: 'misfit', label: 'Poor issue fit' }, { v: 'all', label: 'All' }]} />
      </PageHead>
      <div className="grid g-main">
        <Panel className="flush">
          <div style={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}>
            <Table rows={rows} rowKey={(r) => r.id} selected={sel} onRow={(r) => setSel(r.id)} max={200} initialSort={['p', -1]} cols={[
              { key: 'n', label: 'Seat', render: (r) => <b>{r.name}</b>, sort: (r) => r.name },
              { key: 's', label: 'State', render: (r) => r.state, sort: (r) => r.state },
              { key: 'k', label: 'Candidate', render: (r) => <>{r.candidates[me].name}{r.candidates[me].real && <span className="chip info" style={{ marginLeft: 6 }}>Real</span>}</>, sort: (r) => r.candidates[me].name },
              { key: 'i', label: 'Issues', render: (r) => <IssueChips strong={r.candidates[me].strong} weak={r.candidates[me].weak} max={2} /> },
              { key: 'sf', label: 'State fit', num: true, render: (r) => <FitNum v={candidateFit(g, r, r.candidates[me]).stateFit} />, sort: (r) => candidateFit(g, r, r.candidates[me]).stateFit },
              { key: 'cf', label: 'Seat fit', num: true, render: (r) => <FitNum v={candidateFit(g, r, r.candidates[me]).seatFit} />, sort: (r) => candidateFit(g, r, r.candidates[me]).seatFit },
              { key: 'a', label: 'Appeal', num: true, render: (r) => <span style={{ color: AttrColor(attr20(candidateAppeal(r, me))) }}>{attr20(candidateAppeal(r, me))}</span>, sort: (r) => candidateAppeal(r, me) },
              { key: 'v', label: 'Vetted', render: (r) => r.candidates[me].vetted ? (r.candidates[me].controversy > 0.4 ? <span className="chip warn">Risk</span> : <span className="chip good">Clear</span>) : <span className="dim">No</span> },
              { key: 'r', label: 'Rating', render: (r) => { const x = ratingFor(g, r, me); return <span style={{ color: RATING_COLOR[x] }}>{x}</span>; } },
              { key: 'p', label: 'Win %', num: true, render: (r) => Math.round((g.seatForecast[r.id]?.probs[me] ?? 0) * 100), sort: (r) => g.seatForecast[r.id]?.probs[me] ?? 0 },
            ]} />
          </div>
        </Panel>
        <div className="col" style={{ gap: 14 }}>
          {!c ? <Panel><div className="empty">Pick a seat to review the ticket.</div></Panel> : (
            <>
              <Panel title={<>{c.name} <span className="dim">· {STATE_BY_CODE[c.state].name}</span></>} extra={<button className="btn sm ghost" onClick={() => openSeat(c.id)}>Seat detail ›</button>}>
                <div className="upper" style={{ marginBottom: 6 }}>Current candidate</div>
                <CandidateCard k={c.candidates[me]} own fit={candidateFit(g, c, c.candidates[me])} />
              </Panel>
              {prep && (
                <Panel title="Aspirants for the ticket">
                  <div className="col">
                    {aspirants(g, c.id, me).map((k, i) => (
                      <div key={k.id} className="col" style={{ gap: 6 }}>
                        <CandidateCard k={k} own fit={candidateFit(g, c, k)} />
                        <button className="btn sm" onClick={() => run({ type: 'pick_candidate', seat: c.id, index: i })}>Give {k.name.split(' ')[0]} the ticket</button>
                      </div>
                    ))}
                  </div>
                  <p className="tiny dim">Integrity stays hidden until you commission research in the state.</p>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function Staff() {
  const g = useGame();
  const { me, run } = useStore();
  const p = g.parties[me];
  const [fire, setFire] = useState<string | null>(null);
  const pool = market(g);
  const [role, setRole] = useState<string>('');
  return (
    <>
      <PageHead title="Staff" sub="Good people make every action work better, but overloaded or unhappy staff make mistakes and quit. Salaries come out of the war chest every week." />
      <div className="grid g-main">
        <Panel title={`Your team (${p.staff.length}/14)`} className="flush">
          <Table rows={p.staff} rowKey={(s) => s.id} cols={[
            { key: 'n', label: 'Name', render: (s) => <b>{s.name}</b>, sort: (s) => s.name },
            { key: 'r', label: 'Role', render: (s) => STAFF_ROLE_NAME[s.role], sort: (s) => s.role },
            { key: 'k', label: 'Ability', num: true, render: (s) => <span style={{ color: AttrColor(attr20(s.skill / 100)) }}>{attr20(s.skill / 100)}</span>, sort: (s) => s.skill },
            { key: 't', label: 'Trait', render: (s) => <span className="small muted">{s.trait}</span> },
            { key: 'm', label: 'Morale', render: (s) => <div style={{ width: 70 }}><Meter v={s.morale} color={s.morale < 0.4 ? 'var(--bad)' : undefined} /></div>, sort: (s) => s.morale },
            { key: 'w', label: 'Load', num: true, render: (s) => <span className={s.workload > 6 ? 'bad' : ''}>{s.workload}</span>, sort: (s) => s.workload },
            { key: 'sal', label: 'Weekly', num: true, render: (s) => s.salary.toFixed(2), sort: (s) => s.salary },
            { key: 'a', label: '', render: (s) => (
              <div className="row">
                {s.role === 'regional_coordinator' && <select className="select" style={{ width: 120, padding: '3px 6px' }} value={s.assignedState ?? ''} onChange={(e) => run({ type: 'assign_staff', id: s.id, state: e.target.value })}>{STATES_LIST.map((x) => <option key={x.code} value={x.code}>{x.code}</option>)}</select>}
                <button className="btn sm danger" onClick={() => setFire(s.id)}>Release</button>
              </div>) },
          ]} />
          {!p.staff.length && <div className="empty" style={{ margin: 14 }}>No staff. Hire from the market.</div>}
        </Panel>
        <Panel title="Available this week" extra={<select className="select" style={{ width: 170 }} value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{STAFF_ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}>
          <div className="col" style={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
            {pool.map((s, i) => ({ s, i })).filter(({ s }) => !role || s.role === role).map(({ s, i }) => (
              <div key={s.id} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="attr-num" style={{ color: AttrColor(attr20(s.skill / 100)), background: '#0b1017' }}>{attr20(s.skill / 100)}</span>
                <div className="grow"><b className="small">{s.name}</b><div className="tiny dim">{STAFF_ROLE_NAME[s.role]} · {s.trait} · ₹{s.salary}/wk</div></div>
                <button className="btn sm" onClick={() => run({ type: 'hire_staff', index: i })}>Hire ₹{(s.salary * 3).toFixed(1)}</button>
              </div>
            ))}
          </div>
          <p className="tiny dim">{STAFF_ROLES.find((r) => r.id === role)?.desc ?? 'The market refreshes every week.'}</p>
        </Panel>
      </div>
      {fire && <Confirm text={`Release ${p.staff.find((s) => s.id === fire)?.name}? Severance is two weeks' salary and the rest of the team will notice.`} yes="Release" onYes={() => { run({ type: 'fire_staff', id: fire }); setFire(null); }} onNo={() => setFire(null)} />}
    </>
  );
}

export function Finances() {
  const g = useGame();
  const { me } = useStore();
  const p = g.parties[me];
  const mine = g.outcomes.filter((o) => o.party === me);
  const byType: Partial<Record<ActionType, number>> = {};
  for (const o of mine) byType[o.type] = (byType[o.type] ?? 0) + o.cost;
  const byWeek = new Map<number, number>();
  for (const o of mine) byWeek.set(o.turn, (byWeek.get(o.turn) ?? 0) + o.cost);
  const total = mine.reduce((a, o) => a + o.cost, 0);
  const payroll = p.staff.reduce((a, s) => a + s.salary, 0);
  const left = Math.max(1, g.config.campaignTurns - g.campaignTurn + 1);
  const weeks = [...byWeek.entries()].sort((a, b) => a[0] - b[0]);
  const maxW = Math.max(1, ...weeks.map((w) => w[1]));
  const shadowIn = g.shadow.filter((d) => d.party === me && d.kind === 'funding').reduce((a, d) => a + d.amount, 0);
  return (
    <>
      <PageHead title="Finances" sub="Campaign money is finite. Spending in one state is money not spent in another." />
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Panel><Stat label="War chest" value={fmtCr(p.stats.funds)} big tone={p.stats.funds < 0 ? 'bad' : undefined} /></Panel>
        <Panel><Stat label="Spent this election" value={fmtCr(total)} big /></Panel>
        <Panel><Stat label="Weekly payroll" value={fmtCr(payroll)} big /></Panel>
        <Panel><Stat label="Per remaining week" value={fmtCr(p.stats.funds / left)} big delta={<span className="dim">{left} weeks left</span>} /></Panel>
      </div>
      <div className="grid g2">
        <Panel title="Spending by activity">
          <div className="col" style={{ gap: 8 }}>
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, v]) => <div key={t} className="row small"><span style={{ width: 160 }}>{ACTIONS[t as ActionType].name}</span><div className="grow"><Meter v={v} max={total} /></div><span className="mono" style={{ width: 80, textAlign: 'right' }}>{fmtCr(v)}</span></div>)}
            {!total && <div className="dim small">Nothing spent yet.</div>}
          </div>
        </Panel>
        <Panel title="Weekly spend">
          <div className="row" style={{ alignItems: 'flex-end', height: 140, gap: 8 }}>
            {weeks.map(([w, v]) => <div key={w} className="col center" style={{ flex: 1, gap: 4 }}><span className="tiny mono">{v.toFixed(0)}</span><div style={{ height: (v / maxW) * 100, background: 'var(--accent)', borderRadius: 4 }} /><span className="tiny dim">W{w}</span></div>)}
            {!weeks.length && <div className="dim small">No spending yet.</div>}
          </div>
        </Panel>
        <Panel title="Income">
          <div className="small muted">Donations arrive every week. They rise with momentum and media presence, and a finance manager helps. Base: {fmtCr(p.stats.income)} a week.</div>
          {shadowIn > 0 && <div className="small warn" style={{ marginTop: 8 }}>Off-the-books money taken: {fmtCr(shadowIn)}. It is not in any declared account.</div>}
        </Panel>
        <Panel title="Rules in this scenario">
          <div className="small muted">Spending is tracked at party level and abstracted. Real candidate expenditure ceilings set by the Election Commission are not modelled seat by seat, though heavy spending raises the chance of official scrutiny.</div>
        </Panel>
      </div>
    </>
  );
}
