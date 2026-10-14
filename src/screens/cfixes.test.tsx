import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { GroupResult } from '../types';
import Extras from './Extras';

const css = readFileSync('src/styles.css', 'utf8');
const group = (over: Partial<GroupResult>): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knockouts: [], ...over,
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

describe('R8 light-mode orange text token', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (fg: string, bg: string) => { const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
  const light = css.slice(css.indexOf(':root {'), css.indexOf('@media'));
  it('--coconut-text reaches 4.5:1 on white', () => {
    const m = light.match(/--coconut-text:\s*(#[0-9A-Fa-f]{6})/);
    expect(m).not.toBeNull();
    expect(ratio(m![1], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
  it('text uses of orange use the token, not the fill', () => {
    for (const sel of ['.pick .tag', '.day .d', '.grid td.must']) {
      const line = css.split('\n').find(l => l.includes(sel + ' {'))!;
      expect(line).toContain('color: var(--coconut-text)');
    }
  });
});
