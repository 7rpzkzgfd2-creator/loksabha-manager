import { useState } from 'react';
import { useStore } from './store.tsx';
import type { Screen } from './store.tsx';
import { pref, setPref } from './persist.ts';

const STEPS: { title: string; body: string; screen?: Screen }[] = [
  { title: 'How the Lok Sabha works', body: 'India elects 543 MPs, one per constituency. Whoever gets the most votes in a seat wins it, even with 30%. 272 seats is a majority. The left sidebar holds every screen; the Continue button (top right) ends your week.', screen: 'home' },
  { title: 'Votes are not seats', body: 'National Overview shows each party’s projected vote share next to its seat share. A party can win more votes than a rival and still win fewer seats if its support is spread thin.', screen: 'national' },
  { title: 'Constituencies decide everything', body: 'The Map and the Constituencies table list every seat. Click any one to see the forecast, the candidates, local issues and campaign activity, and to campaign there directly.', screen: 'map' },
  { title: 'Choosing candidates', body: 'During the first two weeks you can change tickets. Popular local notables win votes but upset loyalists; loyal organisers keep the party calm. Integrity stays hidden until you commission research.', screen: 'candidates' },
  { title: 'Spending your week', body: 'The Campaign planner is where you queue rallies, town halls, door-to-door drives, digital campaigns and organisation building. Money, leader days and team capacity are all limited. Effects depend on context and are never fixed.', screen: 'campaign' },
  { title: 'The calendar', body: 'Weeks 1–2 are preparation: tickets, manifesto and alliances lock at the end of week 2. The last two weeks are the final push. Then polling day and a live count.', screen: 'home' },
  { title: 'Reading forecasts', body: 'Polling shows projections with ranges. Our polls carry a hidden error; a data analyst and research shrink it. Ratings run from Safe to Toss-up and update every week.', screen: 'polling' },
  { title: 'Alliances', body: 'Partners stand down for each other in shared seats, but only part of their vote transfers. Low trust or ideological distance means more of it leaks away.', screen: 'alliances' },
  { title: 'Crises', body: 'Events arrive in your inbox with options. None is right every time: the outcome depends on facts you may not fully know. Unanswered events take the passive option.', screen: 'events' },
  { title: 'Results', body: 'After polling day you watch the count round by round, then read why it went the way it did. The War room has advice all through the campaign. Good luck.', screen: 'warroom' },
];

export default function Tutorial() {
  const { go, game } = useStore();
  const [step, setStep] = useState<number>(() => pref('tutorial', 0));
  if (!game || step >= STEPS.length || game.config.difficulty === 'hard' && step === 0 && pref('tutorialSeen', false)) return null;
  const s = STEPS[step];
  const next = (n: number) => { setStep(n); setPref('tutorial', n); if (n < STEPS.length && STEPS[n].screen) go(STEPS[n].screen!); if (n >= STEPS.length) setPref('tutorialSeen', true); };
  return (
    <div className="tutorial" role="dialog" aria-label="Tutorial">
      <div className="row"><span className="upper" style={{ color: 'var(--accent)' }}>Tutorial {step + 1}/{STEPS.length}</span><button className="btn ghost sm right" onClick={() => next(STEPS.length)}>Skip tutorial</button></div>
      <h3 className="display" style={{ margin: '8px 0 6px', fontSize: 18 }}>{s.title}</h3>
      <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>{s.body}</p>
      <div className="row" style={{ marginTop: 14 }}>
        {step > 0 && <button className="btn sm ghost" onClick={() => next(step - 1)}>Back</button>}
        <button className="btn sm primary right" onClick={() => next(step + 1)}>{step === STEPS.length - 1 ? 'Done' : 'Next'}</button>
      </div>
    </div>
  );
}
