import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECHECK_MIN_MS, useTripAccess } from './useTripAccess';
import * as tripKey from './tripKey';

const verify = vi.spyOn(tripKey, 'verifyTripKey');

beforeEach(() => { localStorage.clear(); verify.mockReset(); vi.useRealTimers(); });
afterEach(cleanup);

const open = async () => {
  localStorage.setItem(tripKey.TRIP_KEY, 'old');
  verify.mockResolvedValueOnce(true);
  const h = renderHook(() => useTripAccess(true));
  await waitFor(() => expect(h.result.current.status).toBe('open'));
  verify.mockClear();
  return h;
};

describe('recheck after the password changes mid-session', () => {
  it('a key the database now rejects returns to the gate and is cleared', async () => {
    const h = await open();
    verify.mockResolvedValueOnce(false);
    act(() => h.result.current.recheck());
    await waitFor(() => expect(h.result.current.status).toBe('gate'));
    expect(localStorage.getItem(tripKey.TRIP_KEY)).toBeNull();
  });

  it('an unreachable server does not log anyone out', async () => {
    const h = await open();
    verify.mockRejectedValueOnce(new Error('offline'));
    act(() => h.result.current.recheck());
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(h.result.current.status).toBe('open');
    expect(localStorage.getItem(tripKey.TRIP_KEY)).toBe('old');
  });

  it('a key that still verifies keeps the app open', async () => {
    const h = await open();
    verify.mockResolvedValueOnce(true);
    act(() => h.result.current.recheck());
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(h.result.current.status).toBe('open');
  });

  it('asks the database at most once per window', async () => {
    const h = await open();
    verify.mockResolvedValue(true);
    act(() => { h.result.current.recheck(); h.result.current.recheck(); h.result.current.recheck(); });
    expect(verify).toHaveBeenCalledTimes(1);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + RECHECK_MIN_MS + 1);
    act(() => h.result.current.recheck());
    expect(verify).toHaveBeenCalledTimes(2);
  });
});
