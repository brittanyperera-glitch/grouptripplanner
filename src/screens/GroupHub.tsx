import './GroupHub.css';
import { useEffect, useState } from 'react';
import CrewStrip from '../components/CrewStrip';
import { IconGroup, IconList, IconRight, IconSpark } from '../components/Icons';
import { motion, MOTION, navigate } from '../components/motion';
import { outstanding } from '../lib/outstanding';
import { useApp } from '../state';
import { isGuest, PEOPLE } from '../types';
import type { GroupResult } from '../types';
import Everyone from './Everyone';
import Friends from './Friends';
import Knockouts from './Knockouts';

export type GroupView = 'hub' | 'stats' | 'knockouts' | 'picks';

const PULSE_EVERY_MS = 4000;

/** One line for what is outstanding: my count first, then who else still has a vote to cast. */
function koLines(open: number, mine: number, others: string[]): string[] {
  const names = others.join(', ');
  if (open === 0) return ['All decided'];
  if (mine > 0) return [`You have ${mine} to vote on`, ...(others.length ? [`Still to vote: ${names}`] : [])];
  return [others.length ? `You've voted. Waiting on ${names}` : 'All voted'];
}

function Block({ icon, title, lines, onOpen, alert, pulse }: { icon: JSX.Element; title: string; lines: string[]; onOpen(): void; alert?: boolean; pulse?: boolean }) {
  return (
    <button type="button" className={`gh-block${alert ? ' gh-alert' : ''}`} data-pulse={pulse ? '1' : undefined} onClick={onOpen}>
      <span className="gh-icon" aria-hidden="true">{icon}</span>
      <span className="gh-text">
        <b>{title}</b>
        {lines.map(l => <small key={l}>{l}</small>)}
      </span>
      <span className="gh-go" aria-hidden="true"><IconRight size={20} /></span>
    </button>
  );
}

export default function GroupHub({ group, view, onView }: { group: GroupResult; view: GroupView; onView(v: GroupView): void }) {
  const { state, me } = useApp();
  const { open, mine, others } = outstanding(group, state.votes, me);
  const stats = !isGuest(me) && PEOPLE.every(p => state.responses[p]?.submitted);
  const [pulse, setPulse] = useState(false);

  // One buzz when the hub opens, then a nudge every few seconds while I still owe a vote.
  const owing = mine > 0;
  useEffect(() => {
    if (!owing) return;
    try { navigator.vibrate?.([60, 40, 60]); } catch { /* vibration is not available here */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!owing || motion() !== 'full') return;
    let off: ReturnType<typeof setTimeout>;
    const nudge = () => { setPulse(true); off = setTimeout(() => setPulse(false), MOTION.slow); };
    const first = setTimeout(nudge, MOTION.base);
    const every = setInterval(nudge, PULSE_EVERY_MS);
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(off); };
  }, [owing]);

  const go = (v: GroupView) => navigate(v === 'hub' ? 'back' : 'fwd', () => onView(v));

  if (view !== 'hub') {
    return (
      <>
        <div className="body gh-top"><button type="button" className="link gh-back" onClick={() => go('hub')}>Back</button></div>
        {view === 'stats' && <Friends />}
        {view === 'knockouts' && <Knockouts group={group} />}
        {view === 'picks' && <Everyone open />}
      </>
    );
  }
  return (
    <>
      <section className="body gh-hub" aria-label="Group">
        {stats && <Block icon={<IconGroup size={26} />} title="Group stats" lines={['Who travels like who']} onOpen={() => go('stats')} />}
        <Block icon={<IconSpark size={26} />} title="Group knockouts" lines={koLines(open, mine, others)} onOpen={() => go('knockouts')} alert={owing} pulse={pulse} />
        <Block icon={<IconList size={26} />} title="Everyone's picks" lines={['Every place, every tier']} onOpen={() => go('picks')} />
      </section>
      <div className="gh-crew"><CrewStrip /></div>
    </>
  );
}
