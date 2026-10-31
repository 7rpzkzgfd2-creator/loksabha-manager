import { useEffect, useMemo, useState } from 'react';
import { PARTY_DEFS, SCENARIOS, SCENARIO_BY_ID, STATES_LIST, ISSUES, SEGMENTS, CUSTOM_BUDGET, customLaunchCost } from '../../engine/index.ts';
import type { CustomPartyInput, Difficulty, Issue, ScenarioConfig, SandboxOptions } from '../../engine/index.ts';
import { useStore } from '../store.tsx';
import { Meter, Panel, Prov, Seg, Symbol, SYMBOL_KEYS, attr20 } from '../components.tsx';
import type { Mode } from './Title.tsx';

const STYLES = ['charismatic', 'technocratic', 'populist', 'consensual', 'combative'] as const;

export default function NewGame({ mode, onBack }: { mode: Mode; onBack: () => void }) {
  const { start, busy } = useStore();
  const scenarios = SCENARIOS.filter((s) => (mode === 'historical' ? s.kind === 'historical' : true));
  const [step, setStep] = useState(0);
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [party, setParty] = useState<string>('INC');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [turns, setTurns] = useState(mode === 'quick' ? 8 : 10);
  const [freq, setFreq] = useState(1);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [sandbox, setSandbox] = useState<SandboxOptions>({ popularity: 0, funds: undefined, organisation: undefined, economy: 0, rivalStrength: 1, noAlliances: false });
  const [custom, setCustom] = useState<CustomPartyInput>({
    name: 'Nava Bharat Morcha', short: 'NBM', color: '#7c5cff', color2: '#e9c46a', symbol: 'wheel',
    ideology: { econ: 0.1, social: -0.1, federal: 0.3, welfare: 0.6 }, homeState: 'MH', leaderName: 'Ananya Rao', leaderStyle: 'technocratic',
    structure: 'federated', recruitment: 'professionals', focusIssues: ['jobs', 'corruption'], startingFunds: 120, recognition: 0.35,
  });
  const sc = SCENARIO_BY_ID[scenarioId];
  const available = PARTY_DEFS.filter((p) => p.playable && sc.parties.includes(p.id));
  const isCustom = party === 'CUSTOM';
  const steps = ['Scenario', 'Party', isCustom ? 'Build party' : null, 'Settings'].filter(Boolean) as string[];
  const cur = steps[step];
  useEffect(() => { document.querySelector('.wizard')?.scrollTo({ top: 0 }); }, [step]);

  const go = () => {
    const cfg: ScenarioConfig = {
      scenarioId, mode: mode === 'multiplayer' ? 'quick' : mode, difficulty, playerParty: party, seed, campaignTurns: turns, eventFrequency: freq,
      customParty: isCustom ? custom : undefined, sandbox: mode === 'sandbox' ? sandbox : undefined,
    };
    start(cfg);
  };

  return (
    <div className="wizard">
      <div className="wizard-in">
        <div className="row">
          <button className="btn ghost" onClick={step === 0 ? onBack : () => setStep(step - 1)}>← {step === 0 ? 'Main menu' : 'Back'}</button>
          <span className="upper right">{({ career: 'Career', quick: 'Quick election', historical: 'Historical scenario', sandbox: 'Sandbox', multiplayer: 'Multiplayer' } as Record<Mode, string>)[mode]}</span>
        </div>
        <h1 className="display" style={{ fontSize: 40, margin: '18px 0 0' }}>{cur === 'Scenario' ? 'Choose the election' : cur === 'Party' ? 'Choose your party' : cur === 'Build party' ? 'Found a party' : 'Set the rules'}</h1>
        <div className="steps">{steps.map((s, i) => <span key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>{i + 1}. {s}</span>)}</div>

        {cur === 'Scenario' && (
          <div className="grid g2 fade-in">
            {scenarios.map((s) => (
              <button key={s.id} className={`party-card ${scenarioId === s.id ? 'on' : ''}`} style={{ ['--pc' as string]: 'var(--accent)', ['--pc2' as string]: 'var(--gold)', padding: 20 }} onClick={() => setScenarioId(s.id)}>
                <div className="stripe" />
                <div className="row"><span className="display" style={{ fontSize: 22, fontWeight: 700 }}>{s.title}</span><span className="right"><Prov p={s.kind === 'historical' ? 'estimate' : 'simulated'} /></span></div>
                <p className="muted" style={{ margin: '8px 0' }}>{s.blurb}</p>
                <div className="small dim">{s.parties.length - 1} parties · {s.alliances.map((a) => a.name).join(' vs ')}</div>
                {s.notes.map((n) => <div key={n} className="tiny dim" style={{ marginTop: 6 }}>Note: {n}</div>)}
                {s.recorded && <div className="tiny" style={{ marginTop: 8, color: 'var(--gold)' }}>Recorded result available for comparison after you play ({s.recorded.source}).</div>}
              </button>
            ))}
          </div>
        )}

        {cur === 'Party' && (
          <>
            <p className="muted" style={{ marginTop: -8 }}>Attributes are game estimates on a 1–20 scale, not measurements. Leaders are fictional.</p>
            <div className="grid g4 fade-in">
              {available.map((p) => (
                <button key={p.id} className={`party-card ${party === p.id ? 'on' : ''}`} style={{ ['--pc' as string]: p.color, ['--pc2' as string]: p.color2 }} onClick={() => setParty(p.id)}>
                  <div className="stripe" />
                  <div className="row"><Symbol p={p} size={36} /><div className="grow"><b>{p.short}</b><div className="tiny dim ellipsis">{p.name}</div></div></div>
                  <div className="small muted" style={{ margin: '10px 0 8px' }}>{p.national ? 'National' : `Regional · ${p.homeStates.join(', ')}`} · {p.leader}</div>
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12 }}>
                    <span className="dim">Leader</span><span className="mono right">{attr20(p.leaderPop)}</span>
                    <span className="dim">Machine</span><span className="mono right">{attr20(p.organisation)}</span>
                    <span className="dim">Funds</span><span className="mono right">₹{p.funds}cr</span>
                    <span className="dim">Unity</span><span className="mono right">{attr20(p.cohesion)}</span>
                  </div>
                  <div className="tiny dim" style={{ marginTop: 8 }}>{p.funds >= 500 ? 'Expectations: win a majority.' : p.funds >= 200 ? 'Expectations: lead the opposition or better.' : 'Expectations: protect the home base, grow.'}</div>
                </button>
              ))}
              <button className={`party-card ${isCustom ? 'on' : ''}`} style={{ ['--pc' as string]: custom.color, ['--pc2' as string]: custom.color2, borderStyle: 'dashed' }} onClick={() => setParty('CUSTOM')}>
                <div className="stripe" />
                <div className="row"><span className="symbol" style={{ background: '#141b25', fontSize: 22 }}>+</span><div><b>Found your own</b><div className="tiny dim">New party from scratch</div></div></div>
                <p className="small muted">Pick your name, colours, ideology and structure. You start small, with a fixed launch budget: every advantage has a cost.</p>
              </button>
            </div>
          </>
        )}

        {cur === 'Build party' && <CustomBuilder c={custom} set={setCustom} />}

        {cur === 'Settings' && (
          <div className="grid g2 fade-in">
            <Panel title="Difficulty">
              <Seg value={difficulty} onChange={setDifficulty} options={[{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }]} />
              <p className="small muted" style={{ marginTop: 12 }}>
                {difficulty === 'easy' && 'Rivals target seats and pick issues less well, and rarely react to you. Your gaffes are rarer and crises bite less. You get 25% more starting money.'}
                {difficulty === 'normal' && 'Rivals read the forecast, defend vulnerable seats and answer your moves. Money is tight.'}
                {difficulty === 'hard' && 'Rivals target accurately, counter-campaign where you appear, exploit seats you neglect, and drive harder bargains. You start with 20% less money. Votes are never secretly adjusted.'}
              </p>
            </Panel>
            <Panel title="Campaign">
              <div className="col">
                <div className="field"><label>Campaign length: {turns} weeks</label><input type="range" min={6} max={14} value={turns} onChange={(e) => setTurns(+e.target.value)} /></div>
                <div className="field"><label>Event frequency: {freq.toFixed(1)}x</label><input type="range" min={0} max={2} step={0.1} value={freq} onChange={(e) => setFreq(+e.target.value)} /></div>
                <div className="field"><label>Random seed (same seed + same choices = same game)</label><input className="input mono" value={seed} onChange={(e) => setSeed(Number(e.target.value.replace(/\D/g, '')) || 0)} /></div>
              </div>
            </Panel>
            {mode === 'sandbox' && (
              <Panel title={<>Sandbox rules <span className="chip warn">Not standard rules</span></>} className="glow" style={{ gridColumn: '1 / -1' }}>
                <div className="grid g3">
                  <div className="field"><label>Your popularity shift: {(sandbox.popularity ?? 0).toFixed(2)}</label><input type="range" min={-0.4} max={0.4} step={0.02} value={sandbox.popularity ?? 0} onChange={(e) => setSandbox({ ...sandbox, popularity: +e.target.value })} /></div>
                  <div className="field"><label>Your war chest: {sandbox.funds === undefined ? 'default' : `₹${sandbox.funds} cr`}</label><input type="range" min={10} max={1500} step={10} value={sandbox.funds ?? 200} onChange={(e) => setSandbox({ ...sandbox, funds: +e.target.value })} /></div>
                  <div className="field"><label>Your organisation: {sandbox.organisation === undefined ? 'default' : Math.round(sandbox.organisation * 100) + '%'}</label><input type="range" min={0.1} max={0.95} step={0.05} value={sandbox.organisation ?? 0.5} onChange={(e) => setSandbox({ ...sandbox, organisation: +e.target.value })} /></div>
                  <div className="field"><label>Economy mood: {(sandbox.economy ?? 0).toFixed(1)}</label><input type="range" min={-1} max={1} step={0.1} value={sandbox.economy ?? 0} onChange={(e) => setSandbox({ ...sandbox, economy: +e.target.value })} /></div>
                  <div className="field"><label>Rival strength: {(sandbox.rivalStrength ?? 1).toFixed(1)}x</label><input type="range" min={0.5} max={1.5} step={0.1} value={sandbox.rivalStrength ?? 1} onChange={(e) => setSandbox({ ...sandbox, rivalStrength: +e.target.value })} /></div>
                  <label className="row small"><input type="checkbox" checked={!!sandbox.noAlliances} onChange={(e) => setSandbox({ ...sandbox, noAlliances: e.target.checked })} /> Start with no pre-poll alliances</label>
                </div>
              </Panel>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: 26 }}>
          <span className="dim small">{sc.title} · {isCustom ? custom.name : PARTY_DEFS.find((p) => p.id === party)?.name}</span>
          {step < steps.length - 1
            ? <button className="btn continue lg right" disabled={cur === 'Party' && !party} onClick={() => setStep(step + 1)}>Continue</button>
            : <button className="btn continue lg right" disabled={busy} onClick={go}>{busy ? 'Building 543 constituencies…' : 'Begin campaign'}</button>}
        </div>
      </div>
    </div>
  );
}

