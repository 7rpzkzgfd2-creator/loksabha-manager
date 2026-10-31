import { useMemo, useState } from 'react';
import { POLICIES, POLICY_BY_ID, ISSUE_NAME, SEGMENTS, MAX_POLICIES, overlap, evaluateAlliance, allianceWindowOpen } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { Confirm, Meter, PageHead, Panel, PartyChip, Prov, Table } from '../components.tsx';

export function Manifesto() {
  const g = useGame();
  const { me, run } = useStore();
  const p = g.parties[me];
  const [picked, setPicked] = useState<string[]>(p.manifesto.policies);
  const locked = p.manifesto.locked;
  const cost = picked.reduce((a, id) => a + (POLICY_BY_ID[id]?.cost ?? 0), 0);
  const appeal = useMemo(() => SEGMENTS.map((s) => ({ s, v: picked.reduce((a, id) => a + (POLICY_BY_ID[id]?.appeal[s.id] ?? 0), 0) })), [picked]);
  const clash = (id: string) => { const pol = POLICY_BY_ID[id]; return Math.abs(pol.econ - p.ideology.econ) + Math.abs(pol.social - p.ideology.social) > 1; };
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length < MAX_POLICIES ? [...x, id] : x));
  const dirty = picked.join() !== p.manifesto.policies.join();
  return (
    <>
      <PageHead title="Manifesto" sub={locked ? 'Locked for this election. You can still add a promise through "Announce a policy" in the planner, at a credibility cost.' : `Choose up to ${MAX_POLICIES} headline promises. Promises only move voters as far as they are believed, and every promise is remembered if you win.`}>
        {!locked && <button className="btn primary" disabled={!dirty} onClick={() => run({ type: 'set_manifesto', policies: picked })}>Save manifesto</button>}
      </PageHead>
      <div className="grid g-main">
        <div className="grid g2" style={{ alignContent: 'start' }}>
          {POLICIES.map((pol) => {
            const on = picked.includes(pol.id);
            return (
              <button key={pol.id} className="opt" disabled={locked} style={{ borderColor: on ? 'var(--accent)' : undefined, background: on ? '#121b26' : undefined }} onClick={() => toggle(pol.id)}>
                <div className="row"><b>{pol.name}</b>{on && <span className="chip good right">In</span>}</div>
                <span className="tiny dim">{ISSUE_NAME[pol.issue]} · fiscal cost {'●'.repeat(pol.cost)}{'○'.repeat(5 - pol.cost)}</span>
                <span className="small muted">{pol.desc}</span>
                {clash(pol.id) && <span className="risk">Clashes with your party's known positions.</span>}
              </button>
            );
          })}
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Credibility" className="glow">
            <div className="row"><span className="mono" style={{ fontSize: 30 }}>{Math.round(p.manifesto.credibility * 100)}%</span><span className="dim small">saved manifesto</span></div>
            <Meter v={p.manifesto.credibility} />
            <p className="small muted">Falls with clashing promises, contradictions between promises and an unaffordable total. A policy adviser and public trust raise it.</p>
            <div className="row small"><span>Total fiscal weight</span><span className={`mono right ${cost > 6 + p.stats.fiscalCredibility * 8 ? 'bad' : ''}`}>{cost}</span></div>
            <div className="tiny dim">The party is trusted with roughly {Math.round(6 + p.stats.fiscalCredibility * 8)} points before voters start asking how it adds up.</div>
          </Panel>
          <Panel title="Who it speaks to">
            {appeal.sort((a, b) => b.v - a.v).map(({ s, v }) => (
              <div key={s.id} className="row small" style={{ padding: '3px 0' }}><span className="grow">{s.name}</span><span className={v > 0.5 ? 'good' : v < -0.2 ? 'bad' : 'muted'}>{v > 1 ? 'Strongly' : v > 0.5 ? 'Appeals' : v < -0.2 ? 'Alienates' : 'Neutral'}</span></div>
            ))}
            <p className="tiny dim">Direction only. The real effect varies seat by seat with local priorities and your credibility.</p>
          </Panel>
          <Panel title="Rival manifestos">
            {Object.values(g.parties).filter((x) => x.id !== me && x.manifesto.policies.length && (x.national || x.seatsPrev > 10)).slice(0, 5).map((x) => (
              <div key={x.id} className="small" style={{ marginBottom: 8 }}><PartyChip g={g} id={x.id} /> <span className="muted">{x.manifesto.policies.map((id) => POLICY_BY_ID[id]?.name).join(' · ')}</span></div>
            ))}
            {g.campaignTurn <= 1 && <div className="dim small">Rivals publish their manifestos as the campaign starts.</div>}
          </Panel>
        </div>
      </div>
    </>
  );
}

