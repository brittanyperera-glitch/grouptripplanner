import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Postcard wave 2 (docs/theme-postcard.md): the old orange / navy palette must not come back in the files this wave owns.
const OLD = ['FF7A1A', 'FF8A2A', 'FFC15E', 'FF4D6D', 'FFF4E6', 'FF9B85', 'FF8A3D', '12304A', '0A1A28', '1A2620', '2F4A3E', '0B1620', '7A2E4D', '0B0D10', 'F5F1EA'];
const FILES = [
  'components/Map.tsx', 'components/Map.css', 'components/Avatar.tsx',
  'screens/Poster.tsx', 'screens/Poster.css', 'screens/MyTrip.tsx', 'screens/Plan.tsx', 'screens/Everyone.tsx',
  'screens/Friends.tsx', 'screens/Knockouts.tsx', 'screens/Finalize.tsx', 'screens/Suggest.tsx', 'screens/Guide.tsx',
];
const url = (f: string) => join(process.cwd(), 'src', f);
const read = (f: string) => readFileSync(url(f), 'utf8');

describe('Postcard wave 2: no old palette', () => {
  for (const f of FILES.filter(f => existsSync(url(f)))) {
    it(`${f} has none of the old orange or navy hexes`, () => {
      const src = read(f).toUpperCase();
      expect(OLD.filter(h => src.includes(`#${h}`))).toEqual([]);
    });
  }
  it('styles.css no longer paints the Map on a dark navy ground', () => {
    expect(/\.map \{[^}]*#0A1A28/i.test(read('styles.css'))).toBe(false);
  });
});

describe('RouteMap route', () => {
  it('draws the Postcard thin red dashed line, not a glow', () => {
    const src = read('components/Map.tsx');
    expect(src).toMatch(/className="route-line"/);
    expect(src).not.toMatch(/glow|feGaussianBlur/);
    const css = read('components/Map.css');
    expect(css).toMatch(/\.route-line[^{]*\{[^}]*stroke:\s*var\(--red\)/);
    expect(css).toMatch(/\.route-line[^{]*\{[^}]*stroke-dasharray/);
  });
});
