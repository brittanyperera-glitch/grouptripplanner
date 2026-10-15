import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Copy } from '../state';
import { AppProvider } from '../state';
import Rate from '../screens/Rate';
import Waiting from '../screens/Waiting';
import TukTuk from './TukTuk';

const WEBDRIVER = navigator.webdriver;
const fullMotion = () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
};
afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(navigator, 'webdriver', { value: WEBDRIVER, configurable: true }); });

const src = join(process.cwd(), 'src');
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
});

describe('TukTuk', () => {
  it('wobbles only while driving with motion on', () => {
    fullMotion();
    const { container, rerender } = render(<TukTuk driving />);
    expect(container.querySelector('[data-tuktuk]')).toHaveAttribute('data-driving', 'true');
    rerender(<TukTuk />);
    expect(container.querySelector('[data-tuktuk]')).toHaveAttribute('data-driving', 'false');
  });
  it('never wobbles with motion off', () => {
    const { container } = render(<TukTuk driving idle />);
    const t = container.querySelector('[data-tuktuk]');
    expect(t).toHaveAttribute('data-driving', 'false');
    expect(t).toHaveAttribute('data-idle', 'false');
  });
  it('has the TUK roof sign', () => {
    const { container } = render(<TukTuk />);
    expect(container.querySelector('[data-tuktuk]')?.textContent).toContain('TUK');
  });

  it('is the one tuk-tuk: Rate, Waiting and Reveal import it and nothing else defines one', () => {
    const defs = files(src).filter(f => /function TukTuk\b|const TukTuk\b/.test(readFileSync(f, 'utf8')));
    expect(defs.map(f => f.slice(src.length + 1))).toEqual(['components/TukTuk.tsx']);
    for (const f of ['screens/Rate.tsx', 'screens/Waiting.tsx', 'screens/Reveal.tsx']) {
      expect(readFileSync(join(src, f), 'utf8')).toMatch(/import TukTuk from '\.\.\/components\/TukTuk'/);
    }
  });
  it('drives the rating progress road', () => {
    const copy = { welcome: '', quips: { name: {}, days: {}, pace: {}, tier: {} }, items: {} } as Copy;
    render(<Rate item={{ id: 'a', name: 'Alpha', area: 'Colombo', about: '', hours: 1, slot: 'any', fee: '', sideTrip: 0 }} n={2} total={4} copy={copy} onTier={() => {}} />);
    expect(screen.getByRole('progressbar', { name: 'Places rated' }).querySelector('[data-tuktuk]')).not.toBeNull();
  });
  it('idles on the waiting screen', async () => {
    render(<AppProvider><Waiting /></AppProvider>);
    expect((await screen.findByRole('region', { name: 'Waiting for the group' })).querySelector('[data-tuktuk]')).not.toBeNull();
  });
});
