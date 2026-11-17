import { createElement } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from './store/local';
import { AppProvider, useApp } from './state';
import type { CrewStays } from './types';

class Server extends LocalStore {
  fail = true;
  sent = 0;
  override async saveCrewStays(n: Parameters<LocalStore['saveCrewStays']>[0], p: Partial<Omit<CrewStays, 'name'>>) {
    if (this.fail) throw new Error('offline');
    this.sent++;
    return super.saveCrewStays(n, p);
  }
}
let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return createElement('div', null, 'ready'); };
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });
afterEach(() => cleanup());

describe('AppProvider retries a failed save when the device is back online', () => {
  it('window online sends the save that failed, with no further write from the screen', async () => {
    const store = new Server();
    render(createElement(AppProvider, { store, children: createElement(Probe) }));
    await screen.findByText('ready');
    await act(async () => { await ctx.store.saveCrewStays('Alex', { quizDone: true }); });
    expect(ctx.error).toBe("Couldn't save");
    store.fail = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await settle();
    expect(store.sent).toBe(1);
    expect(ctx.error).toBeNull();
  });
});
