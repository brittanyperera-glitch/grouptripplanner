import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from './state';
import { clearLocalProgress } from './store/fresh';

const RIGHT = 'made-up-right';
const fake = vi.hoisted(() => ({ clientArgs: [] as unknown[][], rpcFails: false }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    fake.clientArgs.push(args);
    const headers = ((args[2] as { global?: { headers?: Record<string, string> } } | undefined)?.global?.headers) ?? {};
    const empty = { data: [], error: null };
    const table = () => ({ select: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve(empty).then(r), order: () => Promise.resolve(empty) }) });
    const ch = { on: () => ch, subscribe: () => ch, send: async () => 'ok' };
    return {
      rpc: async () => (fake.rpcFails ? { data: null, error: new Error('down') } : { data: headers['x-trip-key'] === RIGHT, error: null }),
      from: table,
      channel: () => ch,
      removeChannel: async () => undefined,
    };
  },
}));

const Probe = () => { useApp(); return <div>app is up</div>; };
const mount = () => render(<AppProvider><Probe /></AppProvider>);

beforeEach(() => {
  localStorage.clear();
  fake.clientArgs = []; fake.rpcFails = false;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('trip password gate', () => {
  it('shows only for the Supabase store, never for the local one', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    mount();
    expect(await screen.findByText('app is up')).toBeInTheDocument();
    expect(screen.queryByLabelText('Trip password')).toBeNull();
  });

  it('shows with Supabase and nothing stored, before the app', async () => {
    mount();
    expect(await screen.findByLabelText('Trip password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Let me in' })).toBeInTheDocument();
    expect(screen.queryByText('app is up')).toBeNull();
  });

  it('a wrong password stays out, shows the message and keeps the input', async () => {
    mount();
    const input = await screen.findByLabelText('Trip password');
    await userEvent.type(input, 'made-up-wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Let me in' }));
    expect(await screen.findByText("That's not it")).toBeInTheDocument();
    expect(screen.getByLabelText('Trip password')).toHaveValue('made-up-wrong');
    expect(screen.queryByText('app is up')).toBeNull();
    expect(localStorage.getItem('tp-trip-key')).toBeNull();
  });

  it('the right password is stored under tp-trip-key and the app renders', async () => {
    mount();
    await userEvent.type(await screen.findByLabelText('Trip password'), RIGHT);
    await userEvent.click(screen.getByRole('button', { name: 'Let me in' }));
    expect(await screen.findByText('app is up')).toBeInTheDocument();
    expect(localStorage.getItem('tp-trip-key')).toBe(RIGHT);
  });

  it('builds the app store client with the x-trip-key header', async () => {
    localStorage.setItem('tp-trip-key', RIGHT);
    mount();
    await screen.findByText('app is up');
    const withHeader = fake.clientArgs.filter(a => (a[2] as { global: { headers: Record<string, string> } } | undefined)?.global?.headers['x-trip-key'] === RIGHT);
    expect(withHeader.length).toBeGreaterThanOrEqual(2);
  });

  it('a stored password that no longer works returns to the gate and is cleared', async () => {
    localStorage.setItem('tp-trip-key', 'made-up-stale');
    mount();
    expect(await screen.findByLabelText('Trip password')).toBeInTheDocument();
    expect(localStorage.getItem('tp-trip-key')).toBeNull();
    expect(screen.queryByText('app is up')).toBeNull();
  });

  it('a stored good password goes straight in without showing the gate', async () => {
    localStorage.setItem('tp-trip-key', RIGHT);
    mount();
    expect(await screen.findByText('app is up')).toBeInTheDocument();
    expect(screen.queryByLabelText('Trip password')).toBeNull();
  });

  it('an unreachable server keeps the stored password and lets the app show its own retry', async () => {
    fake.rpcFails = true;
    localStorage.setItem('tp-trip-key', RIGHT);
    mount();
    await waitFor(() => expect(screen.queryByLabelText('Trip password')).toBeNull());
    expect(localStorage.getItem('tp-trip-key')).toBe(RIGHT);
  });

  it('keeps the password through ?fresh and Start over, which only clear tp: keys', () => {
    localStorage.setItem('tp-trip-key', RIGHT);
    localStorage.setItem('tp:me', 'Brittany');
    clearLocalProgress();
    expect(localStorage.getItem('tp-trip-key')).toBe(RIGHT);
    expect(localStorage.getItem('tp:me')).toBeNull();
  });
});
