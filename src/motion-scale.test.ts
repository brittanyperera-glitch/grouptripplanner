import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOTION } from './components/motion';

// One motion scale for the whole app (Brittany 2026-10-15: "check all the transition times make sure nothings jarring").
// The audit behind it: docs/review/motion-audit.md.
const files = ['src/styles.css', ...['src/screens', 'src/components'].flatMap(d => readdirSync(d).filter(f => f.endsWith('.css')).map(f => join(d, f)))];
const css = Object.fromEntries(files.map(f => [f, readFileSync(f, 'utf8')]));
const root = css['src/styles.css'].slice(css['src/styles.css'].indexOf(':root {'), css['src/styles.css'].indexOf('}', css['src/styles.css'].indexOf(':root {')));
const ms = (name: string) => Number(root.match(new RegExp(`--${name}:\\s*(\\d+)ms`))?.[1]);

// Loops that idle or drive a character, and the opening Brittany kept as it is. Each is slow or mechanical, never a UI change.
const AMBIENT = [
  '.bob', '.char .bob', '.tuktuk svg',
  '.bar.over', '.rv-ring', '.rv-crew img', '.tuk[data-driving="true"]', '.tuk[data-idle="true"]',
];

/** Every animation or transition declaration: [file, selector, property, value]. */
function declarations() {
  const out: [string, string, string, string][] = [];
  for (const [file, text] of Object.entries(css)) {
    const flat = text.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().split('\n').pop()!.trim();
      if (sel.startsWith('@keyframes') || /^(from|to|\d)/.test(sel)) continue;
      for (const d of m[2].matchAll(/(animation(?:-duration)?|transition(?:-duration)?)\s*:\s*([^;]+)/g)) out.push([file, sel, d[1], d[2].trim()]);
    }
  }
  return out;
}
/** Splits "a 1s, b 2s" at top-level commas, then returns each part's first time token (its duration). */
function durations(value: string) {
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map(p => p.trim().match(/var\(--[\w-]+(?:,[^)]*)?\)|calc\([^)]*\)|(?<![\w-])\d*\.?\d+m?s\b/)?.[0] ?? '').filter(Boolean);
}
const ambient = (sel: string) => sel.split(',').map(s => s.trim()).every(s => AMBIENT.some(a => s.endsWith(a) || s.includes(`${a} `)));

describe('one motion scale', () => {
  it('defines fast, base and slow steps that read as calm, and the TypeScript mirror matches the CSS', () => {
    expect(ms('dur-fast')).toBeGreaterThanOrEqual(150);
    expect(ms('dur-fast')).toBeLessThanOrEqual(200);
    expect(ms('dur')).toBeGreaterThanOrEqual(250);
    expect(ms('dur')).toBeLessThanOrEqual(320);
    expect(ms('dur-slow')).toBeGreaterThanOrEqual(420);
    expect(ms('dur-slow')).toBeLessThanOrEqual(520);
    expect(root).toMatch(/--ease:\s*cubic-bezier\(/);
    expect(root).toMatch(/--ease-in-out:\s*cubic-bezier\(/);
    expect(MOTION).toEqual({ fast: ms('dur-fast'), base: ms('dur'), slow: ms('dur-slow') });
  });

  it('every UI animation and transition takes its duration from the scale', () => {
    const off = declarations().filter(([, sel]) => !ambient(sel)).flatMap(([file, sel, prop, value]) =>
      durations(value).filter(d => !/^var\(--(dur-fast|dur|dur-slow|in|out|hold)\)$/.test(d) && !/^calc\(var\(--(in|hold)\)/.test(d)).map(d => `${file} ${sel} ${prop}: ${d}`));
    expect(off).toEqual([]);
  });

  it('no overshoot springs, slams, shakes or strobes anywhere', () => {
    const springs = Object.entries(css).flatMap(([f, t]) => [...t.matchAll(/cubic-bezier\(([^)]*)\)/g)]
      .filter(m => { const [, y1, , y2] = m[1].split(',').map(Number); return y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1; }).map(m => `${f}: ${m[0]}`));
    expect(springs).toEqual([]);
    const names = Object.values(css).flatMap(t => [...t.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
    expect(names.filter(n => /slam|shake|strobe|flash|wobble-ui/.test(n))).toEqual([]);
  });

  it('nothing visible moves faster than 150 ms', () => {
    const fast = declarations().flatMap(([file, sel, , value]) => durations(value)
      .filter(d => /^\d*\.?\d+m?s$/.test(d)).map(d => [d, d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000] as const)
      .filter(([, v]) => v > 0 && v < 150).map(([d]) => `${file} ${sel}: ${d}`));
    expect(fast).toEqual([]);
  });

  it('the swipe card clears its flying copy on the slow step, not a literal of its own', () => {
    const rate = readFileSync('src/screens/Rate.tsx', 'utf8');
    expect(rate).toMatch(/setTimeout\(\(\) => setGhost\(null\), MOTION\.slow\)/);
    // The four-direction demo must outlast the card's own move, or each step is cut off mid-swing.
    expect(Number(rate.match(/DEMO_STEP = (\d+)/)?.[1])).toBeGreaterThan(MOTION.slow);
  });
});
