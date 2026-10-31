import { useEffect, useMemo, useState } from 'react';
import { PARTY_BY_ID, SCENARIO_BY_ID } from '../../engine/index.ts';
import { listSaves, loadGame, deleteSave } from '../persist.ts';
import type { SaveMeta } from '../persist.ts';
import { useStore } from '../store.tsx';
import { Hemicycle, Modal } from '../components.tsx';

// 2024 recorded seat totals for the largest parties (ECI), used only to illustrate the chamber.
const SEATS_2024: [string, number][] = [['BJP', 240], ['TDP', 16], ['JDU', 12], ['SHS', 7], ['NCP', 1], ['INC', 99], ['SP', 37], ['AITC', 29], ['DMK', 22], ['SSUBT', 9], ['NCPSP', 8], ['RJD', 4], ['CPIM', 4], ['IUML', 3], ['JMM', 3], ['AAP', 3], ['CPI', 2]];

export type Mode = 'career' | 'quick' | 'historical' | 'sandbox' | 'multiplayer';

export default function Title({ onNew }: { onNew: (m: Mode) => void }) {
  const { loadState, toast } = useStore();
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [showLoad, setShowLoad] = useState(false);
  useEffect(() => { listSaves().then(setSaves).catch(() => setSaves([])); }, []);
  const dots = useMemo(() => SEATS_2024.flatMap(([p, n]) => Array(n).fill(PARTY_BY_ID[p]?.color ?? '#555')), []);
  const latest = saves?.[0];

  const items: { m: Mode; t: string; s: string }[] = [
    { m: 'career', t: 'Career', s: 'Lead a party across election cycles. Win, lose, rebuild.' },
    { m: 'quick', t: 'Quick election', s: 'One campaign, straight to polling day.' },
    { m: 'historical', t: 'Historical scenario', s: 'Replay 2014, 2019 or 2024 and change the outcome.' },
    { m: 'sandbox', t: 'Sandbox', s: 'Set the money, mood and rivals yourself.' },
    { m: 'multiplayer', t: 'Multiplayer', s: 'Host or join a turn-based lobby.' },
  ];

  return (
    <div className="wizard">
      <div className="wizard-in" style={{ maxWidth: 1100 }}>
        <div className="row" style={{ marginBottom: 28 }}>
          <span className="logo" style={{ width: 38, height: 38, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--accent)', color: '#111', font: '800 15px var(--display)' }}>LS</span>
          <div><div className="display" style={{ fontSize: 22, fontWeight: 800 }}>Lok Sabha Manager</div><div className="tiny dim">Indian general election simulation</div></div>
        </div>
        <div className="grid g-main">
          <div className="col" style={{ gap: 10 }}>
            {latest && (
              <button className="opt" style={{ padding: 18, borderColor: 'var(--accent)' }} onClick={async () => { const g = await loadGame(latest.slot); if (g) loadState(g); else toast('That save could not be read.', true); }}>
                <span className="upper" style={{ color: 'var(--accent)' }}>Continue</span>
                <b style={{ fontSize: 17 }}>{latest.partyName}</b>
                <span className="small muted">{SCENARIO_BY_ID[latest.scenario]?.title ?? latest.scenario} · {latest.year} · {latest.phase === 'campaign' ? `week ${latest.turn}` : latest.phase} · saved {new Date(latest.savedAt).toLocaleString()}</span>
              </button>
            )}
            {items.map((it) => (
              <button key={it.m} className="opt" style={{ padding: '14px 18px' }} onClick={() => onNew(it.m)}>
                <b style={{ fontSize: 15 }}>{it.t}</b><span className="small muted">{it.s}</span>
              </button>
            ))}
            <button className="opt" style={{ padding: '14px 18px' }} disabled={!saves?.length} onClick={() => setShowLoad(true)}>
              <b style={{ fontSize: 15 }}>Load game</b><span className="small muted">{saves?.length ? `${saves.length} saved game${saves.length > 1 ? 's' : ''}` : 'No saves yet'}</span>
            </button>
          </div>
          <div className="col" style={{ gap: 14 }}>
            <section className="panel">
              <div className="panel-h"><h3>The House</h3><span className="badge-prov right">Historical</span></div>
              <Hemicycle dots={dots} label="2024 Lok Sabha by party" />
              <div className="row small" style={{ marginTop: 8 }}><span className="dim">2024 result, largest parties (Election Commission of India). Smaller parties shown grey.</span></div>
            </section>
            <section className="panel">
              <div className="panel-h"><h3>How you win</h3></div>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>543 constituencies, each first-past-the-post. 272 is a majority.</li>
                <li>Votes are not seats: support spread thinly wins nothing.</li>
                <li>Every rally, ticket and alliance has a cost and a chance to backfire.</li>
                <li>Rivals adapt to what you do in public. They never see your plans.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
      {showLoad && (
        <Modal title={<b>Load game</b>} onClose={() => setShowLoad(false)}>
          <div className="col">
            {saves?.map((s) => (
              <div key={s.slot} className="row panel" style={{ padding: 12 }}>
                <div className="grow">
                  <b>{s.partyName}</b> <span className="dim">· {SCENARIO_BY_ID[s.scenario]?.title ?? s.scenario} · {s.mode}</span>
                  <div className="small dim">{s.slot === 'autosave' ? 'Autosave' : s.slot} · {s.year} · {s.phase === 'campaign' ? `week ${s.turn}` : s.phase} · {new Date(s.savedAt).toLocaleString()}</div>
                </div>
                <button className="btn sm danger" onClick={async () => { await deleteSave(s.slot); setSaves(await listSaves()); }}>Delete</button>
                <button className="btn sm primary" onClick={async () => { const g = await loadGame(s.slot); if (g) loadState(g); else toast('That save could not be read.', true); }}>Load</button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
