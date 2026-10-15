import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// All CSS is global here. On 2026-10-15 a new Profile.css defined `.tc`, which Rerank already used for its row text,
// and every Your picks row grew to 288px. A class that leads a rule in one file and appears in another file's
// selectors is a collision unless that exact pair is listed below as deliberate.
// Existing on 2026-10-15: a screen's stylesheet deliberately extending a shared style. Add to this only on purpose.
const S = 'styles.css', SC = (n: string) => `screens/${n}.css`;
const KNOWN = new Set<string>([
  ...['body', 'cta', 'friend-card', 'sub'].map(c => `${c}: ${SC('Premiere')} / ${S}`),
  ...['card', 'ghost', 'info', 'nopic', 'pace', 'scrim', 'tile', 'title', 'tuktuk'].map(c => `${c}: ${SC('Rate')} / ${S}`),
  ...['ghost', 'item', 'nophoto', 'nopic'].map(c => `${c}: ${SC('Rerank')} / ${S}`),
  ...['flash', 'flash-kicker', 'flash-name', 'flash-selfie'].map(c => `${c}: ${SC('Lockin')} / ${S}`),
  ...['day-area', 'strip'].map(c => `${c}: ${SC('MyTrip')} / ${S}`),
  ...['rv-day-card', 'rv-itin-place', 'rv-picks'].map(c => `${c}: ${SC('Reveal')} / ${S}`),
  `stamp: ${SC('HowTo')} / ${SC('Rate')}`, `t: ${SC('HowTo')} / ${S}`, `tline: components/TransportLine.css / ${SC('Reveal')}`,
]);

function cssFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

describe('global CSS', () => {
  it('no top-level class is defined in two stylesheets', () => {
    // A class that leads a rule in one file must not appear in any selector of another file.
    const leads = new Map<string, Set<string>>(), uses = new Map<string, Set<string>>();
    const add = (m: Map<string, Set<string>>, c: string, f: string) => { if (!m.has(c)) m.set(c, new Set()); m.get(c)!.add(f); };
    for (const f of cssFiles('src')) {
      const name = path.relative('src', f);
      const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/^\s*\.([a-zA-Z][\w-]*)/gm)) add(leads, m[1], name);
      for (const sel of css.matchAll(/([^{}]+)\{/g)) for (const m of sel[1].matchAll(/\.([a-zA-Z][\w-]*)/g)) add(uses, m[1], name);
    }
    const clashes = [...leads].flatMap(([c, files]) =>
      [...files].flatMap(f => [...(uses.get(c) ?? [])].filter(o => o !== f).map(o => `${c}: ${[f, o].sort().join(' / ')}`)));
    expect([...new Set(clashes)].filter(c => !KNOWN.has(c)).sort()).toEqual([]);
  });
});