function CustomBuilder({ c, set }: { c: CustomPartyInput; set: (c: CustomPartyInput) => void }) {
  const cost = customLaunchCost(c);
  const up = (patch: Partial<CustomPartyInput>) => set({ ...c, ...patch });
  const ideo = (k: keyof CustomPartyInput['ideology'], v: number) => set({ ...c, ideology: { ...c.ideology, [k]: v } });
  // how broad groups and possible allies are likely to see you (ideology is not cosmetic)
  const perception = useMemo(() => SEGMENTS.map((s) => {
    const fit = -Math.abs(s.econPref - c.ideology.econ) * 0.6 + (s.welfarePref - 0.5) * (c.ideology.welfare - 0.5) * 2 + c.focusIssues.reduce((a, i) => a + (s.salience[i] ?? 0) * 0.4, 0);
    return { name: s.name, fit };
  }).sort((a, b) => b.fit - a.fit), [c]);
  const allies = useMemo(() => PARTY_DEFS.filter((p) => p.playable).map((p) => ({ p, d: Math.sqrt((p.ideology.econ - c.ideology.econ) ** 2 + (p.ideology.social - c.ideology.social) ** 2 * 1.3 + (p.ideology.federal - c.ideology.federal) ** 2 * 0.6) })).sort((a, b) => a.d - b.d), [c]);
  return (
    <div className="grid g-main fade-in">
      <div className="col">
        <Panel title="Identity">
          <div className="grid g2">
            <div className="field"><label>Party name</label><input className="input" value={c.name} maxLength={48} onChange={(e) => up({ name: e.target.value })} /></div>
            <div className="field"><label>Abbreviation</label><input className="input mono" value={c.short} maxLength={6} onChange={(e) => up({ short: e.target.value.toUpperCase() })} /></div>
            <div className="field"><label>Leader (you)</label><input className="input" value={c.leaderName} maxLength={40} onChange={(e) => up({ leaderName: e.target.value })} /></div>
            <div className="field"><label>Home state</label><select className="select" value={c.homeState} onChange={(e) => up({ homeState: e.target.value })}>{STATES_LIST.filter((s) => s.seats.length >= 4).map((s) => <option key={s.code} value={s.code}>{s.name} ({s.seats.length})</option>)}</select></div>
            <div className="field"><label>Colours</label><div className="row"><input type="color" value={c.color} onChange={(e) => up({ color: e.target.value })} /><input type="color" value={c.color2} onChange={(e) => up({ color2: e.target.value })} /></div></div>
            <div className="field"><label>Symbol</label><div className="row wrap">{SYMBOL_KEYS.map((k) => <button key={k} className="btn sm" style={{ borderColor: c.symbol === k ? c.color : undefined }} onClick={() => up({ symbol: k })}><Symbol p={{ ...c, symbol: k }} size={22} /></button>)}</div></div>
          </div>
          <div className="field" style={{ marginTop: 12 }}><label>Leadership style</label><Seg value={c.leaderStyle} onChange={(v) => up({ leaderStyle: v })} options={STYLES.map((s) => ({ v: s, label: s[0].toUpperCase() + s.slice(1) }))} /></div>
        </Panel>
        <Panel title="Positions">
          <div className="grid g2">
            {([['econ', 'State-led economy', 'Market economy', -1, 1], ['social', 'Liberal / secular', 'Conservative / nationalist', -1, 1], ['federal', 'Strong centre', 'State autonomy', -1, 1], ['welfare', 'Lean welfare', 'Generous welfare', 0, 1]] as const).map(([k, lo, hi, a, b]) => (
              <div key={k} className="field"><label>{lo} ↔ {hi}</label><input type="range" min={a} max={b} step={0.05} value={c.ideology[k]} onChange={(e) => ideo(k, +e.target.value)} /></div>
            ))}
          </div>
          <div className="field" style={{ marginTop: 12 }}><label>Focus issues (pick up to 3; a third one costs ₹40 cr of launch budget)</label>
            <div className="row wrap">{ISSUES.map((i) => {
              const on = c.focusIssues.includes(i.id);
              return <button key={i.id} className={`btn sm ${on ? 'primary' : ''}`} onClick={() => up({ focusIssues: on ? c.focusIssues.filter((x) => x !== i.id) : c.focusIssues.length < 3 ? [...c.focusIssues, i.id as Issue] : c.focusIssues })}>{i.name}</button>;
            })}</div>
          </div>
        </Panel>
        <Panel title="Organisation">
          <div className="grid g2">
            <div className="field"><label>Structure</label><Seg value={c.structure} onChange={(v) => up({ structure: v })} options={[{ v: 'centralised', label: 'Centralised' }, { v: 'federated', label: 'Federated' }, { v: 'movement', label: 'Movement' }]} />
              <span className="tiny dim">{c.structure === 'centralised' ? 'United and disciplined, thinner on the ground.' : c.structure === 'federated' ? 'Stronger local machines, louder regional bosses.' : 'Energised volunteers, almost no machine.'}</span></div>
            <div className="field"><label>Candidate recruitment</label><Seg value={c.recruitment} onChange={(v) => up({ recruitment: v })} options={[{ v: 'local_notables', label: 'Local notables' }, { v: 'cadre', label: 'Cadre' }, { v: 'professionals', label: 'Professionals' }]} />
              <span className="tiny dim">{c.recruitment === 'local_notables' ? 'Popular but less loyal.' : c.recruitment === 'cadre' ? 'Loyal organisers with less personal pull.' : 'Capable administrators, weaker local roots.'}</span></div>
            <div className="field"><label>Starting funds: ₹{c.startingFunds} cr</label><input type="range" min={20} max={240} step={5} value={c.startingFunds} onChange={(e) => up({ startingFunds: +e.target.value })} /></div>
            <div className="field"><label>Public recognition: {Math.round(c.recognition * 100)}%</label><input type="range" min={0.05} max={0.6} step={0.05} value={c.recognition} onChange={(e) => up({ recognition: +e.target.value })} /></div>
          </div>
        </Panel>
      </div>
      <div className="col">
        <Panel title="Launch budget" className="glow">
          <div className="row"><span className="mono" style={{ fontSize: 28, color: cost > CUSTOM_BUDGET ? 'var(--bad)' : 'var(--ink)' }}>{Math.round(cost)}</span><span className="dim">/ {CUSTOM_BUDGET}</span></div>
          <Meter v={cost} max={CUSTOM_BUDGET} color={cost > CUSTOM_BUDGET ? 'var(--bad)' : 'var(--accent)'} />
          <p className="small muted">Funds and recognition both draw on the same launch budget. Overspend and the excess comes out of your cash on day one.</p>
        </Panel>
        <Panel title="Who will warm to you">
          {perception.map((p, i) => <div key={p.name} className="row small" style={{ padding: '3px 0' }}><span className="grow">{p.name}</span><span className={i < 3 ? 'good' : i > 5 ? 'bad' : 'muted'}>{i < 3 ? 'Receptive' : i > 5 ? 'Sceptical' : 'Open'}</span></div>)}
          <p className="tiny dim">A rough read from your positions and focus issues. The simulation works this out per constituency.</p>
        </Panel>
        <Panel title="Natural allies and rivals">
          {allies.slice(0, 4).map(({ p }) => <div key={p.id} className="row small"><i className="pdot" style={{ background: p.color }} />{p.short}<span className="good right">Close</span></div>)}
          <div style={{ height: 8 }} />
          {allies.slice(-3).map(({ p }) => <div key={p.id} className="row small"><i className="pdot" style={{ background: p.color }} />{p.short}<span className="bad right">Distant</span></div>)}
        </Panel>
      </div>
    </div>
  );
}
