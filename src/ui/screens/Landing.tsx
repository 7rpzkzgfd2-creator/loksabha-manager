import { useEffect, useMemo, useState } from 'react';
import { PARTY_BY_ID } from '../../engine/index.ts';
import { Hemicycle } from '../components.tsx';
import { SupportButton } from '../support.tsx';

// 2024 seat totals (ECI) for the hero chamber; it fills in seat by seat on load.
const SEATS_2024: [string, number][] = [['BJP', 240], ['TDP', 16], ['JDU', 12], ['SHS', 7], ['NCP', 1], ['INC', 99], ['SP', 37], ['AITC', 29], ['DMK', 22], ['SSUBT', 9], ['NCPSP', 8], ['RJD', 4], ['CPIM', 4], ['IUML', 3], ['JMM', 3], ['AAP', 3], ['CPI', 2]];

const FEATURES = [
  { t: 'All 543 seats', s: 'Every constituency is simulated voter group by voter group, with real 2014, 2019 and 2024 starting points.' },
  { t: 'Campaign state by state', s: 'Split your money across states, pick the issue, send your leaders on tour. Spend too much in one place and returns fall off.' },
  { t: 'Pick your candidates', s: 'Each candidate has issues they are strong and weak on. A good fit for the seat can swing a close race.' },
  { t: 'Start your own party', s: 'Build a party from nothing in your home state and grow it over several elections.' },
  { t: 'Alliances and government', s: 'Hang parliament? Bargain with partners for ministries, form a government, then try to survive five years.' },
  { t: 'Play with friends', s: 'Multiplayer lobbies: each of you leads a party and campaigns against the others, turn by turn.' },
];

const STEPS = [
  ['Choose', 'Lead a real party in 2014, 2019 or 2024, or start your own.'],
  ['Campaign', 'Six weeks of state budgets, rallies, media, tickets and alliances.'],
  ['Count', 'Watch election night unfold seat by seat, then see why each seat went the way it did.'],
];

export default function Landing({ onPlay, onMulti }: { onPlay: () => void; onMulti: () => void }) {
  const all = useMemo(() => SEATS_2024.flatMap(([p, n]) => Array(n).fill(PARTY_BY_ID[p]?.color ?? '#555')), []);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(all.length); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 1600); setN(Math.round(all.length * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [all]);

  return (
    <div className="landing">
      <header className="l-nav">
        <div className="row"><span className="l-logo">LS</span><b className="display">Lok Sabha Manager</b></div>
        <div className="row right"><SupportButton className="btn ghost" /><button className="btn primary" onClick={onPlay}>Play now</button></div>
      </header>

      <section className="l-hero">
        <div className="l-copy">
          <div className="upper" style={{ color: 'var(--accent)' }}>Free · in your browser · no sign-up</div>
          <h1>Win India's general election.</h1>
          <p>Run a party's campaign across 543 seats. Set state budgets, choose candidates, build alliances, and see if you can reach 272.</p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button className="btn primary l-cta" onClick={onPlay}>Play now</button>
            <button className="btn l-cta" onClick={onMulti}>Play with friends</button>
          </div>
        </div>
        <div className="l-chamber">
          <Hemicycle dots={all.slice(0, n)} label="2024 Lok Sabha by party" />
          <div className="tiny dim" style={{ textAlign: 'center' }}>The 2024 House. Can you redraw it?</div>
        </div>
      </section>

      <section className="l-sec">
        <h2>How it plays</h2>
        <div className="l-steps">
          {STEPS.map(([t, s], i) => <div key={t} className="l-step"><span className="mono">{String(i + 1).padStart(2, '0')}</span><b>{t}</b><p>{s}</p></div>)}
        </div>
      </section>

      <section className="l-sec">
        <h2>What's in it</h2>
        <div className="l-grid">
          {FEATURES.map((f) => <div key={f.t} className="l-card"><b>{f.t}</b><p>{f.s}</p></div>)}
        </div>
      </section>

      <section className="l-sec l-final">
        <h2>Votes aren't seats.</h2>
        <p>A party at 20% everywhere can win nothing, while one at 40% in the right states can win a lot. Find out where your votes count.</p>
        <button className="btn primary l-cta" onClick={onPlay}>Start a campaign</button>
      </section>

      <footer className="l-foot">
        <span>A strategy game, not a prediction and not an endorsement of any party. Results are simulated.</span>
        <SupportButton className="btn sm ghost" />
      </footer>
    </div>
  );
}
