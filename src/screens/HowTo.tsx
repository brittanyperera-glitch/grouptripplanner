import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { IconDown, IconLeft, IconRight, IconUp } from '../components/Icons';
import { buzz, motion, MOTION } from '../components/motion';
import { thud, unlock } from '../components/sound';
import type { Tier } from '../types';
import { useSwipe } from './useSwipe';
import './HowTo.css';

export interface HowToCopy {
  intro: string[];
  practice: Record<Tier, { word: string; line: string }>;
  nudge: string;
  ranking: string[];
  go: string;
  skipTutorial: string;
}

export const HOWTO_KEY = 'tp:howto-seen';
export const markHowtoSeen = () => { try { localStorage.setItem(HOWTO_KEY, '1'); } catch { /* storage unavailable: it may show again */ } };
const howtoSeen = () => { try { return localStorage.getItem(HOWTO_KEY) !== null; } catch { return true; } };

// Tests and e2e run with motion off (see motion()), where the existing flow goes straight from pace to rating;
// ?howto=1 or ?quips=1 turns the screen on there.
const forcedOn = () => { const q = new URLSearchParams(window.location.search); return q.get('howto') === '1' || q.get('quips') === '1'; };

/** True for a player who has not seen the how-to, is not editing, has not submitted and has rated nothing. */
export function howtoWanted(copy: HowToCopy | undefined, p: { editing: boolean; submitted: boolean; rated: number }): boolean {
  if (!copy || p.editing || p.submitted || p.rated > 0 || howtoSeen()) return false;
  return motion() !== 'still' || forcedOn();
}

const ORDER: Tier[] = ['skip', 'meh', 'keen', 'must'];
const LABEL: Record<Tier, string> = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip' };
const ICON: Record<Tier, ReactNode> = { must: <IconRight size={16} />, keen: <IconUp size={16} />, meh: <IconDown size={16} />, skip: <IconLeft size={16} /> };
const BIG: Record<Tier, ReactNode> = { must: <IconRight size={44} />, keen: <IconUp size={44} />, meh: <IconDown size={44} />, skip: <IconLeft size={44} /> };
const KEYS: Record<string, Tier> = { ArrowRight: 'must', ArrowUp: 'keen', ArrowDown: 'meh', ArrowLeft: 'skip' };
const CHAR_MS = 24;

/** Types the lines out one after another. With motion off or reduced it shows them all at once. */
function useTypewriter(lines: string[], run: boolean) {
  const instant = motion() !== 'full';
  const [pos, setPos] = useState({ l: 0, c: 0 });
  const done = instant || pos.l >= lines.length;
  useEffect(() => {
    if (!run || done) return;
    const cur = lines[pos.l];
    const t = setTimeout(
      () => setPos(p => (p.c < cur.length ? { l: p.l, c: p.c + 1 } : { l: p.l + 1, c: 0 })),
      pos.c < cur.length ? CHAR_MS : MOTION.base,
    );
    return () => clearTimeout(t);
  }, [run, done, pos, lines]);
  const skipLine = useCallback(() => setPos(p => (p.l < lines.length ? { l: p.l, c: lines[p.l].length } : p)), [lines]);
  const typed = (i: number) => (instant || i < pos.l ? lines[i] : i === pos.l ? lines[i].slice(0, pos.c) : '');
  return { done, typed, skipLine };
}

function Lines({ lines, tw, className }: { lines: string[]; tw: ReturnType<typeof useTypewriter>; className?: string }) {
  return (
    <div className={`hw-lines${className ? ` ${className}` : ''}`}>
      {lines.map((l, i) => {
        const t = tw.typed(i);
        // The untyped rest keeps its space (hidden) so the lines below do not jump as it types.
        return <p key={i}>{t}<span className="hw-rest" aria-hidden="true">{l.slice(t.length)}</span></p>;
      })}
    </div>
  );
}

export default function HowTo({ copy, onDone, onSkip }: { copy: HowToCopy; onDone(): void; onSkip(): void }) {
  const [step, setStep] = useState(0);
  const [nudge, setNudge] = useState('');
  const [wobble, setWobble] = useState(0);
  const practicing = step < ORDER.length;
  const target = ORDER[Math.min(step, ORDER.length - 1)];

  const intro = useTypewriter(copy.intro, true);
  const rank = useTypewriter(copy.ranking, !practicing);
  const active = practicing ? intro : rank;

  const choose = useCallback((tier: Tier) => {
    if (!practicing) return;
    if (tier !== target) { setNudge(copy.nudge); setWobble(w => w + 1); return; }
    unlock();
    thud();
    buzz(tier);
    setNudge('');
    setWobble(0);
    setStep(s => s + 1);
  }, [practicing, target, copy.nudge]);

  const swipe = useSwipe(tier => { swipe.reset(); choose(tier); }, unlock);
  const { drag } = swipe;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || el?.closest('input, select, textarea')) return;
      const tier = KEYS[e.key];
      if (!tier) return;
      e.preventDefault();
      choose(tier);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose]);

  const cardStyle: CSSProperties | undefined = drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.05}deg)` } : undefined;
  const anim = motion() === 'full';

  return (
    <div className="body hw" onClick={active.skipLine}>
      <div className="hw-top">
        <button className="link" onClick={e => { e.stopPropagation(); onSkip(); }}>{copy.skipTutorial}</button>
      </div>
      {practicing ? (
        <>
          <Lines lines={copy.intro} tw={intro} />
          {intro.done && (
            <div className="hw-practice">
              <p className="hw-step">{copy.practice[target].line}</p>
              <div key={`${step}:${wobble}`} className={`hw-card dir-${target}${anim ? ' anim' : ''}${wobble ? ' nudged' : ''}${drag ? ' dragging' : ''}`}
                data-dir={target} style={cardStyle} {...swipe.bind}>
                <span className={`hw-word ${target}`}>{copy.practice[target].word}</span>
                <span className={`hw-arrow ${target}`} aria-hidden="true">{BIG[target]}</span>
              </div>
              <div className="hw-nudge" role="status">{nudge}</div>
            </div>
          )}
        </>
      ) : (
        <>
          <Lines lines={copy.ranking} tw={rank} className="hw-rank" />
          <button className="cta" onClick={e => { e.stopPropagation(); onDone(); }}>{copy.go}</button>
        </>
      )}
      {practicing && intro.done && (
        <div className="tiers hw-tiers">
          {ORDER.map(t => (
            <button key={t} className={`t ${t}${t === target ? ' target' : ''}`} onClick={e => { e.stopPropagation(); unlock(); choose(t); }}>
              <span className="t-ico">{ICON[t]}</span>{LABEL[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
