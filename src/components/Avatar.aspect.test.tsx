import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Avatar, { IMAGE_ASPECT, IMAGE_AVATARS, IMAGE_CM } from './Avatar';
import type { Player } from '../types';

// Width and height from the PNG header (IHDR), so the table cannot drift from the real art.
const pngSize = (name: string) => {
  const b = readFileSync(`public/img/players/${name.toLowerCase()}.png`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

describe('character art is never cropped', () => {
  it('IMAGE_ASPECT matches every committed PNG', () => {
    for (const name of IMAGE_AVATARS) {
      const { w, h } = pngSize(name);
      expect(IMAGE_ASPECT[name as Player], name).toBeCloseTo(w / h, 2);
    }
  });

  it.each(['full', 'stage'] as const)('the %s frame is at least as wide as the drawn art, for every character', crop => {
    for (const name of IMAGE_AVATARS) {
      const { container } = render(<Avatar name={name} crop={crop} size={200} />);
      const [, , bw] = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
      const artW = 211 * (IMAGE_CM[name] / 200) * IMAGE_ASPECT[name];
      expect(bw, `${name} ${crop}`).toBeGreaterThanOrEqual(artW);
      const img = container.querySelector('image')!;
      expect(Number(img.getAttribute('width')), name).toBeGreaterThanOrEqual(artW);
    }
  });
});
