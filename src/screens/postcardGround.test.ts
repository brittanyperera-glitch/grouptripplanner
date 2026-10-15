import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Wave 2 (docs/theme-postcard.md): the route reveal and the character lock-in sit on the Postcard paper ground, not the old night colours.
const NIGHT = /#141a16|#1d2620|rgba\(\s*22\s*,\s*31\s*,\s*28|radial-gradient\(120% 80%|#25372b/i;
const strip = (file: string) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (file: string, selector: string) => {
  const css = strip(file);
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`${selector} not found in ${file}`);
  return css.slice(i, css.indexOf('}', i));
};

describe('Postcard ground', () => {
  it('the reveal root is on the paper token with ink text, no night colours', () => {
    const r = rule('src/screens/Reveal.css', '.rv');
    expect(r).toMatch(/background:\s*var\(--paper\)/);
    expect(r).toMatch(/color:\s*var\(--ink\)/);
    expect(r).not.toMatch(NIGHT);
  });
  it('the reveal stylesheet has no night colours, monospace HUD or per-stage palette swap left', () => {
    const css = strip('src/screens/Reveal.css');
    expect(css.replace(/\.rv-day\.banner[^{]*\{[^}]*\}/g, '')).not.toMatch(NIGHT);
    expect(css).not.toMatch(/Space Mono|ui-monospace/);
    expect(css).not.toMatch(/data-stage="complete"\]\s*\{[^}]*--ink/);
  });
  it('the lock-in overlay is on the paper token, not the dark scrim', () => {
    const r = rule('src/screens/Lockin.css', '.flash.lockin');
    expect(r).toMatch(/background:[^;]*var\(--paper\)/);
    expect(r).not.toMatch(NIGHT);
  });
});
