import '@testing-library/jest-dom/vitest';
import { StrictMode, createElement, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuestRoot from './GuestRoot';
import { GUEST_IDLE_MS, GUEST_WARN_MS } from './timing';
import { useApp } from '../state';

const gate = vi.hoisted(() => ({ passthrough: false }));
// The real AppProvider holds children back until its async load; passthrough exposes GuestRoot's own ready gate.
vi.mock('../state', async importOriginal => {
  const orig = await importOriginal<typeof import('../state')>();
  return { ...orig, AppProvider: (p: { children: ReactNode }) => (gate.passthrough ? p.children : createElement(orig.AppProvider, p as never)) };
});

let ctx: ReturnType<typeof useApp>;
const seen: Array<string | null> = [];
const Probe = () => {
  ctx = useApp();
  seen.push(localStorage.getItem('tp:me') ?? localStorage.getItem('tp:howto-seen'));
  return <div>probe</div>;
};

beforeEach(() => { gate.passthrough = false; vi.useFakeTimers(); localStorage.clear(); seen.length = 0; });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const mount = async (onExit = vi.fn(), strict = false) => {
  const ui = <GuestRoot onExit={onExit}><Probe /></GuestRoot>;
  const r = render(strict ? <StrictMode>{ui}</StrictMode> : ui);
  await act(async () => { await Promise.resolve(); });
  return { onExit, ...r };
};

describe('GuestRoot', async () => {
  it('clears tp: keys before children render and restores them on unmount (StrictMode)', async () => {
    localStorage.setItem('tp:me', 'Alex');
    localStorage.setItem('tp:howto-seen', '1');
    const { unmount } = await mount(vi.fn(), true);
    expect(screen.getByText('probe')).toBeInTheDocument();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(v => v === null)).toBe(true);
    unmount();
    expect(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))).toEqual({ 'tp:me': 'Alex', 'tp:howto-seen': '1' });
  });

  it('children never render before the stale keys are cleared (synchronous provider)', async () => {
    gate.passthrough = true;
    localStorage.setItem('tp:me', 'Alex');
    const Plain = () => { seen.push(localStorage.getItem('tp:me')); return <div>plain</div>; };
    render(<GuestRoot onExit={vi.fn()}><Plain /></GuestRoot>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('plain')).toBeInTheDocument();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(v => v === null)).toBe(true);
  });

  it('exposes a sandbox with nobody picked', async () => {
    await mount();
    expect(ctx.sandbox).toBe(true);
    expect(ctx.me).toBeNull();
  });

  it('warns after the idle time and exits once after the warning time', async () => {
    const { onExit } = await mount();
    act(() => { vi.advanceTimersByTime(GUEST_IDLE_MS); });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Still there?')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(GUEST_WARN_MS); });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('"I\'m still here" cancels the warning and restarts the cycle', async () => {
    const { onExit } = await mount();
    act(() => { vi.advanceTimersByTime(GUEST_IDLE_MS); });
    fireEvent.click(screen.getByText("I'm still here"));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => { vi.advanceTimersByTime(GUEST_WARN_MS); });
    expect(onExit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(GUEST_IDLE_MS); });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('input resets the idle timer before the warning', async () => {
    await mount();
    act(() => { vi.advanceTimersByTime(GUEST_IDLE_MS - 1000); });
    fireEvent.pointerDown(window);
    act(() => { vi.advanceTimersByTime(GUEST_IDLE_MS - 1000); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('finishSandbox calls onExit once, however often it is called', async () => {
    const { onExit } = await mount();
    act(() => { ctx.finishSandbox?.(); });
    act(() => { ctx.finishSandbox?.(); });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('"Finish now" calls onExit once', async () => {
    const { onExit } = await mount();
    act(() => { vi.advanceTimersByTime(GUEST_IDLE_MS); });
    fireEvent.click(screen.getByText('Finish now'));
    act(() => { vi.advanceTimersByTime(GUEST_WARN_MS); });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('a guest session writes no app keys to localStorage', async () => {
    await mount();
    const set = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => { await ctx.store.saveResponse('Aunty', { days: 5 }); });
    const bad = set.mock.calls.map(c => String(c[0])).filter(k => /^(tp:resp:|tp:sugg|tp:votes|tp:log|tp-trip-key)/.test(k));
    expect(bad).toEqual([]);
  });
});
