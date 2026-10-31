import { DATA_COMPILED } from '../../engine/index.ts';
import { useEffect, useState } from 'react';
import { SCENARIO_BY_ID } from '../../engine/index.ts';
import { useGame, useStore } from '../store.tsx';
import { listSaves, saveGame, setPref } from '../persist.ts';
import type { SaveMeta } from '../persist.ts';
import { Confirm, PageHead, Panel } from '../components.tsx';

export default function Settings() {
  const g = useGame();
  const { quit, toast, mpInfo, loadState } = useStore();
  const [name, setName] = useState(`${g.parties[g.playerParty].short} ${g.year}`);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { listSaves().then(setSaves).catch(() => {}); }, []);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(g)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `loksabha-${g.playerParty}-${g.year}-w${g.campaignTurn}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = (f: File) => f.text().then((t) => { const s = JSON.parse(t); if (!s?.seats || s.seats.length !== 543) throw new Error('Not a Lok Sabha Manager save.'); loadState(s); toast('Save imported.'); }).catch((e) => toast(String(e.message ?? e), true));
  const sc = SCENARIO_BY_ID[g.config.scenarioId];
  return (
    <>
      <PageHead title="Settings & saves" />
      <div className="grid g2">
        {!mpInfo && (
          <Panel title="Save game">
            <div className="row"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /><button className="btn primary" onClick={() => saveGame(name || 'Save', g).then(() => { toast('Saved.'); return listSaves().then(setSaves); }).catch(() => toast('Could not save in this browser.', true))}>Save</button></div>
            <div className="tiny dim" style={{ marginTop: 8 }}>The game also autosaves after every turn. Saves live in this browser.</div>
            <div className="col small" style={{ marginTop: 12 }}>{saves.map((s) => <div key={s.slot} className="row"><span className="grow">{s.slot === 'autosave' ? 'Autosave' : s.slot}</span><span className="dim">{new Date(s.savedAt).toLocaleString()}</span></div>)}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={exportJson}>Export to file</button>
              <label className="btn sm">Import file<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} /></label>
            </div>
          </Panel>
        )}
        <Panel title="This game">
          <div className="grid g2 small" style={{ gap: 6 }}>
            <span className="dim">Scenario</span><span>{sc.title}</span>
            <span className="dim">Mode</span><span>{g.config.mode}</span>
            <span className="dim">Difficulty</span><span>{g.config.difficulty}</span>
            <span className="dim">Seed</span><span className="mono">{g.config.seed}</span>
            <span className="dim">Campaign length</span><span>{g.config.campaignTurns} weeks</span>
            <span className="dim">Event frequency</span><span>{g.config.eventFrequency}x</span>
          </div>
          {g.config.mode === 'sandbox' && <div className="chip warn" style={{ marginTop: 10 }}>Sandbox: custom rules in effect</div>}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn sm" onClick={() => { setPref('tutorial', 0); toast('Tutorial restarted.'); location.reload(); }}>Restart tutorial</button>
            <button className="btn sm danger" onClick={() => setLeaving(true)}>Quit to main menu</button>
          </div>
        </Panel>
        <Panel title="Where the numbers come from" style={{ gridColumn: '1 / -1' }}>
          <div className="small muted" style={{ lineHeight: 1.7 }}>
            <p style={{ marginTop: 0 }}><b>Historical:</b> state and UT seat counts and constituency names follow the 2008 delimitation; recorded national seat totals for the largest parties come from Election Commission of India results and are shown only for comparison.</p>
            <p><b>Estimates:</b> starting vote shares by state, party attributes (leader standing, organisation, funds, cohesion), constituency electors, urbanisation and turnout are hand-set approximations to make the game behave plausibly. They are not official statistics or real polling.</p>
            <p><b>Simulated:</b> everything that happens in play, including "previous results", forecasts, polls, events and election outcomes. The model is not validated as a predictor of real elections.</p>
            <p><b>Real people:</b> in the 2014, 2019 and 2024 scenarios, party leaders and some candidates are real politicians. Their names, party in that election, the seat they contested and their public role are compiled from public records ({DATA_COMPILED}); check against ECI before citing. Their ratings and strong/weak issues are gameplay estimates. The 2029 scenario uses 2024 roles and affiliations, marked "as of 2024". Real people are never the subject of scandals, bribes or defections in the game. Everything that happens to them during play is simulated, not a real event.</p>
            <p><b>Fictional:</b> all other candidates, staff and media outlets are invented. Simulated news never quotes a real person.</p>
            <p><b>Party branding:</b> parties are shown with a plain name badge in party colours, and their ECI election symbol is named in text (for example "Lotus"). The game does not include or imitate official logos or symbol artwork.</p>
            <p style={{ marginBottom: 0 }}><b>Voters:</b> modelled as broad, overlapping economic and life-stage groups. Caste, religion and language enter only through each seat's historical baseline; no identity mechanically decides anyone's vote. Real boundary maps are not bundled; the map is a schematic tile layout.</p>
          </div>
        </Panel>
      </div>
      {leaving && <Confirm text={mpInfo ? 'Leave this multiplayer session? You can rejoin with the same browser.' : 'Quit to the main menu? Your last turn is autosaved.'} yes="Quit" onYes={quit} onNo={() => setLeaving(false)} />}
    </>
  );
}
