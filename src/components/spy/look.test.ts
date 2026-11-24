import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
const OWNED = ['components/spy/spy.css', 'screens/MissionHQ.css', 'screens/Stays.css', 'screens/TripAdmin.css', 'screens/Flights.css', 'screens/Organiser.css', 'screens/Profile.css'];
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function rulesFor(css: string, selector: string): string[] {
  return [...strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m => m[1].split(',').some(s => s.trim() === selector))
    .map(m => m[2]);
}

const WARN_TOKEN = '--red-deep';
function token(name: string): string {
  const m = read('styles.css').match(new RegExp(`${name}:\\s*#([0-9a-fA-F]{3,6})\\b`));
  if (!m) throw new Error(`no hex for ${name}`);
  return '#' + (m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]);
}
function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('spy screens wear the cream look', () => {
  it('no px font-size below 11.5 in the seven owned files', () => {
    for (const f of OWNED) {
      for (const m of strip(read(f)).matchAll(/font-size:\s*([\d.]+)px/g)) expect(parseFloat(m[1]), `${f} ${m[0]}`).toBeGreaterThanOrEqual(11.5);
    }
  });

  it('five controls declare a 44px tap height (min-height, or an ::after overlay anchored to the button)', () => {
    const targets: [string, string][] = [
      ['components/spy/spy.css', '.spy .spy-back'], ['components/spy/spy.css', '.spy .spy-btn'],
      ['styles.css', '.guide-chips button'],
    ];
    for (const [f, sel] of targets) expect(rulesFor(read(f), sel).join(' '), `${f} ${sel}`).toMatch(/min-height:\s*44px/);
    // These two keep their visible size (the profile character view is sized to the header and the switch); only the tap area grows.
    for (const [f, sel] of [['styles.css', '.top button.who'], ['screens/Profile.css', '.pf-switch button']]) {
      expect(rulesFor(read(f), sel).join(' '), `${f} ${sel}`).toMatch(/position:\s*relative/);
      expect(rulesFor(read(f), `${sel}::after`).join(' '), `${f} ${sel}::after`).toMatch(/height:\s*44px/);
    }
  });

  it('the cream text tokens, and the warn token --s-warn points at, reach 4.5:1 on white and on paper', () => {
    expect(read('components/spy/spy.css')).toMatch(new RegExp(`--s-warn:\\s*var\\(${WARN_TOKEN}\\)`));
    for (const t of ['--card-ink', '--card-muted', '--card-red', '--card-teal', WARN_TOKEN]) {
      for (const bg of ['--white', '--paper']) expect(ratio(token(t), token(bg)), `${t} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
