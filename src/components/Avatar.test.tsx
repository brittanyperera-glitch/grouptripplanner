import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PEOPLE } from '../types';
import type { Person } from '../types';
import Avatar from './Avatar';

const draw = (name: Person) => render(<Avatar name={name} crop="full" size={200} />).container.querySelector('svg') as SVGSVGElement;
const has = (svg: SVGSVGElement, part: string) => svg.querySelector(`[data-part="${part}"]`) !== null;
// Rendered height: the vertical scale applied to the body group.
const scaleY = (svg: SVGSVGElement) => Number(svg.querySelector('g[transform]')!.getAttribute('transform')!.match(/scale\([\d.]+ ([\d.]+)\)/)![1]);

describe('full-body avatars', () => {
  it('draws five different characters', () => {
    const shapes = PEOPLE.map(p => draw(p).innerHTML.replace(/av-\w+-full/g, ''));
    expect(new Set(shapes).size).toBe(5);
  });

  it('gives glasses to Antek and Saulie only, and loafers to Antek only', () => {
    const svgs = Object.fromEntries(PEOPLE.map(p => [p, draw(p)])) as Record<Person, SVGSVGElement>;
    expect(PEOPLE.filter(p => has(svgs[p], 'glasses'))).toEqual(['Antek', 'Saulie']);
    expect(PEOPLE.filter(p => has(svgs[p], 'loafers'))).toEqual(['Antek']);
    for (const p of PEOPLE.filter(x => x !== 'Antek')) expect(svgs[p].querySelector('[data-part^="shoes-"]')).not.toBeNull();
    expect(has(svgs.Brittany, 'shoes-chunky')).toBe(true);
    expect(has(svgs.Lazza, 'shoes-flat')).toBe(true);
  });

  it('gives long hair to Brittany and Lazza only', () => {
    expect(PEOPLE.filter(p => has(draw(p), 'long-hair'))).toEqual(['Brittany', 'Lazza']);
  });

  it('carries each signature detail', () => {
    const b = draw('Brittany');
    expect(has(b, 'earrings') && has(b, 'bangle') && has(b, 'legs-wide')).toBe(true);
    const an = draw('Antek');
    expect(has(an, 'watch') && has(an, 'ring') && has(an, 'legs-wide')).toBe(true);
    expect(has(draw('Alex'), 'legs-camo')).toBe(true);
    expect(has(draw('Lazza'), 'legs-flared')).toBe(true);
    expect(has(draw('Saulie'), 'legs-straight')).toBe(true);
  });

  it('orders heights: Alex tallest, Brittany shortest, Lazza below the men', () => {
    const h = Object.fromEntries(PEOPLE.map(p => [p, scaleY(draw(p))])) as Record<Person, number>;
    const tallest = [...PEOPLE].sort((x, y) => h[y] - h[x]);
    expect(tallest[0]).toBe('Alex');
    expect(tallest[tallest.length - 1]).toBe('Brittany');
    expect(h.Lazza).toBeLessThan(Math.min(h.Antek, h.Saulie));
    expect(h.Antek).toBeLessThan(h.Alex);
  });
});
