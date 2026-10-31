import { useMemo, useState } from 'react';
import {
  STATE_BY_CODE, ISSUE_NAME, SEGMENTS, STATE_MODES, STATE_CAMPAIGN_RANGE, TOUR_COST, CATEGORY_LABEL,
  stateIntel, recommendations, seatCategory, candidateFit, stateMessageFit, leaderPull, outstandingAllocation, aspirants, actionCost, newActionId,
} from '../../engine/index.ts';
import type { CampaignAction, Issue, SegmentId, StateCampaignMode, StateIntel, SeatCategory } from '../../engine/index.ts';
import { makeRng } from '../../engine/rng.ts';
import { useGame, useStore } from '../store.tsx';
import { FitNum, IssueChips, Meter, PageHead, Panel, PartyChip, Seg, Stat, StackBar, Table, Tabs, fmtCr } from '../components.tsx';

const CAT_COLOR: Record<SeatCategory, string> = { safe: '#3ccf8e', likely: '#a6d86a', competitive: '#e9c46a', lean_opp: '#ff9f5a', safe_opp: '#ff6b6b', uncertain: '#8fa3bf' };
const nonce = () => newActionId(makeRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));

function CatBar({ s }: { s: StateIntel }) {
  const order: SeatCategory[] = ['safe', 'likely', 'competitive', 'uncertain', 'lean_opp', 'safe_opp'];
  const tot = Math.max(1, s.contesting);
  return (
    <div className="stack" style={{ height: 8, minWidth: 80 }} title={order.map((k) => `${CATEGORY_LABEL[k]}: ${s.categories[k]}`).join(' · ')}>
      {order.map((k) => s.categories[k] > 0 && <span key={k} style={{ flexBasis: `${s.categories[k] / tot * 100}%`, background: CAT_COLOR[k] }} />)}
    </div>
  );
}

