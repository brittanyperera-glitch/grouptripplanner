import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuestRoot from './GuestRoot';
import { useApp } from '../state';

// RED check: set GUEST_INVARIANT_RED=1 to swap the sandbox store for the real LocalStore.
vi.mock('./MemoryStore', async importOriginal => {
  const orig = await importOriginal<typeof import('./MemoryStore')>();
  if (!process.env.GUEST_INVARIANT_RED) return orig;
  return { MemoryStore: (await import('../store/local')).LocalStore };
});

const REAL = /^tp:resp:|^tp:stays:|^tp:sugg$|^tp:votes$|^tp:log$|^tp-trip-key$|^tp:me$/;

let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return null; };

let setItem: ReturnType<typeof vi.spyOn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  setItem = vi.spyOn(Storage.prototype, 'setItem');
  fetchSpy = vi.fn(() => Promise.reject(new Error('no network in a guest session')));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('guest sandbox invariant', () => {
  it('a rating and a vote never write the real group data or touch the network', async () => {
    render(createElement(GuestRoot, { onExit: vi.fn(), children: createElement(Probe) }));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => {
      ctx.setMe('Aunty');
      await ctx.store.saveResponse('Aunty', { days: 9, pace: 1, rated: ['sigiriya'], submitted: true });
      await ctx.store.vote({ forkId: 'f1', name: 'Aunty', choice: 'a' });
      await ctx.store.logChoice({ name: 'Aunty', kind: 'knockout', ref: 'f1', value: 'a' });
      await ctx.store.saveCrewStays('Aunty', { quizDone: true });
    });
    const real = setItem.mock.calls.map(c => String(c[0])).filter(k => REAL.test(k));
    expect(real).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await ctx.store.load()).responses.Aunty?.rated).toEqual(['sigiriya']);
    expect((await ctx.store.load()).stays?.crew.Aunty?.quizDone).toBe(true);
  });
});
