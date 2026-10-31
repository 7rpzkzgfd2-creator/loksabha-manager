import { useMemo, useState } from 'react';
import { ACTIONS, ISSUES, POLICIES, STATES_LIST, STATE_BY_CODE, actionCost, estimate, limits, usage, newActionId, poachQuote, FUNDING_RANGE } from '../../engine/index.ts';
import type { ActionType, CampaignAction, Issue } from '../../engine/index.ts';
import { makeRng } from '../../engine/rng.ts';
import { useGame, useStore } from '../store.tsx';
import { Confirm, Meter, PageHead, Panel, PartyChip, Table, fmtCr } from '../components.tsx';

const ORDER: ActionType[] = ['rally', 'town_hall', 'door_to_door', 'roadshow', 'digital', 'press_conference', 'org_build', 'volunteer_drive', 'research', 'policy_announce'];

export function Campaign() {
  const g = useGame();
  const { me, queue, run, openSeat } = useStore();
  const p = g.parties[me];
  const [type, setType] = useState<ActionType>('rally');
  const [stateCode, setStateCode] = useState(p.homeStates[0] ?? 'UP');
  const [seat, setSeat] = useState('');
  const [issue, setIssue] = useState<Issue>('jobs');
  const [speaker, setSpeaker] = useState<'leader' | 'candidate'>('leader');
  const [budget, setBudget] = useState(10);
  const [policy, setPolicy] = useState('');
  const spec = ACTIONS[type];
  const queued = g.queued[me] ?? [];
  const u = usage(g, me, queued);
  const lim = limits(g, me);
  const stateSeats = g.seats.filter((c) => c.state === stateCode);
  const seatId = seat && stateSeats.some((c) => c.id === seat) ? seat : stateSeats.find((c) => c.candidates[me])?.id ?? stateSeats[0]?.id;
  const draft: CampaignAction = { id: 'preview', party: me, type, constituency: spec.scope === 'constituency' ? seatId : undefined, state: spec.scope === 'state' ? stateCode : undefined, issue: spec.needsIssue ? issue : undefined, speaker: type === 'rally' ? speaker : undefined, budget: spec.scalable ? Math.max(spec.scalable[0], Math.min(spec.scalable[1], budget)) : undefined, policy: type === 'policy_announce' ? policy : undefined };
  const est = estimate(g, draft);
  const cost = actionCost(draft, p);
  const lastWeek = g.outcomes.filter((o) => o.party === me && o.turn === g.turn - 1);
  const shortlist = useMemo(() => g.seats.filter((c) => c.candidates[me]).map((c) => ({ c, pr: g.seatForecast[c.id]?.probs[me] ?? 0 })).filter((x) => x.pr > 0.3 && x.pr < 0.7).sort((a, b) => Math.abs(a.pr - 0.5) - Math.abs(b.pr - 0.5)).slice(0, 8), [g, me]);

  if (g.phase !== 'campaign') return <><PageHead title="Campaign planner" /><div className="empty">The campaign is over.</div></>;

  const add = (a: Omit<CampaignAction, 'party'>) => queue({ ...a, id: newActionId(makeRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0)) });

  return (
    <>
      <PageHead title="Campaign planner" sub="Build this week's plan. Nothing happens until you press Continue. Outcomes depend on organisation, candidates, message, fatigue and what rivals do, so estimates are ranges." />
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          <Panel title="1 · Choose an activity">
            <div className="grid g3" style={{ gap: 8 }}>
              {ORDER.map((t) => (
                <button key={t} className="opt" style={{ borderColor: t === type ? 'var(--accent)' : undefined, background: t === type ? '#121b26' : undefined }} onClick={() => setType(t)}>
                  <b>{ACTIONS[t].name}</b>
                  <span className="tiny dim">{ACTIONS[t].scope} · {ACTIONS[t].scalable ? `₹${ACTIONS[t].scalable![0]}–${ACTIONS[t].scalable![1]} cr` : `₹${ACTIONS[t].baseCost}${t === 'rally' ? '–6' : ''} cr`}{ACTIONS[t].leaderDays ? ' · leader day' : ''}{ACTIONS[t].team ? ` · ${ACTIONS[t].team} team` : ''}</span>
                </button>
              ))}
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>{spec.desc}</p>
          </Panel>
          <Panel title="2 · Where and how">
            <div className="grid g2">
              {spec.scope !== 'national' && <div className="field"><label>State</label><select className="select" value={stateCode} onChange={(e) => { setStateCode(e.target.value); setSeat(''); }}>{STATES_LIST.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></div>}
              {spec.scope === 'constituency' && <div className="field"><label>Constituency</label><select className="select" value={seatId} onChange={(e) => setSeat(e.target.value)}>{stateSeats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.candidates[me] ? ` · ${Math.round((g.seatForecast[c.id]?.probs[me] ?? 0) * 100)}% win` : ' · not contesting'}</option>)}</select></div>}
              {spec.needsIssue && <div className="field"><label>Message</label><select className="select" value={issue} onChange={(e) => setIssue(e.target.value as Issue)}>{ISSUES.map((i) => <option key={i.id} value={i.id}>{i.name} · our credibility {Math.round(p.issueOwn[i.id] * 20)}/20</option>)}</select></div>}
              {type === 'rally' && <div className="field"><label>Speaker</label><select className="select" value={speaker} onChange={(e) => setSpeaker(e.target.value as 'leader' | 'candidate')}><option value="leader">{p.leader} (uses a leader day)</option><option value="candidate">Local candidate</option></select></div>}
              {spec.scalable && <div className="field"><label>Budget: ₹{budget} cr</label><input type="range" min={spec.scalable[0]} max={spec.scalable[1]} value={Math.max(spec.scalable[0], Math.min(spec.scalable[1], budget))} onChange={(e) => setBudget(+e.target.value)} /></div>}
              {type === 'policy_announce' && <div className="field" style={{ gridColumn: '1 / -1' }}><label>Policy</label><select className="select" value={policy} onChange={(e) => setPolicy(e.target.value)}><option value="">Choose…</option>{POLICIES.filter((x) => !p.manifesto.policies.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
            </div>
            <div className="panel" style={{ background: '#0b1017', marginTop: 12 }}>
              <div className="row"><b className="small">{est.label}</b><span className="mono right">Cost {fmtCr(cost)}</span></div>
              {est.notes.length ? <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--warn)' }}>{est.notes.map((n) => <li key={n}>{n}</li>)}</ul> : <div className="small dim" style={{ marginTop: 6 }}>No obvious problems with this plan. The result still depends on how it lands on the day.</div>}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {spec.scope === 'constituency' && seatId && <button className="btn ghost sm" onClick={() => openSeat(seatId)}>Inspect seat</button>}
              <button className="btn primary right" onClick={() => add({ ...draft })}>Add to plan</button>
            </div>
          </Panel>
          <Panel title="Battleground shortlist" extra={<span className="tiny dim">one-click town halls on the local issue</span>}>
            <div className="col" style={{ gap: 6 }}>
              {shortlist.map(({ c, pr }) => (
                <div key={c.id} className="row small">
                  <span className="grow ellipsis"><b>{c.name}</b> <span className="dim">{STATE_BY_CODE[c.state].code} · {Math.round(pr * 100)}% · org {Math.round((c.org[me] ?? 0) * 100)} · fatigue {Math.round((c.saturation[me] ?? 0) * 100)}</span></span>
                  <button className="btn sm" onClick={() => add({ type: 'town_hall', constituency: c.id, issue: c.localIssues[0] } as CampaignAction)}>Town hall</button>
                  <button className="btn sm" disabled={(c.org[me] ?? 0) < 0.12} onClick={() => add({ type: 'door_to_door', constituency: c.id } as CampaignAction)}>Doors</button>
                </div>
              ))}
              {!shortlist.length && <div className="dim small">No toss-up seats right now.</div>}
            </div>
          </Panel>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="This week's plan" className="glow">
            <div className="col" style={{ gap: 8 }}>
              <div className="row small"><span style={{ width: 90 }}>Money</span><div className="grow"><Meter v={u.funds} max={Math.max(1, lim.funds)} /></div><span className="mono">{fmtCr(u.funds)}</span></div>
              <div className="row small"><span style={{ width: 90 }}>Leader days</span><div className="grow"><Meter v={u.leaderDays} max={lim.leaderDays} /></div><span className="mono">{u.leaderDays}/{lim.leaderDays}</span></div>
              <div className="row small"><span style={{ width: 90 }}>Team</span><div className="grow"><Meter v={u.team} max={lim.team} color={u.team > lim.team * 0.8 ? 'var(--warn)' : undefined} /></div><span className="mono">{u.team}/{lim.team}</span></div>
            </div>
            <div className="col" style={{ gap: 6, marginTop: 14 }}>
              {queued.map((a) => (
                <div key={a.id} className="row small" style={{ padding: '6px 8px', background: '#0b1017', borderRadius: 7 }}>
                  <span className="grow ellipsis"><b>{ACTIONS[a.type].name}</b> <span className="dim">{a.constituency ? g.seats.find((c) => c.id === a.constituency)?.name : a.state ? STATE_BY_CODE[a.state].name : 'National'}{a.issue ? ` · ${ISSUES.find((i) => i.id === a.issue)?.name}` : ''}{a.speaker === 'leader' ? ' · leader' : ''}</span></span>
                  <span className="mono dim">{fmtCr(actionCost(a, p))}</span>
                  <button className="btn ghost sm" aria-label="Remove" onClick={() => run({ type: 'unqueue_action', id: a.id }, true)}>✕</button>
                </div>
              ))}
              {!queued.length && <div className="empty">No activities planned. An empty week is allowed, but rivals will not rest.</div>}
            </div>
          </Panel>
          <Panel title="Last week's reports">
            <div className="col small" style={{ gap: 8 }}>
              {lastWeek.map((o) => (
                <div key={o.actionId} style={{ borderLeft: `3px solid ${o.quality > 0.3 ? 'var(--good)' : o.quality < 0 ? 'var(--bad)' : 'var(--warn)'}`, paddingLeft: 10 }}>
                  <b>{ACTIONS[o.type].name}</b> <span className="dim">· {o.where}</span>
                  <div className="muted">{o.reported}</div>
                  {o.notes.map((n) => <div key={n} className="warn tiny">{n}</div>)}
                </div>
              ))}
              {!lastWeek.length && <div className="dim">No activity last week.</div>}
            </div>
            <p className="tiny dim">Organisers' crowd numbers are their own. A data analyst helps you tell when they are inflated.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}

export function Backroom() {
  const g = useGame();
  const { me, run } = useStore();
  const p = g.parties[me];
  const [amount, setAmount] = useState(20);
  const [confirmFunds, setConfirmFunds] = useState(false);
  const [target, setTarget] = useState<{ seat: string; from: string; price: number; name: string } | null>(null);
  const [mult, setMult] = useState(1.2);
  const ledger = g.shadow.filter((d) => d.party === me).slice().reverse();
  const targets = useMemo(() => {
    const out: { seat: string; seatName: string; from: string; name: string; price: number; odds: number; pv: number; myP: number }[] = [];
    for (const c of g.seats) {
      const myP = g.seatForecast[c.id]?.probs[me] ?? 0;
      if (myP < 0.1 || myP > 0.85) continue;
      for (const from of Object.keys(c.candidates)) {
        if (from === me || from === 'OTH') continue;
        const q = poachQuote(g, me, c.id, from);
        if (q && q.personalVote > 0.01) out.push({ seat: c.id, seatName: c.name, from, name: q.name, price: q.price, odds: q.odds, pv: q.personalVote, myP });
      }
    }
    return out.sort((a, b) => b.pv * b.odds / b.price - a.pv * a.odds / a.price).slice(0, 40);
  }, [g, me]);
  const exposure = p.stats.shadowExposure;
  const expLabel = exposure < 0.1 ? 'Clean' : exposure < 0.25 ? 'Some risk' : exposure < 0.5 ? 'Worrying' : 'Dangerous';

  return (
    <>
      <PageHead title="Backroom" sub="The other way to win. Buying defectors and taking undeclared money both work, and both can blow up in your face. Every deal raises the chance that investigators find out." />
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Buy a defector" extra={<span className="chip bad">Illegal</span>} className="flush">
            <div style={{ padding: '0 16px 10px' }} className="small muted">Rival candidates in seats you could win. The price rises with their local standing, loyalty and incumbency. If they cross over they bring part of their personal vote, but some of their voters stay with the old party and your own loyalists will resent the newcomer.</div>
            <div style={{ maxHeight: 460, overflow: 'auto' }}>
              <Table rows={targets} rowKey={(t) => t.seat + t.from} initialSort={['pv', -1]} cols={[
                { key: 's', label: 'Seat', render: (t) => <b>{t.seatName}</b>, sort: (t) => t.seatName },
                { key: 'k', label: 'Candidate', render: (t) => <span className="row">{t.name}<PartyChip g={g} id={t.from} /></span> },
                { key: 'pv', label: 'Personal vote', num: true, render: (t) => `${(t.pv * 100).toFixed(1)} pts`, sort: (t) => t.pv },
                { key: 'pr', label: 'Price', num: true, render: (t) => fmtCr(t.price), sort: (t) => t.price },
                { key: 'o', label: 'Odds', num: true, render: (t) => `~${Math.round(t.odds * 100)}%`, sort: (t) => t.odds },
                { key: 'a', label: '', render: (t) => <button className="btn sm" disabled={g.phase !== 'campaign'} onClick={() => { setTarget({ seat: t.seat, from: t.from, price: t.price, name: t.name }); setMult(1.2); }}>Approach</button> },
              ]} />
            </div>
          </Panel>
          <Panel title="Your private ledger" extra={<span className="dim tiny">visible only to you</span>}>
            {ledger.length ? <div className="col small">{ledger.map((d) => <div key={d.id} className="row"><span className="mono dim">W{d.turn}</span><span className="grow">{d.text}</span>{d.exposed && <span className="chip bad">Exposed</span>}</div>)}</div> : <div className="dim small">No deals. Yet.</div>}
          </Panel>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Panel title="Legal cell's read" className="glow">
            <div className="row"><b className={exposure < 0.1 ? 'good' : exposure < 0.25 ? 'warn' : 'bad'} style={{ fontSize: 22 }}>{expLabel}</b></div>
            <p className="small muted">This is a rough sense, not a number anyone can measure. The danger fades slowly if you stop. If it comes out: trust and leader standing take a heavy hit, about half the undeclared money is seized, factions turn restless, and the record follows you into the next election.</p>
          </Panel>
          <Panel title="Backdoor funding" extra={<span className="chip bad">Illegal</span>}>
            <p className="small muted">A "well-wisher" can route cash outside declared accounts. Instant money, one deal a week. A finance manager makes it a little harder to trace.</p>
            <div className="field"><label>Amount: ₹{amount} cr</label><input type="range" min={FUNDING_RANGE[0]} max={FUNDING_RANGE[1]} step={5} value={amount} onChange={(e) => setAmount(+e.target.value)} /></div>
            <button className="btn danger" style={{ marginTop: 10 }} disabled={g.phase !== 'campaign' && g.phase !== 'governance'} onClick={() => setConfirmFunds(true)}>Take ₹{amount} cr off the books</button>
          </Panel>
        </div>
      </div>
      {confirmFunds && <Confirm yes="Take the money" text={`Accept ₹${amount} crore in undeclared funds? It arrives now. It raises your exposure, and the bigger the sum, the bigger the risk.`} onYes={() => { run({ type: 'backdoor', amount }); setConfirmFunds(false); }} onNo={() => setConfirmFunds(false)} />}
      {target && (
        <Confirm yes={`Offer ${fmtCr(target.price * mult)}`} onNo={() => setTarget(null)} onYes={() => { run({ type: 'poach', seat: target.seat, from: target.from, mult }); setTarget(null); }} text={
          <div className="col">
            <span>Approach <b>{target.name}</b>. The full amount comes out of your war chest if they accept; 30% is lost in fixers' fees if they refuse, and a refusal may be leaked to the press.</span>
            <div className="field"><label>Offer: {mult.toFixed(1)}x asking ({fmtCr(target.price * mult)})</label><input type="range" min={1} max={2} step={0.1} value={mult} onChange={(e) => setMult(+e.target.value)} /></div>
          </div>
        } />
      )}
    </>
  );
}
