import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Avatar from './components/Avatar';
import Profile from './screens/Profile';
import { AppProvider, useApp } from './state';
import type { AppState, Store } from './types';

const empty: AppState = { responses: {}, suggestions: [], votes: [] };
const stubStore = (): Store => ({
  load: async () => empty, saveResponse: vi.fn(async () => undefined), addSuggestion: async () => undefined,
  setSuggestionStatus: async () => undefined, vote: async () => undefined, subscribe: () => () => undefined,
  logChoice: async () => undefined, loadLog: async () => [],
});

let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return <div>me:{String(ctx.me)}</div>; };
const mount = (sandbox?: { onFinish(): void }, store = stubStore()) => {
  render(<AppProvider store={store} sandbox={sandbox}><Probe /></AppProvider>);
  return store;
};
const actions = async (store: Store) => {
  await act(async () => { ctx.setMe('Alex'); });
  await act(async () => { ctx.clearMe(); });
  await act(async () => { await ctx.store.saveResponse('Guest', { days: 5 }); });
  await act(async () => { await ctx.store.saveResponse('Alex', { days: 6 }); });
  void store;
};

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('sandbox mode', () => {
  it('starts as Guest even when a person is remembered', async () => {
    mount({ onFinish: () => undefined });
    expect(await screen.findByText('me:Guest')).toBeInTheDocument();
  });

  it('exposes sandbox and finishSandbox', async () => {
    const onFinish = vi.fn();
    mount({ onFinish });
    await screen.findByText('me:Guest');
    expect(ctx.sandbox).toBe(true);
    ctx.finishSandbox?.();
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('never touches localStorage', async () => {
    const store = mount({ onFinish: () => undefined });
    await screen.findByText('me:Guest');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const rem = vi.spyOn(Storage.prototype, 'removeItem');
    await actions(store);
    expect(set).not.toHaveBeenCalled();
    expect(rem).not.toHaveBeenCalled();
    expect(localStorage.getItem('tp:me')).toBe('Alex');
    expect(localStorage.length).toBe(1);
  });

  it('control: the same actions without sandbox do write', async () => {
    const store = mount();
    await screen.findByText('me:Alex');
    expect(ctx.sandbox).toBe(false);
    const set = vi.spyOn(Storage.prototype, 'setItem');
    await actions(store);
    expect(set).toHaveBeenCalledWith('tp:me', 'Alex');
    expect(set.mock.calls.some(c => String(c[0]).startsWith('tp:unsaved:'))).toBe(true);
  });

  it('Avatar and Profile render for Guest', () => {
    expect(() => render(<Avatar name="Guest" size={40} />)).not.toThrow();
    expect(() => render(<Avatar name="Guest" size={40} crop="full" />)).not.toThrow();
    expect(() => render(<Profile name="Guest" players={{}} onBack={() => undefined} />)).not.toThrow();
  });
});
