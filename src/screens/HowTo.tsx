import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import Avatar from '../components/Avatar';
import { IconDown, IconLeft, IconRight, IconUp } from '../components/Icons';
import { buzz, motion, MOTION } from '../components/motion';
import { jingle, thud, unlock } from '../components/sound';
import TukTuk from '../components/TukTuk';
import type { Tier } from '../types';
import { useSwipe } from './useSwipe';
import './Rate.css';
import './HowTo.css';

export interface HowToCopy {
  intro: string[];
  /** `say` is one sentence with the vote word in braces ("You can {Skip} it."); `line` is the small line under it. */
  practice: Record<Tier, { say: string; line: string }>;
  nudge: string;
  progress: string;
  natural: string;
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
const BIG: Record<Tier, ReactNode> = { must: <IconRight size={26} />, keen: <IconUp size={26} />, meh: <IconDown size={26} />, skip: <IconLeft size={26} /> };
const KEYS: Record<string, Tier> = { ArrowRight: 'must', ArrowUp: 'keen', ArrowDown: 'meh', ArrowLeft: 'skip' };
const CHAR_MS = 24;
// The tuk-tuk crosses the finale once; five slow steps reads as a drive, not a dash.
const DRIVE_MS = MOTION.slow * 5;
// The word demonstrates its swipe for two slow steps, rests for two, then goes again.
const MOVE_MS = MOTION.slow * 2;
const MOVE_EVERY = MOTION.slow * 4;
// Skip shakes left, Meh nods down, Keen bobs up, Must lunges right.
const MOVES: Record<Tier, Keyframe[]> = {
  skip: ['0', '-14px', '-4px', '-14px', '-4px', '0'].map(x => ({ transform: `translateX(${x})` })),
  meh: ['0', '12px', '0', '12px', '0'].map(y => ({ transform: `translateY(${y})` })),
  keen: ['0', '-14px', '0'].map(y => ({ transform: `translateY(${y})` })),
  must: [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)', offset: 0.3 }, { transform: 'translateX(26px)', offset: 0.6 }, { transform: 'translateX(0)' }],
};
// Where the sentence leaves to when its word is swiped.
const OUT: Record<Tier, [number, number]> = { skip: [-1, 0], must: [1, 0], keen: [0, -1], meh: [0, 1] };
const BURST_SHAPES = 14;

interface Parts { before: string; word: string; after: string }
const parseSay = (s: string): Parts => {
  const m = s.match(/^(.*)\{(.+)\}(.*)$/);
  return m ? { before: m[1], word: m[2], after: m[3] } : { before: s, word: '', after: '' };
};

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
  // The blinking caret sits on the line being typed; it is gone once everything is out.
  const caret = instant || done ? -1 : pos.l;
  return { done, typed, skipLine, caret };
}

function Lines({ lines, tw, className }: { lines: string[]; tw: ReturnType<typeof useTypewriter>; className?: string }) {
  return (
    <div className={`hw-lines${className ? ` ${className}` : ''}`}>
      {lines.map((l, i) => {
        const t = tw.typed(i);
        // The untyped rest keeps its space (hidden) so the lines below do not jump as it types.
        return <p key={i}>{t}{i === tw.caret && <span className="hw-caret" aria-hidden="true" />}<span className="hw-rest" aria-hidden="true">{l.slice(t.length)}</span></p>;
      })}
    </div>
  );
}

/** A short burst of small shapes in the tier's colour, flying out from the word. CSS only. */
function Burst({ tier, x, y }: { tier: Tier; x: number; y: number }) {
  return (
    <div className={`hw-burst ${tier}`} aria-hidden="true" style={{ left: x, top: y }}>
      {Array.from({ length: BURST_SHAPES }, (_, i) => (
        <span key={i} style={{ '--a': `${(360 / BURST_SHAPES) * i}deg`, '--d': `${96 + (i % 3) * 28}px` } as CSSProperties} />
      ))}
    </div>
  );
}

interface Fly {
  k: number; tier: Tier; parts: Parts; dx: number; dy: number;
  pill: { l: number; t: number; w: number; h: number }; sent: { l: number; t: number; w: number };
}

interface SayProps {
  tier: Tier; say: string; line: string; voting: boolean; touched: boolean; wobble: number;
  pillRef: RefObject<HTMLSpanElement>; sentRef: RefObject<HTMLParagraphElement>;
  bind: ReturnType<typeof useSwipe>['bind']; dragStyle?: CSSProperties; dragging: boolean;
}

