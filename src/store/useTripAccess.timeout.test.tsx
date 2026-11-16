import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOAD_TIMEOUT_MS, useTripAccess } from './useTripAccess';
import * as tripKey from './tripKey';

const verify = vi.spyOn(tripKey, 'verifyTripKey');

beforeEach(() => { localStorage.clear(); verify.mockReset(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('a trip key check that never answers', () => {
  it('holds the loading screen until 4 s, then lets the app through without clearing the key', async () => {
    localStorage.setItem(tripKey.TRIP_KEY, 'pw');
    verify.mockReturnValue(new Promise(() => undefined));
    const h = renderHook(() => useTripAccess(true));
    expect(h.result.current.status).toBe('checking');
    await act(async () => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 1); });
    expect(h.result.current.status).toBe('checking');
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(h.result.current.status).toBe('open');
    expect(localStorage.getItem(tripKey.TRIP_KEY)).toBe('pw');
  });

  it('an answer inside 4 s needs no timer', async () => {
    localStorage.setItem(tripKey.TRIP_KEY, 'pw');
    verify.mockResolvedValue(false);
    const h = renderHook(() => useTripAccess(true));
    await act(async () => { await Promise.resolve(); });
    expect(h.result.current.status).toBe('gate');
  });
});
