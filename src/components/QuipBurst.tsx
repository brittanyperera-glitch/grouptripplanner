import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { Tier } from '../types';
import { motion } from './motion';

export type QuipKind = Tier | 'hi';

// Ease in, hold fully readable, ease out. Brittany could not read the old 1.25 s burst.
export const QUIP_MS = { in: 400, hold: 1700, out: 400 };
const LIFE = QUIP_MS.in + QUIP_MS.hold + QUIP_MS.out;
const KICKER: Record<QuipKind, string> = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip', hi: '' };
const COLORS: Record<QuipKind, string[]> = {
  must: ['#FF7A1A', '#FFC15E', '#FF4D6D', '#FFE2B8'],
  keen: ['#2BB673', '#9BF0C4', '#FFE27A', '#FFFFFF'],
  meh: ['#8A9098', '#B9BEC4', '#6C727A'],
  skip: ['#E5483C', '#FF8A80', '#9E2B22'],
  hi: ['#FF7A1A', '#FFC15E', '#FF4D6D', '#2BB673', '#7FD3FF'],
};
const GLYPHS: Record<QuipKind, string[]> = {
  must: ['✦', '✸', '✦', '✶', '✦', '✸'],
  keen: ['✨', '✦', '•', '✦'],
  meh: ['•'],
  skip: ['•', '💧', '•'],
  hi: ['▬', '●', '▲', '■'],
};
const PARTICLES = 9;

interface Part { style: CSSProperties; glyph: string }

function particles(kind: QuipKind): Part[] {
  const colors = COLORS[kind];
  const glyphs = GLYPHS[kind];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  return Array.from({ length: PARTICLES }, (_, i) => {
    const color = colors[i % colors.length];
    const glyph = glyphs[i % glyphs.length];
    let v: Record<string, string>;
    if (kind === 'must') {
      // a few sparks drifting gently outwards, away from the text
      const centres = [[22, 24], [78, 22], [50, 82]];
      const [cx, cy] = centres[i % 3];
      const a = (Math.floor(i / 3) / 3) * Math.PI * 2 + rnd(-0.3, 0.3);
      const r = rnd(30, 60);
      v = { x: `${cx}%`, y: `${cy}%`, dx: `${Math.cos(a) * r}px`, dy: `${Math.sin(a) * r}px`, d: `${(i % 3) * 200 + rnd(0, 150)}ms` };
    } else if (kind === 'keen') {
      v = { x: `${rnd(6, 94)}%`, y: `${rnd(10, 90)}%`, dx: `${rnd(-12, 12)}px`, dy: `${rnd(-60, -20)}px`, d: `${rnd(0, 520)}ms` };
    } else if (kind === 'meh') {
      v = { x: `${rnd(0, 30)}%`, y: `${rnd(15, 85)}%`, dx: `${rnd(120, 300)}px`, dy: `${rnd(-20, 20)}px`, d: `${rnd(0, 400)}ms` };
    } else if (kind === 'skip') {
      v = { x: `${rnd(8, 92)}%`, y: `${rnd(0, 18)}%`, dx: `${rnd(-10, 10)}px`, dy: `${rnd(80, 160)}px`, d: `${rnd(0, 600)}ms` };
    } else {
      v = { x: `${rnd(4, 96)}%`, y: `${rnd(0, 14)}%`, dx: `${rnd(-20, 20)}px`, dy: `${rnd(100, 200)}px`, d: `${rnd(0, 600)}ms` };
    }
    const style = {
      '--x': v.x, '--y': v.y, '--dx': v.dx, '--dy': v.dy, '--d': v.d,
      '--rot': `${rnd(-60, 60)}deg`, '--s': rnd(0.6, 1.1).toFixed(2), color,
    } as CSSProperties;
    return { style, glyph };
  });
}

const sizeOf = (t: string) => (t.length <= 10 ? 'xl' : t.length <= 24 ? 'l' : t.length <= 44 ? 'm' : 's');

export default function QuipBurst({ text, kind = 'hi', onDone }: { text: string; kind?: QuipKind; onDone: () => void }) {
  const mode = useMemo(motion, []);
  // Only Must and Skip get a burst; Keen and Meh just slide away.
  const quiet = kind === 'keen' || kind === 'meh';
  const parts = useMemo(() => (mode === 'full' ? particles(kind) : []), [mode, kind]);

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
      {parts.length > 0 && (
        <div className="quip-parts" aria-hidden="true">
          {parts.map((p, i) => <span key={i} className="quip-p" style={p.style}>{p.glyph}</span>)}
        </div>
      )}
      <div className="quip-stage">
        {mode === 'full' && kind === 'skip' && <div className="quip-emoji drop" aria-hidden="true">💧</div>}
        {KICKER[kind] && <div className="quip-kicker" aria-hidden="true">{KICKER[kind]}</div>}
        <p className={`quip-text ${sizeOf(text)}`} role="status">{text}</p>
      </div>
    </div>
  );
}
