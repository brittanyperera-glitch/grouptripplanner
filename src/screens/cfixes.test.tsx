import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { GroupResult } from '../types';
import Extras from './Extras';

const css = readFileSync('src/styles.css', 'utf8');
const group = (over: Partial<GroupResult>): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knockouts: [], knocked: [], finalized: [], locked: false, ...over,
});
const show = (g: GroupResult) => render(<AppProvider store={new LocalStore()}><Extras group={g} /><p>ready</p></AppProvider>);
const extra = { id: 'galle', who: [{ name: 'Alex' as const, tier: 'must' as const }] };

describe('R6 extras headline', () => {
  it('prints the real group days', async () => {
    show(group({ days: 9, extras: [extra] }));
    expect(await screen.findByText("With 14 days instead of 9 you'd also get")).toBeTruthy();
  });
  it('renders nothing at 14 days', async () => {
    show(group({ days: 14, extras: [extra] }));
    await screen.findByText('ready');
    expect(screen.queryByLabelText('Extras')).toBeNull();
  });
});

describe('R8 red text token (Postcard theme, light only)', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (fg: string, bg: string) => { const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
  // Postcard is one daylight palette (docs/theme-postcard.md); the old dark default and light override blocks are gone.
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const token = (name: string) => root.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
  it('page and card text (ink, muted, red, teal) reach 4.5:1 on the white card and the paper ground', () => {
    for (const set of ['ground', 'card']) {
      for (const name of ['ink', 'muted', 'red', 'teal']) {
        const fg = token(`${set}-${name}`);
        expect(fg, `${set}-${name}`).toBeDefined();
        expect(ratio(fg!, '#FFFFFF'), `${set}-${name}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(fg!, token('paper')!), `${set}-${name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(root).toMatch(/--coconut-text:\s*var\(--ground-red\)/);
  });
  it('white button text on the red and teal fills reaches 4.5:1', () => {
    expect(ratio('#FFFFFF', token('red-deep')!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#FFFFFF', token('teal-deep')!)).toBeGreaterThanOrEqual(4.5);
  });
  it('no dark or light override is left to drift from the one palette', () => {
    expect(css).not.toMatch(/data-theme|prefers-color-scheme/);
  });
  it('text uses of red use the text token, not the fill', () => {
    for (const sel of ['.pick .tag', '.day .d', '.grid td.must']) {
      const line = css.split('\n').find(l => l.includes(sel + ' {'))!;
      expect(line).toContain('color: var(--coconut-text)');
    }
  });
});
