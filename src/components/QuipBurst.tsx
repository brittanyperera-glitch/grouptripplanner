import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { Tier } from '../types';
import { motion } from './motion';
import type { Motion as Mode } from './motion';

export type QuipKind = Tier | 'hi';

const LIFE: Record<Mode, number> = { full: 1250, reduced: 1400, still: 2200 };
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
const PARTICLES = 24;

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
      // three fireworks, eight sparks each, flying out from their centre
      const centres = [[24, 30], [76, 26], [50, 74]];
      const [cx, cy] = centres[i % 3];
      const a = (Math.floor(i / 3) / 8) * Math.PI * 2 + rnd(-0.2, 0.2);
      const r = rnd(70, 150);
      v = { x: `${cx}%`, y: `${cy}%`, dx: `${Math.cos(a) * r}px`, dy: `${Math.sin(a) * r}px`, d: `${(i % 3) * 80 + rnd(0, 50)}ms` };
    } else if (kind === 'keen') {
      v = { x: `${rnd(6, 94)}%`, y: `${rnd(10, 90)}%`, dx: `${rnd(-12, 12)}px`, dy: `${rnd(-60, -20)}px`, d: `${rnd(0, 520)}ms` };
    } else if (kind === 'meh') {
      v = { x: `${rnd(0, 30)}%`, y: `${rnd(15, 85)}%`, dx: `${rnd(120, 300)}px`, dy: `${rnd(-20, 20)}px`, d: `${rnd(0, 400)}ms` };
    } else if (kind === 'skip') {
      v = { x: `${rnd(8, 92)}%`, y: `${rnd(-8, 20)}%`, dx: `${rnd(-30, 30)}px`, dy: `${rnd(380, 720)}px`, d: `${rnd(0, 380)}ms` };
    } else {
      v = { x: `${rnd(4, 96)}%`, y: `${rnd(-10, 0)}%`, dx: `${rnd(-60, 60)}px`, dy: `${rnd(520, 900)}px`, d: `${rnd(0, 300)}ms` };
    }
    const style = {
      '--x': v.x, '--y': v.y, '--dx': v.dx, '--dy': v.dy, '--d': v.d,
      '--rot': `${rnd(-540, 540)}deg`, '--s': rnd(0.7, 1.5).toFixed(2), color,
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
    const t = setTimeout(onDone, LIFE[mode]);
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

  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div className={`quip quip-${kind} quip-${mode}`} style={{ '--life': `${LIFE[mode]}ms` } as CSSProperties}>
      <div className="quip-flash" aria-hidden="true" />
      {mode === 'full' && (kind === 'must' || kind === 'hi') && <div className="quip-ring" aria-hidden="true" />}
      {parts.length > 0 && (
        <div className="quip-parts" aria-hidden="true">
          {parts.map((p, i) => <span key={i} className="quip-p" style={p.style}>{p.glyph}</span>)}
        </div>
      )}
      <div className="quip-stage">
        {mode === 'full' && kind === 'skip' && <div className="quip-emoji drop" aria-hidden="true">💧</div>}
        {KICKER[kind] && <div className="quip-kicker" aria-hidden="true">{KICKER[kind]}</div>}
        <p className={`quip-text ${sizeOf(text)}`} role="status">
          {words.flatMap((w, i) => {
            const word = <span key={i} className="w" style={{ '--i': i } as CSSProperties}>{w}</span>;
            return i === 0 ? [word] : [' ', word];
          })}
        </p>
      </div>
    </div>
  );
}
