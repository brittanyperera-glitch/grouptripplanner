import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Tier } from '../types';
import { motion } from './motion';

export type QuipKind = Tier | 'hi';

// Ease in, hold fully readable, ease out. Brittany could not read the old 1.25 s burst.
export const QUIP_MS = { in: 400, hold: 1700, out: 400 };
const LIFE = QUIP_MS.in + QUIP_MS.hold + QUIP_MS.out;
const KICKER: Record<QuipKind, string> = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip', hi: '' };
const MAX_PX = 128, MIN_PX = 40;

/**
 * One big line for every quip (Brittany 2026-10-15, after "it's decided"): start at MAX_PX and shrink until the longest word fits
 * the app column and the wrapped block fits about half the screen. The column, not the window: on desktop the column clips it.
 */
function BigLine({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const col = el.closest<HTMLElement>('.app');
    const fit = () => {
      const avail = (col?.clientWidth ?? Math.min(window.innerWidth, 440)) - 40;
      const tall = window.innerHeight * 0.55;
      let px = MAX_PX;
      el.style.fontSize = `${px}px`;
      while (px > MIN_PX && (el.scrollWidth > avail || el.offsetHeight > tall)) {
        px = Math.max(MIN_PX, Math.floor(px * 0.92));
        el.style.fontSize = `${px}px`;
      }
    };
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [text]);
  return <p ref={ref} className="quip-text" role="status">{text}</p>;
}

export default function QuipBurst({ text, kind = 'hi', onDone }: { text: string; kind?: QuipKind; onDone: () => void }) {
  const mode = useMemo(motion, []);
  // Only Must and Skip get a burst; Keen and Meh just slide away.
  const quiet = kind === 'keen' || kind === 'meh';

  useEffect(() => {
    if (quiet) { onDone(); return; }
    const t = setTimeout(onDone, LIFE);
    // Tap anywhere to skip. The overlay ignores the pointer, so that same tap still reaches the app.
    const skip = () => onDone();
    document.addEventListener('pointerdown', skip, true);
    document.addEventListener('keydown', skip, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', skip, true);
      document.removeEventListener('keydown', skip, true);
    };
  }, [mode, onDone, quiet]);

  if (quiet) return null;
  if (mode === 'still') return <div className="quip-toast" role="status">{text}</div>;

  return (
    <div className={`quip quip-${kind} quip-${mode}`}
      style={{ '--in': `${QUIP_MS.in}ms`, '--hold': `${QUIP_MS.hold}ms`, '--out': `${QUIP_MS.out}ms` } as CSSProperties}>
      <div className="quip-flash" aria-hidden="true" />
      <div className="quip-stage">
        {KICKER[kind] && <div className="quip-kicker" aria-hidden="true">{KICKER[kind]}</div>}
        <BigLine text={text} />
      </div>
    </div>
  );
}
