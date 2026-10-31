import { useState } from 'react';
import { STATE_BY_CODE, ISSUES, ISSUE_NAME, SEGMENTS, ACTIONS, estimate, newActionId, candidateAppeal, poachQuote, candidateFit, seatCategory, seatFactors, CATEGORY_LABEL, CANDIDACIES } from '../../engine/index.ts';
import type { ActionType, Candidate, Issue } from '../../engine/index.ts';
import { makeRng } from '../../engine/rng.ts';
import { useGame, useStore } from '../store.tsx';
import { Attr, Confirm, FitNum, IssueChips, Modal, PartyChip, Prov, StackBar, fmtCr } from '../components.tsx';
import type { CandidateFit } from '../../engine/index.ts';
import { ratingFor, RATING_COLOR } from '../derive.ts';

export function CandidateCard({ k, own, compact, fit }: { k: Candidate; own: boolean; compact?: boolean; fit?: CandidateFit }) {
  const hideEthics = !own || !k.vetted;
  const record = k.real ? CANDIDACIES.find((d) => d.id === k.real && d.name === k.name) : undefined;
  return (
    <div className="panel" style={{ padding: 12, background: '#0b1017' }}>
      <div className="row"><b>{k.name}</b>{k.incumbent && <span className="chip info">Sitting MP</span>}<span className="chip right">{k.profile.replace('_', ' ')}</span></div>
      {k.real
        ? <div className="tiny" style={{ margin: '3px 0 8px' }}><span className="chip info">Real politician</span> <span className="dim">Contested this seat for {record?.party ?? k.party} in {record?.scenario.slice(2) ?? 'this election'} (public record). Ratings and issues are game estimates.</span></div>
        : <div className="tiny dim" style={{ margin: '3px 0 8px' }}>Age {k.age}{own && !k.vetted ? ' · not vetted' : ''} · fictional</div>}
      <div style={{ marginBottom: 8 }}><IssueChips strong={k.strong} weak={k.weak} /></div>
      {fit && <div className="row small" style={{ marginBottom: 8, gap: 14 }}><span className="dim">State fit</span><FitNum v={fit.stateFit} /><span className="dim">Seat fit</span><FitNum v={fit.seatFit} /><span className="dim">Suitability</span><b className="mono">{Math.round(fit.suitability * 20)}/20</b></div>}
      <div className="grid g2" style={{ gap: '4px 16px' }}>
        <Attr label="Local standing" v={k.localRep} />
        <Attr label="Communication" v={k.communication} />
        <Attr label="Organisation" v={k.organisation} />
        {!compact && <Attr label="Administration" v={k.admin} />}
        {!compact && <Attr label="Loyalty" v={k.loyalty} hidden={!own} />}
        <Attr label="Integrity" v={k.ethics} hidden={hideEthics} />
      </div>
      {own && k.vetted && k.controversy > 0.4 && <div className="small warn" style={{ marginTop: 8 }}>Vetting flagged a real risk of controversy.</div>}
    </div>
  );
}

