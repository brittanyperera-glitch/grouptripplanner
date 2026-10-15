import { afterEach, describe, expect, it, vi } from 'vitest';
import { buzz } from './motion';

const setMotion = (reduce: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};
const setVibrate = (fn: unknown) => Object.defineProperty(window.navigator, 'vibrate', { value: fn, configurable: true });

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (window.navigator as { vibrate?: unknown }).vibrate;
});

describe('buzz', () => {
  it('is a short tick on Keen, Meh and Skip and a pattern on Must', () => {
    setMotion(false);
    const v = vi.fn();
    setVibrate(v);
    buzz('keen'); buzz('meh'); buzz('skip');
    expect(v.mock.calls).toEqual([[15], [15], [15]]);
    buzz('must');
    expect(v).toHaveBeenLastCalledWith([30, 40, 60]);
  });

  it('does nothing when the browser has no vibrate (iOS Safari)', () => {
    setMotion(false);
    expect(() => buzz('must')).not.toThrow();
  });

  it('does nothing when motion is off or reduced', () => {
    const v = vi.fn();
    setVibrate(v);
    setMotion(true);
    buzz('must');
    delete (window as { matchMedia?: unknown }).matchMedia;
    buzz('must');
    expect(v).not.toHaveBeenCalled();
  });
});