export function Alliances() {
  const g = useGame();
  const { me, run } = useStore();
  const [target, setTarget] = useState<string | null>(null);
  const [seats, setSeats] = useState(0);
  const [leave, setLeave] = useState(false);
  const open = allianceWindowOpen(g);
  const mine = g.alliances.find((a) => a.members.includes(me));
  const rows = useMemo(() => g.partyOrder.filter((p) => p !== me && p !== 'OTH').map((p) => ({ p, ...overlap(g, me, p), rel: g.relations[me]?.[p] ?? 0, in: g.alliances.find((a) => a.members.includes(p)) })), [g, me]);
  const t = target ? rows.find((r) => r.p === target) : null;
  const verdict = t && open ? evaluateAlliance(g, me, t.p, seats) : null;
  const props = g.proposals.filter((x) => (x.to === me || x.from === me) && x.kind === 'alliance' && x.status === 'open');
  return (
    <>
      <PageHead title="Alliances" sub={open ? 'Seat-sharing is open until the end of week 2. Partners stand down for each other, but their supporters only partly follow: some abstain or vote elsewhere.' : 'Seat-sharing is locked for this election.'}>
        {mine && open && <button className="btn danger" onClick={() => setLeave(true)}>Leave the {mine.name}</button>}
      </PageHead>
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          {g.alliances.map((a) => (
            <Panel key={a.id} title={<>{a.name} {a.members.includes(me) && <span className="chip info">Yours</span>}</>} extra={<span className="small">Trust <b className="mono">{Math.round(a.trust * 100)}%</b></span>}>
              <div className="row wrap">{a.members.map((m) => <span key={m} className="chip"><PartyChip g={g} id={m} /> <span className="mono dim">{Object.values(a.seatAlloc).filter((x) => x === m).length}</span></span>)}</div>
              <div className="tiny dim" style={{ marginTop: 8 }}>Numbers are seats each member contests for the alliance. {a.friendlyFights.length ? `Friendly fights in: ${a.friendlyFights.join(', ')}.` : ''} {a.preset ? <Prov p="estimate" /> : null}</div>
            </Panel>
          ))}
          <Panel title="Possible partners" className="flush">
            <Table rows={rows} rowKey={(r) => r.p} selected={target} onRow={(r) => { setTarget(r.p); setSeats(r.fairB); }} initialSort={['sh', -1]} cols={[
              { key: 'p', label: 'Party', render: (r) => <PartyChip g={g} id={r.p} />, sort: (r) => r.p },
              { key: 'sh', label: 'Shared seats', num: true, render: (r) => r.shared, sort: (r) => r.shared },
              { key: 'f', label: 'Their fair share', num: true, render: (r) => r.fairB, sort: (r) => r.fairB },
              { key: 'r', label: 'Relations', num: true, render: (r) => <span className={r.rel > 0.2 ? 'good' : r.rel < -0.1 ? 'bad' : ''}>{r.rel > 0 ? '+' : ''}{(r.rel * 100).toFixed(0)}</span>, sort: (r) => r.rel },
              { key: 'a', label: 'Current bloc', render: (r) => r.in ? r.in.name : <span className="dim">Unaligned</span> },
            ]} />
          </Panel>
        </div>
        <div className="col" style={{ gap: 14 }}>
          {props.length > 0 && (
            <Panel title="Offers on the table" className="glow">
              {props.map((x) => {
                const other = x.from === me ? x.to : x.from;
                return <div key={x.id} className="col" style={{ gap: 6 }}><div className="small"><PartyChip g={g} id={other} /> would contest <b>{x.seatsAsked}</b> shared seats.</div><div className="row"><button className="btn sm primary" onClick={() => run({ type: 'respond_proposal', id: x.id, accept: true })}>Accept</button><button className="btn sm" onClick={() => run({ type: 'respond_proposal', id: x.id, accept: false })}>Decline</button></div></div>;
              })}
            </Panel>
          )}
          <Panel title={t ? <>Talks with <PartyChip g={g} id={t.p} full /></> : 'Open talks'}>
            {!t ? <div className="empty">Pick a party to see what a deal would look like.</div> : (
              <div className="col">
                <div className="small muted">You both have a real base in <b>{t.shared}</b> seats. By local strength they would expect about <b>{t.fairB}</b> of them.</div>
                <div className="field"><label>Seats you offer them: {seats} of {t.shared}</label><input type="range" min={0} max={Math.max(0, t.shared)} value={seats} onChange={(e) => setSeats(+e.target.value)} disabled={!open} /></div>
                {verdict && (
                  <div className="panel" style={{ background: '#0b1017' }}>
                    <div className="upper" style={{ marginBottom: 6 }}>Their likely reaction</div>
                    <b className={verdict.score > 0.15 ? 'good' : verdict.score > -0.05 ? 'warn' : 'bad'}>{verdict.score > 0.15 ? 'Interested' : verdict.score > -0.05 ? 'On the fence' : 'Cold'}</b>
                    <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{verdict.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                )}
                <p className="tiny dim">Giving seats away upsets your regional leaders and local aspirants, who may run as rebels. An alliance can still cost you if your voters dislike the partner.</p>
                <button className="btn primary" disabled={!open} onClick={() => run({ type: 'propose_alliance', to: t.p, seats })}>Propose alliance</button>
              </div>
            )}
          </Panel>
        </div>
      </div>
      {leave && mine && <Confirm text={`Walk out of the ${mine.name}? Former partners will remember it, and you will face them as rivals in seats you shared.`} yes="Leave alliance" onYes={() => { run({ type: 'leave_alliance' }); setLeave(false); }} onNo={() => setLeave(false)} />}
    </>
  );
}