export default function SeatDetail({ id }: { id: string }) {
  const g = useGame();
  const { me, openSeat, queue, run, game } = useStore();
  const c = g.seats.find((x) => x.id === id)!;
  const fc = g.seatForecast[c.id];
  const st = STATE_BY_CODE[c.state];
  const [act, setAct] = useState<ActionType>('rally');
  const [issue, setIssue] = useState<Issue>(c.localIssues[0]);
  const [speaker, setSpeaker] = useState<'leader' | 'candidate'>('leader');
  const [poach, setPoach] = useState<string | null>(null);
  const rating = ratingFor(g, c, me);
  const draft = { id: 'preview', party: me, type: act, constituency: c.id, issue, speaker };
  const est = estimate(g, draft);
  const parties = Object.keys(c.candidates).sort((a, b) => (fc?.shares[b] ?? 0) - (fc?.shares[a] ?? 0));
  const canAct = g.phase === 'campaign';
  const quote = poach ? poachQuote(g, me, c.id, poach) : null;
  const rival = parties.find((p) => p !== me && p !== 'OTH') ?? parties.find((p) => p !== me);
  const factors = c.candidates[me] && rival ? seatFactors(g, c, me, rival) : [];

  return (
    <Modal wide onClose={() => openSeat(null)} title={<div className="row"><div><div className="upper">{st.name} · {c.id}</div><b className="display" style={{ fontSize: 22 }}>{c.name}</b></div><span className="chip" style={{ color: RATING_COLOR[rating], marginLeft: 12 }}>{rating} for you</span></div>}>
      <div className="grid g-main">
        <div className="col" style={{ gap: 14 }}>
          <div className="panel" style={{ background: '#0b1017' }}>
            <div className="row" style={{ marginBottom: 10 }}><b className="small">Forecast vote share</b><Prov p="simulated" /><span className="dim tiny right">win probabilities from {90} simulated elections</span></div>
            {fc && <StackBar g={g} shares={fc.shares} height={16} />}
            <div className="col" style={{ gap: 6, marginTop: 12 }}>
              {parties.map((p) => (
                <div key={p} className="row small">
                  <span style={{ width: 90 }}><PartyChip g={g} id={p} /></span>
                  <span className="grow ellipsis muted">{c.candidates[p]?.name}</span>
                  <span className="mono" style={{ width: 60, textAlign: 'right' }}>{((fc?.shares[p] ?? 0) * 100).toFixed(1)}%</span>
                  <span className="mono dim" style={{ width: 70, textAlign: 'right' }}>{Math.round((fc?.probs[p] ?? 0) * 100)}% win</span>
                </div>
              ))}
            </div>
            {c.rebel > 0 && c.rebelFrom && <div className="small warn" style={{ marginTop: 10 }}>A rebel independent is drawing about {Math.round(c.rebel * 100)}% of the {g.parties[c.rebelFrom].short} vote here.</div>}
            {g.alliances.filter((a) => a.seatAlloc[c.id]).map((a) => <div key={a.id} className="tiny dim" style={{ marginTop: 6 }}>{a.name}: {g.parties[a.seatAlloc[c.id]].short} contests for the alliance{a.members.filter((m) => m !== a.seatAlloc[c.id] && (c.base[m] ?? 0) > 0.01).length ? `; ${a.members.filter((m) => m !== a.seatAlloc[c.id] && (c.base[m] ?? 0) > 0.01).map((m) => g.parties[m].short).join(', ')} stood down` : ''}.</div>)}
          </div>

          <div className="grid g2">
            {c.candidates[me] && <div><div className="upper" style={{ marginBottom: 6 }}>Your candidate</div><CandidateCard k={c.candidates[me]} own fit={candidateFit(g, c, c.candidates[me])} /></div>}
            {parties.filter((p) => p !== me && p !== 'OTH').slice(0, 1).map((p) => <div key={p}><div className="upper" style={{ marginBottom: 6 }}>Main rival ({g.parties[p].short})</div><CandidateCard k={c.candidates[p]} own={false} compact fit={candidateFit(g, c, c.candidates[p])} /></div>)}
          </div>

          {c.candidates[me] && rival && (
            <div className="panel" style={{ background: '#0b1017' }}>
              <div className="row" style={{ marginBottom: 8 }}><b className="small">Why the seat leans the way it does</b><span className="chip right">{CATEGORY_LABEL[seatCategory(fc, me)]}</span></div>
              <div className="col small" style={{ gap: 4 }}>
                {factors.slice(0, 6).map((f) => <div key={f.label} className="row"><span className="grow muted">{f.label}</span><span className="mono" style={{ color: f.value > 0 ? '#3ccf8e' : '#ff6b6b' }}>{f.value > 0 ? `helps ${g.parties[me].short}` : `helps ${g.parties[rival].short}`}</span><span className="mono dim" style={{ width: 48, textAlign: 'right' }}>{(f.value * 100).toFixed(0)}</span></div>)}
              </div>
              <div className="tiny dim" style={{ marginTop: 6 }}>Factors from the vote model, compared with {g.parties[rival].short}. Larger numbers mattered more. Estimates, not certainties.</div>
            </div>
          )}
          <div style={{ display: 'none' }}>
          </div>

          {canAct && (
            <div className="panel glow">
              <div className="row" style={{ marginBottom: 10 }}><b>Campaign here this week</b><span className="dim small right">added to your weekly plan; nothing happens until you continue</span></div>
              <div className="row wrap">
                {(['rally', 'town_hall', 'door_to_door'] as ActionType[]).map((t) => <button key={t} className={`btn sm ${act === t ? 'primary' : ''}`} onClick={() => setAct(t)}>{ACTIONS[t].name}</button>)}
              </div>
              <p className="small muted">{ACTIONS[act].desc}</p>
              <div className="row wrap">
                {act !== 'door_to_door' && <select className="select" style={{ maxWidth: 220 }} value={issue} onChange={(e) => setIssue(e.target.value as Issue)}>{ISSUES.map((i) => <option key={i.id} value={i.id}>{i.name}{c.localIssues.includes(i.id) ? ' (local priority)' : ''}</option>)}</select>}
                {act === 'rally' && <select className="select" style={{ maxWidth: 200 }} value={speaker} onChange={(e) => setSpeaker(e.target.value as 'leader' | 'candidate')}><option value="leader">Leader: {g.parties[me].leader}</option><option value="candidate" disabled={!c.candidates[me]}>Local candidate</option></select>}
                <span className="mono small">Cost {fmtCr(ACTIONS[act].baseCost + (act === 'rally' && speaker === 'leader' ? 3.5 : 0))}</span>
                <button className="btn primary right" onClick={() => queue({ id: newActionId(makeRng(Date.now() >>> 0)), type: act, constituency: c.id, issue, speaker })}>Add to plan</button>
              </div>
              {est.notes.length > 0 && <ul className="small warn" style={{ margin: '10px 0 0', paddingLeft: 18 }}>{est.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            </div>
          )}
          {canAct && g.stage !== 'final_push' && (
            <div className="panel" style={{ background: '#100c10', borderColor: '#3a2030' }}>
              <div className="row"><b>Backroom: approach a rival candidate</b><span className="chip bad right">Illegal · risky</span></div>
              <p className="small muted">Real politicians in the game cannot be approached. Offer money to a generated rival candidate to switch sides. If they agree, they bring part of their personal vote. Fees for failed approaches are lost, and a refusal can be leaked.</p>
              <div className="row wrap">{parties.filter((p) => p !== me && p !== 'OTH' && !c.candidates[p].real).map((p) => <button key={p} className={`btn sm ${poach === p ? 'primary' : ''}`} onClick={() => setPoach(p)}>{c.candidates[p].name} ({g.parties[p].short})</button>)}</div>
              {quote && <div className="small" style={{ marginTop: 8 }}>Asking price about <b className="mono">{fmtCr(quote.price)}</b>. Our fixers put the odds at roughly <b>{Math.round(quote.odds * 100)}%</b> at that price. Could bring around <b>{(quote.personalVote * 100).toFixed(1)}</b> points of vote share.</div>}
            </div>
          )}
        </div>
        <div className="col" style={{ gap: 14 }}>
          <div className="panel" style={{ background: '#0b1017' }}>
            <div className="upper" style={{ marginBottom: 8 }}>Constituency</div>
            <div className="grid g2 small" style={{ gap: 6 }}>
              <span className="dim">Electors</span><span className="mono">{(c.electors / 100000).toFixed(1)} lakh</span>
              <span className="dim">Typical turnout</span><span className="mono">{Math.round(c.turnoutBase * 100)}%</span>
              <span className="dim">Urban</span><span className="mono">{Math.round(c.urban * 100)}%</span>
              <span className="dim">Held by</span><PartyChip g={g} id={c.incumbent} />
            </div>
            <div className="tiny dim" style={{ marginTop: 8 }}>Electors and urbanisation are game estimates.</div>
          </div>
          <div className="panel" style={{ background: '#0b1017' }}>
            <div className="upper" style={{ marginBottom: 8 }}>Local issues</div>
            <div className="row wrap">{c.localIssues.map((i) => <span key={i} className="chip info">{ISSUE_NAME[i]}</span>)}</div>
          </div>
          {c.prev && (
            <div className="panel" style={{ background: '#0b1017' }}>
              <div className="row" style={{ marginBottom: 8 }}><span className="upper">Previous result</span><Prov p={g.results.length ? 'simulated' : 'simulated'} /></div>
              <StackBar g={g} shares={c.prev.shares} />
              <div className="small" style={{ marginTop: 6 }}><PartyChip g={g} id={c.prev.winner} /> won by {(c.prev.margin * 100).toFixed(1)} pts on {Math.round(c.prev.turnout * 100)}% turnout.</div>
            </div>
          )}
          <div className="panel" style={{ background: '#0b1017' }}>
            <div className="upper" style={{ marginBottom: 8 }}>Electorate (aggregate segments)</div>
            {c.segments.slice().sort((a, b) => b.w - a.w).map((s) => (
              <div key={s.id} className="attr small" style={{ marginBottom: 4 }}><span className="muted">{SEGMENTS.find((x) => x.id === s.id)!.name}</span><span className="mono right">{Math.round(s.w * 100)}%</span></div>
            ))}
            <div className="tiny dim">Simulated distribution. Segments overlap in reality and no group votes as a bloc.</div>
          </div>
          <div className="panel" style={{ background: '#0b1017' }}>
            <div className="upper" style={{ marginBottom: 8 }}>Campaign activity</div>
            <div className="col small" style={{ gap: 5 }}>
              {parties.filter((p) => p !== 'OTH').map((p) => (
                <div key={p} className="row"><span style={{ width: 80 }}><PartyChip g={g} id={p} /></span><span className="dim">org</span><span className="mono">{Math.round((c.org[p] ?? 0) * 100)}</span><span className="dim">events</span><span className="mono">{c.visits[p] ?? 0}</span>{p === me && <><span className="dim">spent</span><span className="mono">{fmtCr(c.spend[p] ?? 0)}</span></>}</div>
              ))}
              {c.candidates[me] && <div className="dim tiny">Your candidate's overall appeal: {Math.round(candidateAppeal(c, me) * 20)}/20 · audience fatigue {Math.round((c.saturation[me] ?? 0) * 100)}%</div>}
            </div>
          </div>
        </div>
      </div>
      {poach && quote && game && <PoachConfirm price={quote.price} name={quote.name} onYes={(mult) => { run({ type: 'poach', seat: c.id, from: poach, mult }); setPoach(null); }} onNo={() => setPoach(null)} />}
    </Modal>
  );
}

function PoachConfirm({ price, name, onYes, onNo }: { price: number; name: string; onYes: (m: number) => void; onNo: () => void }) {
  const [mult, setMult] = useState(1.2);
  return (
    <Confirm yes={`Offer ${fmtCr(price * mult)}`} onNo={onNo} onYes={() => onYes(mult)} text={
      <div className="col">
        <span>Approach <b>{name}</b> with an offer. Paid from your war chest immediately if they accept; 30% is lost in fees if they refuse. This raises your hidden exposure to investigators.</span>
        <div className="field"><label>Offer: {mult.toFixed(1)}x asking ({fmtCr(price * mult)})</label><input type="range" min={1} max={2} step={0.1} value={mult} onChange={(e) => setMult(+e.target.value)} /></div>
      </div>
    } />
  );
}