/** One practice screen: a single sentence, with the vote word inline as the thing you swipe. */
function Say({ tier, say, line, voting, touched, wobble, pillRef, sentRef, bind, dragStyle, dragging }: SayProps) {
  const parts = useMemo(() => parseSay(say), [say]);
  const full = parts.before + parts.word + parts.after;
  const lines = useMemo(() => [full], [full]);
  const tw = useTypewriter(lines, true);
  const anim = motion() === 'full';
  const moving = anim && voting && !touched && tw.done;

  // The word shows its own swipe until the player touches anything on this screen.
  useEffect(() => {
    if (!moving) return;
    let a: Animation | undefined;
    const run = () => { a = pillRef.current?.animate?.(MOVES[tier], { duration: MOVE_MS, easing: 'ease-in-out' }); };
    run();
    const t = setInterval(run, MOVE_EVERY);
    return () => { clearInterval(t); a?.cancel(); };
  }, [moving, tier, pillRef]);

  const n = tw.typed(0).length;
  const seg = (from: number, text: string) => {
    const have = Math.max(0, Math.min(text.length, n - from));
    return [text.slice(0, have), text.slice(have)] as const;
  };
  const [bv, br] = seg(0, parts.before);
  const [wv, wr] = seg(parts.before.length, parts.word);
  const [av, ar] = seg(parts.before.length + parts.word.length, parts.after);
  const at = tw.caret < 0 ? -1 : n <= parts.before.length ? 0 : n <= parts.before.length + parts.word.length ? 1 : 2;
  const caret = <span className="hw-caret" aria-hidden="true" />;
  const rest = (s: string) => <span className="hw-rest" aria-hidden="true">{s}</span>;

  return (
    <div className="hw-say" onClick={tw.skipLine}>
      <p className="hw-sentence" ref={sentRef}>
        {bv}{at === 0 && caret}{rest(br)}
        <span key={wobble} ref={pillRef} className={`hw-pill hw-card ${tier}${wobble ? ' nudged' : ''}${dragging ? ' dragging' : ''}${n <= parts.before.length ? ' unreached' : ''}${tw.done ? '' : ' typing'}`}
          data-dir={tier} data-moving={String(moving)} style={dragStyle} {...bind}>
          <span className={`hw-word ${tier}`}>{wv}{at === 1 && caret}{rest(wr)}</span>
          <span className="hw-arrow" aria-hidden="true">{BIG[tier]}</span>
        </span>
        {av}{at === 2 && caret}{rest(ar)}
      </p>
      <p className={`hw-step${tw.done ? ' shown' : ''}`}>{line}</p>
    </div>
  );
}