// National view: the budget across states, advice, and one row per state.
export function StatesHQ() {
  const g = useGame();
  const { me, run, openState } = useStore();
  const p = g.parties[me];
  const intel = useMemo(() => stateIntel(g, me), [g, me]);
  const recs = useMemo(() => recommendations(g, me, intel), [g, me, intel]);
  const [total, setTotal] = useState(Math.round(p.stats.funds * 0.6));
  const [filter, setFilter] = useState<'mine' | 'competitive' | 'all'>('mine');
  const outstanding = outstandingAllocation(p);
  const free = Math.max(0, p.stats.funds - outstanding);
  const spentAll = Object.values(p.stateSpent ?? {}).reduce((a, b) => a + b, 0);
  const rows = intel.filter((s) => filter === 'all' ? true : filter === 'competitive' ? s.competitive.length > 0 : s.contesting > 0);
  const campaign = g.phase === 'campaign';
  const projected = intel.reduce((a, s) => a + s.expected, 0);

  return (
    <>
      <PageHead title="State campaign HQ" sub="Plan the general election state by state. Set a budget per state, then run campaigns and send leaders there. Every action still lands seat by seat: the game works out its effect in each of the 543 constituencies.">
        <Seg value={filter} onChange={setFilter} options={[{ v: 'mine', label: 'Where we contest' }, { v: 'competitive', label: 'Competitive' }, { v: 'all', label: 'All states' }]} />
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Panel><Stat label="War chest" value={fmtCr(p.stats.funds)} /></Panel>
        <Panel><Stat label="Allocated to states, unspent" value={fmtCr(outstanding)} delta={`${fmtCr(free)} not yet allocated`} /></Panel>
        <Panel><Stat label="Spent through state campaigns" value={fmtCr(spentAll)} /></Panel>
        <Panel><Stat label="Expected seats (forecast)" value={Math.round(projected)} delta="sum of win probabilities" /></Panel>
      </div>
      <div className="grid g-main">
        <Panel className="flush" title="States">
          <div style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
            <Table rows={rows} rowKey={(r) => r.code} onRow={(r) => openState(r.code)} initialSort={['ten', -1]} max={40} cols={[
              { key: 'n', label: 'State', render: (r) => <b>{r.name}</b>, sort: (r) => r.name },
              { key: 'c', label: 'Seats', num: true, render: (r) => <span className="mono">{r.contesting}/{r.seats}</span>, sort: (r) => r.seats },
              { key: 'i', label: 'Top issue', render: (r) => { const i = g.states[r.code].primary; return i ? <span className="chip info">{ISSUE_NAME[i]}</span> : null; } },
              { key: 'e', label: 'Expected', num: true, render: (r) => r.expected.toFixed(1), sort: (r) => r.expected },
              { key: 'k', label: 'Seat outlook', render: (r) => <CatBar s={r} /> },
              { key: 'cp', label: 'Close', num: true, render: (r) => r.competitive.length, sort: (r) => r.competitive.length },
              { key: 'b', label: 'Budget', num: true, render: (r) => r.allocated ? <span className="mono">{fmtCr(r.spent)} / {fmtCr(r.allocated)}</span> : <span className="dim">—</span>, sort: (r) => r.allocated },
              { key: 'ten', label: 'Seats per ₹10 cr', num: true, render: (r) => <span className="mono">{r.perTen.toFixed(2)}</span>, sort: (r) => r.perTen },
              { key: 'o', label: 'Org vs rivals', render: (r) => <span className="mono" style={{ color: r.org >= r.oppOrg ? '#3ccf8e' : '#ff9f5a' }}>{Math.round(r.org * 100)} / {Math.round(r.oppOrg * 100)}</span>, sort: (r) => r.org - r.oppOrg },
            ]} />
          </div>
          <div className="tiny dim" style={{ padding: '8px 12px' }}>"Seats per ₹10 cr" is the model's rough estimate of how many seats another ₹10 cr rally circuit could move. It falls as you saturate a state. Click a state to manage it.</div>
        </Panel>
        <div className="col" style={{ gap: 14 }}>
          {campaign && (
            <Panel title="Split the budget across states">
              <div className="field"><label>Amount to allocate: {fmtCr(total)}</label><input type="range" min={0} max={Math.max(1, Math.floor(p.stats.funds))} value={Math.min(total, Math.floor(p.stats.funds))} onChange={(e) => setTotal(+e.target.value)} /></div>
              <div className="grid g2" style={{ gap: 6 }}>
                <button className="btn sm" onClick={() => run({ type: 'auto_allocate', total, strategy: 'competitive' })}>Target close seats</button>
                <button className="btn sm" onClick={() => run({ type: 'auto_allocate', total, strategy: 'focus' })}>Focus on 3 states</button>
                <button className="btn sm" onClick={() => run({ type: 'auto_allocate', total, strategy: 'defend' })}>Defend our seats</button>
                <button className="btn sm" onClick={() => run({ type: 'auto_allocate', total, strategy: 'even' })}>Spread nationally</button>
              </div>
              <p className="tiny dim" style={{ marginBottom: 0 }}>This replaces your current split (money already spent stays counted). You can then adjust any state on its own page. A budget is a ceiling, not spending: nothing is paid until you queue a campaign.</p>
            </Panel>
          )}
          <Panel title="Where to put effort">
            {recs.length === 0 ? <div className="empty small">No clear recommendations this week.</div> : (
              <div className="col" style={{ gap: 8 }}>
                {recs.map((r) => (
                  <button key={r.kind + r.state} className="opt" style={{ textAlign: 'left' }} onClick={() => openState(r.state)}>
                    <span className={`chip ${r.kind === 'cut' ? 'warn' : r.kind === 'defend' ? 'bad' : 'good'}`}>{({ invest: 'Invest', defend: 'Defend', exposure: 'Low exposure', issue: 'Message', cut: 'Ease off' })[r.kind]}</span>
                    <span className="small">{r.text}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="tiny dim" style={{ marginBottom: 0 }}>Worked out from the current forecast and campaign model. They are estimates, not guarantees.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}

type Tab = 'overview' | 'candidates' | 'campaign' | 'leaders' | 'seats';

export function StateDetail() {
  const g = useGame();
  const { me, stateSel, go } = useStore();
  const code = stateSel ?? 'UP';
  const def = STATE_BY_CODE[code];
  const st = g.states[code];
  const intel = useMemo(() => stateIntel(g, me).find((s) => s.code === code)!, [g, me, code]);
  const [tab, setTab] = useState<Tab>('overview');
  const p = g.parties[me];
  return (
    <>
      <PageHead title={<><button className="btn ghost sm" onClick={() => go('states')} style={{ marginRight: 8 }}>‹ States</button>{def.name}</>} sub={`${def.region} · ${def.seats.length} Lok Sabha seats · we contest ${intel.contesting}`}>
        <Tabs value={tab} onChange={setTab} options={[{ v: 'overview', label: 'Overview' }, { v: 'candidates', label: 'Candidates' }, { v: 'campaign', label: 'Campaign' }, { v: 'leaders', label: 'Leaders' }, { v: 'seats', label: 'Seats' }]} />
      </PageHead>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="upper">Top issue</span>
          {st.primary && <span className="chip warn" title={`Importance ${Math.round((st.salience[st.primary] ?? 0) * 100)}`}>{ISSUE_NAME[st.primary]}</span>}
          <span className="upper" style={{ marginLeft: 8 }}>Also</span>
          {(st.secondary ?? []).map((i) => <span key={i} className="chip info" title={`Importance ${Math.round((st.salience[i] ?? 0) * 100)}`}>{ISSUE_NAME[i]}</span>)}
          <span className="right tiny dim">Issue importance is a game estimate and changes with campaigns and events.</span>
        </div>
      </div>
      {tab === 'overview' && <StateOverview code={code} intel={intel} />}
      {tab === 'candidates' && <StateCandidates code={code} />}
      {tab === 'campaign' && <StateCampaign code={code} intel={intel} />}
      {tab === 'leaders' && <StateLeaders code={code} />}
      {tab === 'seats' && <StateSeatsTab code={code} />}
      {!p && null}
    </>
  );
}

function StateOverview({ code, intel }: { code: string; intel: StateIntel }) {
  const g = useGame();
  const { me } = useStore();
  const st = g.states[code];
  const p = g.parties[me];
  const seats = g.seats.filter((c) => c.state === code);
  const seatsBy: Record<string, number> = {};
  const voteBy: Record<string, number> = {};
  let elec = 0;
  for (const c of seats) {
    const fc = g.seatForecast[c.id];
    if (!fc) continue;
    for (const [pid, pr] of Object.entries(fc.probs)) seatsBy[pid] = (seatsBy[pid] ?? 0) + pr;
    for (const [pid, sh] of Object.entries(fc.shares)) voteBy[pid] = (voteBy[pid] ?? 0) + sh * c.electors;
    elec += c.electors;
  }
  for (const k of Object.keys(voteBy)) voteBy[k] /= elec || 1;
  const rows = Object.keys(seatsBy).filter((k) => seatsBy[k] > 0.05 || (voteBy[k] ?? 0) > 0.03).sort((a, b) => seatsBy[b] - seatsBy[a]);
  const opp = Object.entries(st.spendLog ?? {}).filter(([k]) => k !== me).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const issues = [st.primary, ...(st.secondary ?? [])].filter(Boolean) as Issue[];
  return (
    <div className="grid g-main">
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Projected result in the state" extra={<span className="tiny dim">from the seat-by-seat forecast</span>}>
          <StackBar g={g} shares={voteBy} height={14} />
          <div className="col small" style={{ gap: 6, marginTop: 10 }}>
            {rows.map((pid) => <div key={pid} className="row"><span style={{ width: 90 }}><PartyChip g={g} id={pid} /></span><span className="mono" style={{ width: 70 }}>{((voteBy[pid] ?? 0) * 100).toFixed(1)}%</span><span className="mono">{seatsBy[pid].toFixed(1)} seats expected</span></div>)}
          </div>
        </Panel>
        <Panel title="Issues voters care about here">
          <Table rows={issues} rowKey={(i) => i} cols={[
            { key: 'i', label: 'Issue', render: (i) => <b>{ISSUE_NAME[i]}</b> },
            { key: 'm', label: 'Importance', render: (i) => <Meter v={st.salience[i] ?? 0} max={1.2} /> },
            { key: 's', label: 'Satisfaction', num: true, render: (i) => { const v = st.sentiment?.[i] ?? 0; return <span className="mono" style={{ color: v >= 0 ? '#3ccf8e' : '#ff6b6b' }}>{v > 0 ? '+' : ''}{Math.round(v * 100)}</span>; } },
            { key: 'c', label: 'Our credibility', num: true, render: (i) => <span className="mono">{Math.round(((p.issueOwn[i] ?? 0.4) + (st.cred?.[me]?.[i] ?? 0)) * 20)}/20</span> },
            { key: 'f', label: 'Message fit', num: true, render: (i) => <span className="mono">{Math.round(stateMessageFit(g, p, i, code) * 100)}</span> },
          ]} />
          <p className="tiny dim" style={{ marginBottom: 0 }}>Satisfaction moves with the economy and events; a fall hurts the governing parties. Credibility rises when you campaign on an issue here.</p>
        </Panel>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Our position">
          <div className="grid g2 small" style={{ gap: 6 }}>
            <span className="dim">Expected seats</span><b className="mono">{intel.expected.toFixed(1)} of {intel.contesting}</b>
            <span className="dim">Close seats</span><span className="mono">{intel.competitive.length}</span>
            <span className="dim">Sitting seats at risk</span><span className="mono">{intel.vulnerable.length}</span>
            <span className="dim">Organisation (us / rivals)</span><span className="mono">{Math.round(intel.org * 100)} / {Math.round(intel.oppOrg * 100)}</span>
            <span className="dim">Budget spent</span><span className="mono">{fmtCr(intel.spent)} of {fmtCr(intel.allocated)}</span>
            <span className="dim">Campaign saturation</span><span className="mono">{Math.round(intel.saturation * 100)}%</span>
            <span className="dim">Seats per ₹10 cr more</span><span className="mono">{intel.perTen.toFixed(2)}</span>
          </div>
        </Panel>
        <Panel title="Opportunities and risks">
          {intel.opportunities.map((t) => <div key={t} className="small" style={{ color: '#3ccf8e', marginBottom: 4 }}>+ {t}</div>)}
          {intel.risks.map((t) => <div key={t} className="small" style={{ color: '#ff9f5a', marginBottom: 4 }}>− {t}</div>)}
          {!intel.opportunities.length && !intel.risks.length && <div className="dim small">Nothing stands out.</div>}
        </Panel>
        <Panel title="Rival activity this campaign">
          {opp.length ? opp.map(([pid, v]) => <div key={pid} className="row small" style={{ marginBottom: 4 }}><PartyChip g={g} id={pid} /><span className="mono right">{fmtCr(v)} in state campaigns</span></div>) : <div className="dim small">No statewide campaigns by rivals yet.</div>}
          <div className="tiny dim">Visible spending only. Rivals also campaign seat by seat.</div>
        </Panel>
      </div>
    </div>
  );
}

function StateCandidates({ code }: { code: string }) {
  const g = useGame();
  const { me, run, openSeat } = useStore();
  const seats = g.seats.filter((c) => c.state === code && c.candidates[me]);
  const prep = g.phase === 'campaign' && g.stage === 'preparation';
  const rows = seats.map((c) => {
    const k = c.candidates[me];
    const fit = candidateFit(g, c, k);
    const alts = aspirants(g, c.id, me).map((a, i) => ({ a, i, fit: candidateFit(g, c, a) }));
    const best = alts.slice().sort((x, y) => y.fit.suitability - x.fit.suitability)[0];
    return { c, k, fit, best, gain: best ? best.fit.suitability - fit.suitability : 0 };
  });
  const upgrades = rows.filter((r) => r.best && r.gain > 0.04 && !r.k.real && !r.k.incumbent);
  return (
    <Panel className="flush" title="Our candidates in the state" extra={prep && upgrades.length > 0 && <button className="btn sm primary" onClick={() => { for (const r of upgrades) run({ type: 'pick_candidate', seat: r.c.id, index: r.best.i }, true); }}>Swap in better-fitting aspirants ({upgrades.length})</button>}>
      <Table rows={rows} rowKey={(r) => r.c.id} onRow={(r) => openSeat(r.c.id)} initialSort={['su', 1]} cols={[
        { key: 'n', label: 'Seat', render: (r) => <b>{r.c.name}</b>, sort: (r) => r.c.name },
        { key: 'k', label: 'Candidate', render: (r) => <>{r.k.name}{r.k.real && <span className="chip info" style={{ marginLeft: 6 }}>Real</span>}{r.k.incumbent && <span className="chip" style={{ marginLeft: 6 }}>MP</span>}</>, sort: (r) => r.k.name },
        { key: 'i', label: 'Strong / weak issues', render: (r) => <IssueChips strong={r.k.strong} weak={r.k.weak} max={3} /> },
        { key: 'sf', label: 'State fit', num: true, render: (r) => <FitNum v={r.fit.stateFit} />, sort: (r) => r.fit.stateFit },
        { key: 'cf', label: 'Seat fit', num: true, render: (r) => <FitNum v={r.fit.seatFit} />, sort: (r) => r.fit.seatFit },
        { key: 'su', label: 'Suitability', num: true, render: (r) => <b className="mono">{Math.round(r.fit.suitability * 20)}</b>, sort: (r) => r.fit.suitability },
        { key: 'b', label: 'Best alternative', render: (r) => r.best ? <span className="small">{r.best.a.name} <span className="mono dim">{Math.round(r.best.fit.suitability * 20)}</span>{r.gain > 0.04 && <span className="chip good" style={{ marginLeft: 4 }}>better</span>}</span> : null, sort: (r) => r.gain },
        { key: 'r', label: 'Outlook', render: (r) => { const k = seatCategory(g.seatForecast[r.c.id], me); return <span style={{ color: CAT_COLOR[k] }}>{CATEGORY_LABEL[k]}</span>; } },
      ]} />
      <div className="tiny dim" style={{ padding: '8px 12px' }}>{prep ? 'Tickets lock at the end of week 2. ' : 'Tickets are locked for this election. '}State fit compares a candidate's issues with the state's priorities; seat fit with this seat's voters, which counts for more. Suitability is an estimate, not a forecast. Click a seat to compare every aspirant.</div>
    </Panel>
  );
}

function StateCampaign({ code, intel }: { code: string; intel: StateIntel }) {
  const g = useGame();
  const { me, run, queue } = useStore();
  const p = g.parties[me];
  const st = g.states[code];
  const issues = [st.primary, ...(st.secondary ?? [])].filter(Boolean) as Issue[];
  const allIssues = (Object.keys(ISSUE_NAME) as Issue[]).sort((a, b) => stateMessageFit(g, p, b, code) - stateMessageFit(g, p, a, code));
  const [mode, setMode] = useState<StateCampaignMode>('rallies');
  const [issue, setIssue] = useState<Issue>(issues[0] ?? 'jobs');
  const [target, setTarget] = useState<SegmentId | ''>('');
  const [intensity, setIntensity] = useState<'steady' | 'blitz'>('steady');
  const [prio, setPrio] = useState<string[]>([]);
  const queued = (g.queued[me] ?? []).filter((a) => a.state === code && (a.type === 'state_campaign' || a.type === 'leader_tour'));
  const queuedSpend = queued.filter((a) => a.type === 'state_campaign').reduce((s, a) => s + actionCost(a, p), 0);
  const remaining = Math.max(0, intel.allocated - intel.spent - queuedSpend);
  const [budget, setBudget] = useState(10);
  const [alloc, setAlloc] = useState(String(Math.round(intel.allocated)));
  const b = Math.max(STATE_CAMPAIGN_RANGE[0], Math.min(STATE_CAMPAIGN_RANGE[1], budget));
  const close = g.seats.filter((c) => c.state === code && c.candidates[me] && intel.competitive.includes(c.id));
  const campaign = g.phase === 'campaign';
  if (!campaign) return <div className="empty">The campaign is over.</div>;
  if (!intel.contesting) return <div className="empty">We have no candidates in this state, so there is nothing to campaign for.</div>;
  const draft: Omit<CampaignAction, 'party'> = { id: nonce(), type: 'state_campaign', state: code, mode, issue, budget: b, target: target || undefined, intensity, seats: prio.length ? prio : undefined };
  return (
    <div className="grid g-main">
      <div className="col" style={{ gap: 14 }}>
        <Panel title="1 · Campaign type">
          <div className="grid g2" style={{ gap: 8 }}>
            {(Object.keys(STATE_MODES) as StateCampaignMode[]).map((m) => (
              <button key={m} className="opt" style={{ borderColor: m === mode ? 'var(--accent)' : undefined, background: m === mode ? '#121b26' : undefined, textAlign: 'left' }} onClick={() => setMode(m)}>
                <b>{STATE_MODES[m].name}</b><span className="tiny dim">{STATE_MODES[m].desc}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="2 · Message, audience and money">
          <div className="grid g2">
            <div className="field"><label>Issue</label><select className="select" value={issue} onChange={(e) => setIssue(e.target.value as Issue)}>{allIssues.map((i) => <option key={i} value={i}>{ISSUE_NAME[i]}{i === st.primary ? ' · top issue' : issues.includes(i) ? ' · state priority' : ''} · fit {Math.round(stateMessageFit(g, p, i, code) * 100)}</option>)}</select></div>
            <div className="field"><label>Voter group (optional)</label><select className="select" value={target} onChange={(e) => setTarget(e.target.value as SegmentId | '')}><option value="">Everyone</option>{SEGMENTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label>Budget: {fmtCr(b)}</label><input type="range" min={STATE_CAMPAIGN_RANGE[0]} max={STATE_CAMPAIGN_RANGE[1]} value={b} onChange={(e) => setBudget(+e.target.value)} /></div>
            <div className="field"><label>Intensity</label><Seg value={intensity} onChange={setIntensity} options={[{ v: 'steady', label: 'Steady' }, { v: 'blitz', label: 'Blitz (+25%, tires voters faster)' }]} /></div>
          </div>
          {close.length > 0 && (
            <div className="field"><label>Priority seats (optional, up to 3): they get a bigger share</label>
              <div className="row wrap" style={{ gap: 6 }}>{close.map((c) => <button key={c.id} className={`btn sm ${prio.includes(c.id) ? 'primary' : ''}`} onClick={() => setPrio(prio.includes(c.id) ? prio.filter((x) => x !== c.id) : prio.length < 3 ? [...prio, c.id] : prio)}>{c.name} · {Math.round((g.seatForecast[c.id]?.probs[me] ?? 0) * 100)}%</button>)}</div>
            </div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <span className="small muted">Left in this state's budget: <b className="mono">{fmtCr(remaining)}</b></span>
            <button className="btn primary right" disabled={b > remaining + 1e-9} onClick={() => { if (queue(draft).ok) setPrio([]); }}>Add to this week's plan</button>
          </div>
          {b > remaining + 1e-9 && <div className="small warn" style={{ marginTop: 6 }}>Raise this state's budget first.</div>}
          {intel.saturation > 0.45 && <div className="small warn" style={{ marginTop: 6 }}>Voters here have heard a lot from us; each extra rupee buys less.</div>}
        </Panel>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <Panel title="State budget">
          <div className="grid g2 small" style={{ gap: 6, marginBottom: 10 }}>
            <span className="dim">Allocated</span><span className="mono">{fmtCr(intel.allocated)}</span>
            <span className="dim">Spent</span><span className="mono">{fmtCr(intel.spent)}</span>
            <span className="dim">Queued this week</span><span className="mono">{fmtCr(queuedSpend)}</span>
            <span className="dim">Unallocated nationally</span><span className="mono">{fmtCr(Math.max(0, p.stats.funds - outstandingAllocation(p)))}</span>
          </div>
          <div className="row"><input className="input" style={{ maxWidth: 110 }} inputMode="numeric" value={alloc} onChange={(e) => setAlloc(e.target.value.replace(/[^0-9.]/g, ''))} /><button className="btn sm" onClick={() => run({ type: 'set_state_budget', state: code, amount: Number(alloc) || 0 })}>Set budget (₹ cr)</button></div>
        </Panel>
        <Panel title="Queued for this state">
          {queued.length === 0 ? <div className="dim small">Nothing yet.</div> : queued.map((a) => (
            <div key={a.id} className="row small" style={{ marginBottom: 6 }}>
              <span className="grow">{a.type === 'state_campaign' ? `${STATE_MODES[a.mode ?? 'rallies'].name} · ${ISSUE_NAME[a.issue!]}` : `${p.leaders?.find((l) => l.id === a.leaderId)?.name ?? 'Leader'} tour · ${ISSUE_NAME[a.issue!]}`}</span>
              <span className="mono">{fmtCr(actionCost(a, p))}</span>
              <button className="btn ghost sm" onClick={() => run({ type: 'unqueue_action', id: a.id }, true)}>✕</button>
            </div>
          ))}
        </Panel>
        <Panel title="How the effect is spread">
          <p className="small muted" style={{ margin: 0 }}>Part of every state campaign lifts the party across the state. The rest is shared out seat by seat. Seats get more where the issue is a local priority, where your target group lives, where our candidate is strong on the issue, and where the race is close. Seats get less where our candidate is weak on it or voters are tired of us.</p>
        </Panel>
      </div>
    </div>
  );
}

function StateLeaders({ code }: { code: string }) {
  const g = useGame();
  const { me, queue } = useStore();
  const p = g.parties[me];
  const st = g.states[code];
  const [issue, setIssue] = useState<Issue>(st.primary ?? 'jobs');
  const [seats, setSeats] = useState<string[]>([]);
  const queued = g.queued[me] ?? [];
  const mine = g.seats.filter((c) => c.state === code && c.candidates[me]);
  const close = mine.filter((c) => { const pr = g.seatForecast[c.id]?.probs[me] ?? 0; return pr > 0.2 && pr < 0.8; });
  const campaign = g.phase === 'campaign';
  return (
    <div className="grid g-main">
      <Panel className="flush" title="Campaigners" extra={<span className="tiny dim">Ratings are game estimates</span>}>
        <Table rows={p.leaders ?? []} rowKey={(l) => l.id} initialSort={['pull', -1]} cols={[
          { key: 'n', label: 'Name', render: (l) => <div><b>{l.name}</b>{l.real && <span className="chip info" style={{ marginLeft: 6 }}>Real</span>}<div className="tiny dim">{l.role}{l.home === code ? ' · home state' : ''}</div></div>, sort: (l) => l.name },
          { key: 'pull', label: 'Pull here', num: true, render: (l) => <span className="mono">{Math.round(leaderPull(l, code) * 20)}/20</span>, sort: (l) => leaderPull(l, code) },
          { key: 'd', label: 'Days left', num: true, render: (l) => `${l.days - queued.filter((a) => a.type === 'leader_tour' && a.leaderId === l.id).length}/${l.days}` },
          { key: 'go', label: 'Send', render: (l) => campaign && (
            <span className="row" style={{ gap: 4 }}>
              <button className="btn sm" onClick={(e) => { e.stopPropagation(); queue({ id: nonce(), type: 'leader_tour', state: code, leaderId: l.id, issue, tour: 'statewide' }); }}>Statewide</button>
              <button className="btn sm" disabled={!seats.length} onClick={(e) => { e.stopPropagation(); queue({ id: nonce(), type: 'leader_tour', state: code, leaderId: l.id, issue, tour: 'targeted', seats }); }}>Targeted</button>
            </span>
          ) },
          { key: 'i', label: 'Credible on', render: (l) => <IssueChips strong={l.strong.map((i) => ({ issue: i, level: 0.7 }))} weak={l.weak.map((i) => ({ issue: i, level: 0.5 }))} max={2} /> },
          { key: 'v', label: 'Visits', num: true, render: (l) => l.visits[code] ?? 0 },
        ]} />
        <div className="tiny dim" style={{ padding: '8px 12px' }}>Each tour costs {fmtCr(TOUR_COST)} and one of the campaigner's days this week. Campaigners pull hardest in their home state, repeat visits matter less, and a campaigner weak on the chosen issue is less convincing.</div>
      </Panel>
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Tour settings">
          <div className="field"><label>Message</label><select className="select" value={issue} onChange={(e) => setIssue(e.target.value as Issue)}>{(Object.keys(ISSUE_NAME) as Issue[]).map((i) => <option key={i} value={i}>{ISSUE_NAME[i]}{i === st.primary ? ' · top issue here' : st.secondary?.includes(i) ? ' · state priority' : ''}</option>)}</select></div>
          <div className="field"><label>Seats for a targeted visit (up to 3)</label>
            <div className="row wrap" style={{ gap: 6 }}>{(close.length ? close : mine.slice(0, 12)).map((c) => <button key={c.id} className={`btn sm ${seats.includes(c.id) ? 'primary' : ''}`} onClick={() => setSeats(seats.includes(c.id) ? seats.filter((x) => x !== c.id) : seats.length < 3 ? [...seats, c.id] : seats)}>{c.name}</button>)}</div>
          </div>
          <p className="tiny dim" style={{ marginBottom: 0 }}>Statewide tours lift the whole state a little. Targeted visits hit up to three seats hard.</p>
        </Panel>
      </div>
    </div>
  );
}

function StateSeatsTab({ code }: { code: string }) {
  const g = useGame();
  const { me, openSeat } = useStore();
  const seats = g.seats.filter((c) => c.state === code);
  return (
    <Panel className="flush" title="Constituencies">
      <Table rows={seats} rowKey={(c) => c.id} onRow={(c) => openSeat(c.id)} initialSort={['pr', -1]} cols={[
        { key: 'n', label: 'Seat', render: (c) => <b>{c.name}</b>, sort: (c) => c.name },
        { key: 'k', label: 'Outlook', render: (c) => { const k = c.candidates[me] ? seatCategory(g.seatForecast[c.id], me) : null; return k ? <span style={{ color: CAT_COLOR[k] }}>{CATEGORY_LABEL[k]}</span> : <span className="dim">Not contesting</span>; }, sort: (c) => g.seatForecast[c.id]?.probs[me] ?? 0 },
        { key: 'l', label: 'Leading', render: (c) => g.seatForecast[c.id] ? <PartyChip g={g} id={g.seatForecast[c.id].leader} /> : null },
        { key: 'sh', label: 'Our share', num: true, render: (c) => <span className="mono">{((g.seatForecast[c.id]?.shares[me] ?? 0) * 100).toFixed(1)}%</span>, sort: (c) => g.seatForecast[c.id]?.shares[me] ?? 0 },
        { key: 'pr', label: 'Win %', num: true, render: (c) => Math.round((g.seatForecast[c.id]?.probs[me] ?? 0) * 100), sort: (c) => g.seatForecast[c.id]?.probs[me] ?? 0 },
        { key: 'f', label: 'Candidate fit', num: true, render: (c) => c.candidates[me] ? <FitNum v={candidateFit(g, c, c.candidates[me]).seatFit} /> : null },
        { key: 'li', label: 'Local issues', render: (c) => <span className="tiny">{c.localIssues.map((i) => ISSUE_NAME[i]).join(', ')}</span> },
        { key: 'o', label: 'Org', num: true, render: (c) => Math.round((c.org[me] ?? 0) * 100) },
        { key: 'sa', label: 'Fatigue', num: true, render: (c) => `${Math.round((c.saturation[me] ?? 0) * 100)}%` },
      ]} />
      <div className="tiny dim" style={{ padding: '8px 12px' }}>Optional: open a seat for local rallies, town halls and door-to-door work. Routine campaigning does not need this.</div>
    </Panel>
  );
}
