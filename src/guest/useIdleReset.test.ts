import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleReset } from './useIdleReset';

const IDLE = 180_000, WARN = 15_000;
const setup = () => {
  const onIdle = vi.fn();
  const r = renderHook(() => useIdleReset({ idleMs: IDLE, warnMs: WARN, onIdle }));
  return { onIdle, ...r };
};
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useIdleReset', () => {
  it('warns after idleMs, calls onIdle once after warnMs more', () => {
    const { result, onIdle } = setup();
    tick(IDLE - 1);
    expect(result.current.warning).toBe(false);
    tick(1);
    expect(result.current.warning).toBe(true);
    expect(onIdle).not.toHaveBeenCalled();
    tick(WARN);
    expect(onIdle).toHaveBeenCalledTimes(1);
    tick(IDLE * 2);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('input before the warning restarts the idle timer', () => {
    const { result } = setup();
    tick(100_000);
    act(() => { window.dispatchEvent(new Event('pointerdown')); });
    tick(80_000);
    expect(result.current.warning).toBe(false);
    tick(IDLE - 80_000 - 1);
    expect(result.current.warning).toBe(false);
    tick(1);
    expect(result.current.warning).toBe(true);
  });

  it('input during the warning does not clear it; keepGoing does and restarts the cycle', () => {
    const { result, onIdle } = setup();
    tick(IDLE);
    expect(result.current.warning).toBe(true);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(result.current.warning).toBe(true);
    act(() => { result.current.keepGoing(); });
    expect(result.current.warning).toBe(false);
    tick(WARN + 1000);
    expect(onIdle).not.toHaveBeenCalled();
    tick(IDLE);
    expect(result.current.warning).toBe(true);
  });

  it('cleans up listeners and timers on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { onIdle, unmount } = setup();
    expect(add).toHaveBeenCalled();
    unmount();
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
    tick(IDLE + WARN + 1000);
    expect(onIdle).not.toHaveBeenCalled();
    add.mockRestore(); remove.mockRestore();
  });
});