export default function HowTo({ copy, onDone, onSkip }: { copy: HowToCopy; onDone(): void; onSkip(): void }) {
  const [step, setStep] = useState(0);
  const [nudge, setNudge] = useState('');
  const [wobble, setWobble] = useState(0);
  const [touched, setTouched] = useState(false);
  const [fly, setFly] = useState<Fly | null>(null);
  const [finaleDone, setFinaleDone] = useState(false);
  const pillRef = useRef<HTMLSpanElement>(null);
  const sentRef = useRef<HTMLParagraphElement>(null);
  const tukRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const mode = motion();
  const anim = mode === 'full';
  const voting = step < ORDER.length;
  // The last word's flying copy still needs this view, so the finale waits for it.
  const practicing = voting || fly !== null;
  const finale = !practicing && anim && !finaleDone;
  const target = ORDER[Math.min(step, ORDER.length - 1)];

  const intro = useTypewriter(copy.intro, true);
  const rank = useTypewriter(copy.ranking, !practicing && !finale);

  const choose = useCallback((tier: Tier, dx = 0, dy = 0) => {
    if (!voting) return;
    setTouched(true);
    if (tier !== target) { setNudge(copy.nudge); setWobble(w => w + 1); return; }
    unlock();
    thud();
    buzz(tier);
    setNudge('');
    setWobble(0);
    setTouched(false);
    setStep(s => s + 1);
    const pill = pillRef.current, sent = sentRef.current;
    if (anim && pill && sent) {
      setFly({
        k: Date.now(), tier, parts: parseSay(copy.practice[tier].say), dx, dy,
        pill: { l: pill.offsetLeft, t: pill.offsetTop, w: pill.offsetWidth, h: pill.offsetHeight },
        sent: { l: sent.offsetLeft, t: sent.offsetTop, w: sent.offsetWidth },
      });
    }
  }, [voting, target, copy.nudge, copy.practice, anim]);

  const swipe = useSwipe((tier, dx, dy) => { swipe.reset(); choose(tier, dx, dy); }, () => { unlock(); setTouched(true); });
  const { drag } = swipe;

  useEffect(() => {
    if (!fly) return;
    const t = setTimeout(() => setFly(null), MOTION.slow);
    return () => clearTimeout(t);
  }, [fly]);

  // Finale: jingle, and the tuk-tuk drives across once (Web Animations, so the duration is the motion scale times five).
  useEffect(() => {
    if (!finale) return;
    jingle();
    const reach = (laneRef.current?.clientWidth ?? 440) + 30;
    const run = tukRef.current?.animate?.([{ transform: 'translateX(-90px)' }, { transform: `translateX(${reach}px)` }], { duration: DRIVE_MS, easing: 'linear', fill: 'forwards' });
    const t = setTimeout(() => setFinaleDone(true), DRIVE_MS + MOTION.base);
    return () => { run?.cancel(); clearTimeout(t); };
  }, [finale]);

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

  const dragStyle: CSSProperties | undefined = drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.05}deg)` } : undefined;
  const shown = Math.min(step + 1, ORDER.length);
  const outStyle = (t: Tier) => ({ '--ox': OUT[t][0], '--oy': OUT[t][1] }) as CSSProperties;

  return (
    <div className="body hw" onClick={finale ? () => setFinaleDone(true) : practicing ? intro.skipLine : rank.skipLine}>
      <div className="hw-top">
        <button className="link" onClick={e => { e.stopPropagation(); onSkip(); }}>{copy.skipTutorial}</button>
      </div>
      {practicing ? (
        <>
          {step === 0 && !fly && <Lines lines={copy.intro} tw={intro} />}
          {(step > 0 || intro.done) && (
            <div className="hw-practice">
              <div className="hw-progress">
                <span className="hw-count">{copy.progress} {shown}/{ORDER.length}</span>
                <span className="hw-slots" aria-hidden="true">
                  {ORDER.map((t, i) => <span key={t} className={`hw-slot${i < step ? ` filled ${t}` : ''}`} />)}
                </span>
              </div>
              <div className="hw-stage">
                {fly && (
                  <>
                    <p key={`o${fly.k}`} className="hw-sentence hw-leave" aria-hidden="true"
                      style={{ ...outStyle(fly.tier), left: fly.sent.l, top: fly.sent.t, width: fly.sent.w }}>
                      {fly.parts.before}<span className="hw-pill hw-oldpill">{fly.parts.word}<span className="hw-arrow">{BIG[fly.tier]}</span></span>{fly.parts.after}
                    </p>
                    <div key={`f${fly.k}`} className={`ghost hw-flyword ${fly.tier} fly-${fly.tier}`} aria-hidden="true"
                      style={{ left: fly.pill.l, top: fly.pill.t, width: fly.pill.w, height: fly.pill.h, '--gx': `${fly.dx}px`, '--gy': `${fly.dy}px`, '--gr': `${fly.dx * 0.05}deg` } as CSSProperties}>
                      <span className={`stamp hw-stamp ${fly.tier}`}>{LABEL[fly.tier]}</span>
                    </div>
                    <Burst tier={fly.tier} x={fly.pill.l + fly.pill.w / 2 + fly.dx} y={fly.pill.t + fly.pill.h / 2 + fly.dy} />
                  </>
                )}
                {voting && (
                  <Say key={step} tier={target} say={copy.practice[target].say} line={copy.practice[target].line} voting={voting}
                    touched={touched} wobble={wobble} pillRef={pillRef} sentRef={sentRef} bind={swipe.bind} dragStyle={dragStyle} dragging={!!drag} />
                )}
              </div>
              <div className="hw-nudge" role="status">{nudge}</div>
            </div>
          )}
        </>
      ) : finale ? (
        <div className="hw-finale">
          <p className="hw-natural">{copy.natural}</p>
          <div className="hw-hero"><Avatar name="Brittany" size={300} crop="stage" bob /></div>
          <div className="hw-lane" ref={laneRef}>
            <div className="hw-tuk" ref={tukRef}><TukTuk width={64} driving /></div>
          </div>
        </div>
      ) : (
        <>
          {mode === 'reduced' && (
            <div className="hw-finale still">
              <p className="hw-natural">{copy.natural}</p>
              <div className="hw-hero"><Avatar name="Brittany" size={140} crop="stage" /></div>
            </div>
          )}
          <Lines lines={copy.ranking} tw={rank} className="hw-rank" />
          <button className="cta" onClick={e => { e.stopPropagation(); onDone(); }}>{copy.go}</button>
        </>
      )}
      {practicing && (step > 0 || intro.done) && (
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
