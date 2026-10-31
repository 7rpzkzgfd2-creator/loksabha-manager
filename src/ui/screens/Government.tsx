import { useState } from 'react';
import { MAJORITY, ISSUES, POLICY_BY_ID, STATES_LIST, blocTotals, uncommitted, offerValue, lastResult } from '../../engine/index.ts';
import type { GovAction, Issue } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { Meter, PageHead, Panel, PartyChip, Stat, Table, Hemicycle, orderParties } from '../components.tsx';

export function Formation() {
  const g = useGame();
  const { me, run, formationRound, mpInfo } = useStore();
  const [ministries, setMinistries] = useState<Record<string, number>>({});
  const [concession, setConcession] = useState<Record<string, Issue | ''>>({});
  const [pm, setPm] = useState<Record<string, boolean>>({});
  if (g.phase !== 'formation' || !g.formation) return <><PageHead title="Government formation" /><div className="empty">No negotiations under way.</div></>;
  const res = lastResult(g)!;
  const f = g.formation;
  const blocs = blocTotals(g);
  const free = uncommitted(g);
  const mineBloc = f.commitments[me] || me;
  const myTotal = blocs[mineBloc] ?? res.partySeats[me] ?? 0;
  const iLead = mineBloc === me;
  const dots = orderParties(g, res.partySeats).flatMap((p) => Array(res.partySeats[p]).fill(g.parties[p].color));
  return (
    <>
      <PageHead title="Government formation" sub={`Round ${Math.min(f.round, f.maxRounds)} of ${f.maxRounds}. Parties without a bloc will back the offer that suits them best, if any. A bloc needs ${MAJORITY}, or more support than opposition in the confidence vote.`}>
        <button className="btn continue" onClick={formationRound} disabled={!!mpInfo && false}>{f.round >= f.maxRounds ? 'Final round: take the confidence vote' : 'End round'}</button>
      </PageHead>
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Blocs so far">
            {Object.entries(blocs).sort((a, b) => b[1] - a[1]).map(([l, n]) => (
              <div key={l} style={{ marginBottom: 10 }}>
                <div className="row small"><PartyChip g={g} id={l} />-led bloc<span className="mono right" style={{ color: n >= MAJORITY ? 'var(--good)' : undefined }}>{n}</span></div>
                <div className="meter" style={{ height: 10 }}><i style={{ width: `${(n / 543) * 100}%`, background: g.parties[l].color }} /><span style={{ position: 'absolute', left: `${(MAJORITY / 543) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--gold)' }} /></div>
                <div className="tiny dim">{Object.entries(f.commitments).filter(([, x]) => x === l).map(([p]) => `${g.parties[p].short} ${res.partySeats[p] ?? 0}`).join(' · ')}</div>
              </div>
            ))}
          </Panel>
          <Panel title={iLead ? 'Make offers' : 'Your position'} className="flush">
            {!iLead && <div className="small muted" style={{ padding: 16 }}>You are part of the {g.parties[mineBloc].short}-led bloc. Its leader runs the talks.</div>}
            {iLead && (
              <Table rows={free} rowKey={(p) => p} cols={[
                { key: 'p', label: 'Party', render: (p) => <PartyChip g={g} id={p} />, sort: (p) => p },
                { key: 's', label: 'Seats', num: true, render: (p) => res.partySeats[p] ?? 0, sort: (p) => res.partySeats[p] ?? 0 },
                { key: 'm', label: 'Ministries', render: (p) => <input className="input" type="number" min={0} max={8} style={{ width: 60, padding: '3px 6px' }} value={ministries[p] ?? Math.round((res.partySeats[p] ?? 0) / 6)} onChange={(e) => setMinistries({ ...ministries, [p]: +e.target.value })} /> },
                { key: 'c', label: 'Policy promise', render: (p) => <select className="select" style={{ width: 150, padding: '3px 6px' }} value={concession[p] ?? ''} onChange={(e) => setConcession({ ...concession, [p]: e.target.value as Issue })}><option value="">None</option>{ISSUES.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select> },
                { key: 'pm', label: 'PM post', render: (p) => <input type="checkbox" checked={!!pm[p]} onChange={(e) => setPm({ ...pm, [p]: e.target.checked })} /> },
                { key: 'v', label: 'Their read', render: (p) => { const v = offerValue(g, { id: 'x', kind: 'coalition', from: me, to: p, seatsAsked: 0, ministries: ministries[p] ?? Math.round((res.partySeats[p] ?? 0) / 6), concession: concession[p] || undefined, pmPost: !!pm[p], status: 'open', turn: f.round, note: '' }).v; return <span className={v > 0.2 ? 'good' : v > 0 ? 'warn' : 'bad'}>{v > 0.2 ? 'Keen' : v > 0 ? 'Maybe' : 'Unlikely'}</span>; } },
                { key: 'a', label: '', render: (p) => <button className="btn sm" onClick={() => run({ type: 'coalition_offer', to: p, ministries: ministries[p] ?? Math.round((res.partySeats[p] ?? 0) / 6), concession: concession[p] || undefined, pm: !!pm[p] })}>{f.offers.some((o) => o.from === me && o.to === p && o.turn === f.round) ? 'Sent' : 'Send offer'}</button> },
              ]} />
            )}
            {iLead && !free.length && <div className="empty" style={{ margin: 14 }}>Every party has picked a side.</div>}
          </Panel>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="The House"><Hemicycle dots={dots} /><div className="row" style={{ marginTop: 8 }}><Stat label="Your bloc" value={myTotal} tone={myTotal >= MAJORITY ? 'good' : undefined} /><Stat label="Short by" value={Math.max(0, MAJORITY - myTotal)} /></div></Panel>
          <Panel title="Negotiation log">
            <div className="col small" style={{ gap: 6 }}>{f.log.slice().reverse().map((l, i) => <div key={i}>{l}</div>)}{!f.log.length && <div className="dim">Talks are just starting.</div>}</div>
          </Panel>
          <Panel title="Bargaining"><p className="small muted" style={{ margin: 0 }}>Distance in ideology matters more than ministries: some parties cannot be bought. A kingmaker with exactly the seats you need will ask for more. Promises made here are remembered and come due in government.</p></Panel>
        </div>
      </div>
    </>
  );
}

export function Governance() {
  const g = useGame();
  const { me, govYear, nextCycle, toast } = useStore();
  const gov = g.government;
  const [a1, setA1] = useState<string>('');
  const [a2, setA2] = useState<string>('');
  const [notes, setNotes] = useState<string[]>([]);
  if (!gov || g.phase !== 'governance') return <><PageHead title="Government" /><div className="empty">Not in the governance phase.</div></>;
  const inGov = gov.pmParty === me || gov.partners.includes(me);
  const pending = gov.promises.filter((x) => x.status === 'pending');
  const options: { v: string; label: string; act: GovAction }[] = inGov
    ? [...pending.map((x) => ({ v: 'impl:' + x.policy, label: `Implement: ${POLICY_BY_ID[x.policy]?.name} (cost ${POLICY_BY_ID[x.policy]?.cost})`, act: { kind: 'implement', policy: x.policy } as GovAction })),
      ...gov.partners.map((p) => ({ v: 'care:' + p, label: `Keep ${g.parties[p].short} on side`, act: { kind: 'coalition_care', partner: p } as GovAction }))]
    : ISSUES.map((i) => ({ v: 'agit:' + i.id, label: `Agitate on ${i.name.toLowerCase()}`, act: { kind: 'agitate', issue: i.id } as GovAction }));
  options.push(...STATES_LIST.filter((s) => s.seats.length >= 10).map((s) => ({ v: 'org:' + s.code, label: `Rebuild organisation in ${s.name} (₹15 cr)`, act: { kind: 'rebuild', state: s.code, budget: 15 } as GovAction })));
  const pick = (v: string) => options.find((o) => o.v === v)?.act;
  const done = gov.year > 5;
  return (
    <>
      <PageHead title={inGov ? (gov.pmParty === me ? 'In government' : 'Junior partner in government') : 'In opposition'} sub={`Year ${Math.min(gov.year, 5)} of the term. Each year, pick two priorities. Delivery depends on money and administrative capacity; broken promises are remembered at the next election.`}>
        {!done ? <button className="btn continue" onClick={() => { const acts = [pick(a1), pick(a2)].filter(Boolean) as GovAction[]; const n = govYear(acts); setNotes(n); n.forEach((x) => toast(x)); setA1(''); setA2(''); }}>End year {gov.year}</button>
          : <button className="btn continue" onClick={nextCycle}>Begin the next election campaign</button>}
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Panel><Stat label="Government" value={g.parties[gov.pmParty].short} big delta={<span className="dim">{gov.partners.map((p) => g.parties[p].short).join(', ') || 'single party'}</span>} /></Panel>
        <Panel><Stat label="Approval" value={`${Math.round(gov.approval * 100)}%`} big tone={gov.approval < 0.4 ? 'bad' : gov.approval > 0.55 ? 'good' : undefined} /></Panel>
        <Panel><Stat label="Stability" value={`${Math.round(gov.stability * 100)}%`} big /></Panel>
        <Panel><Stat label="Fiscal room" value={gov.fiscalSpace.toFixed(1)} big delta={<span className="dim">admin capacity {Math.round(gov.adminCapacity * 100)}%</span>} /></Panel>
      </div>
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          {!done && (
            <Panel title={`Priorities for year ${gov.year}`} className="glow">
              <div className="grid g2">
                <select className="select" value={a1} onChange={(e) => setA1(e.target.value)}><option value="">First priority…</option>{options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
                <select className="select" value={a2} onChange={(e) => setA2(e.target.value)}><option value="">Second priority…</option>{options.filter((o) => o.v !== a1).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
              </div>
            </Panel>
          )}
          {done && <Panel title="The term is over"><p className="muted">Five years have passed. Your record goes before the voters.</p></Panel>}
          {notes.length > 0 && <Panel title="Last year">{notes.map((n, i) => <div key={i} className="small" style={{ padding: '3px 0' }}>{n}</div>)}</Panel>}
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Promises">
            {gov.promises.map((x) => <div key={x.policy} className="row small" style={{ padding: '3px 0' }}><span className="grow">{POLICY_BY_ID[x.policy]?.name}</span><span className={`chip ${x.status === 'kept' ? 'good' : x.status === 'broken' ? 'bad' : x.status === 'partial' ? 'warn' : ''}`}>{x.status}</span></div>)}
            {!gov.promises.length && <div className="dim small">No manifesto promises on record.</div>}
          </Panel>
          <Panel title="Partners">
            {gov.partners.map((p) => <div key={p} className="row small" style={{ padding: '3px 0' }}><PartyChip g={g} id={p} /><span className="grow" /><span className="dim">ministries {gov.ministries[p] ?? 0}</span><div style={{ width: 70 }}><Meter v={(g.relations[p]?.[gov.pmParty] ?? 0) / 2 + 0.5} /></div></div>)}
            {!gov.partners.length && <div className="dim small">None.</div>}
          </Panel>
        </div>
      </div>
    </>
  );
}

export function Career() {
  const g = useGame();
  const { me, quit } = useStore();
  const p = g.parties[me];
  return (
    <>
      <PageHead title="Career history" sub={`${p.leader} and the ${p.name}.`}>{g.phase === 'ended' && <button className="btn" onClick={quit}>Back to main menu</button>}</PageHead>
      {g.phase === 'ended' && <Panel className="glow" style={{ marginBottom: 14 }}><b>This quick election is over.</b> <span className="muted">Start a Career game to carry results into later elections.</span></Panel>}
      <div className="grid g-main">
        <Panel title="Elections" className="flush">
          <Table rows={g.career} rowKey={(c) => String(c.cycle)} cols={[
            { key: 'y', label: 'Year', render: (c) => c.year },
            { key: 's', label: 'Seats', num: true, render: (c) => c.seats },
            { key: 'v', label: 'Vote %', num: true, render: (c) => (c.voteShare * 100).toFixed(1) },
            { key: 'o', label: 'Outcome', render: (c) => <span className={c.inGovernment ? 'good' : ''}>{c.outcome}</span> },
          ]} />
          {!g.career.length && <div className="empty" style={{ margin: 14 }}>No elections fought yet.</div>}
        </Panel>
        <Panel title="Milestones">
          {g.milestones.map((m) => <div key={m.id} className="row small" style={{ padding: '4px 0' }}><span style={{ color: 'var(--gold)' }}>★</span><span className="grow">{m.title}</span><span className="dim">{g.results.find((r) => r.cycle === m.cycle)?.year}</span></div>)}
          {!g.milestones.length && <div className="dim small">None yet. Win a seat.</div>}
        </Panel>
      </div>
    </>
  );
}
