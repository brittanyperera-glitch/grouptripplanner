import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from './state';

// The database's current password; rows are visible only to a request carrying it (row-level security hides them silently).
const db = vi.hoisted(() => ({ password: 'old', rpc: 0 }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    const headers = ((args[2] as { global?: { headers?: Record<string, string> } } | undefined)?.global?.headers) ?? {};
    const rows = () => ({ data: headers['x-trip-key'] === db.password ? [{ name: 'x', days: [], pace: null, ranking: null, rated: [], submitted: false, updated_at: null }] : [], error: null });
    const q = () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve(rows()).then(r), order: () => Promise.resolve(rows()) });
    return {
      rpc: async () => { db.rpc++; return { data: headers['x-trip-key'] === db.password, error: null }; },
      from: () => ({ select: q }),
      channel: () => { const ch = { on: () => ch, subscribe: () => ch, send: async () => 'ok' }; return ch; },
      removeChannel: async () => undefined,
    };
  },
}));

beforeEach(() => {
  localStorage.clear();
  db.password = 'old'; db.rpc = 0;
  localStorage.setItem('tp-trip-key', 'old');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('trip password changed while the app is open', () => {
  it('returns to the password gate instead of showing an empty group', async () => {
    render(<AppProvider><p>group is showing</p></AppProvider>);
    expect(await screen.findByText('group is showing')).toBeInTheDocument();
    db.password = 'new';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await new Promise(r => setTimeout(r, 500)); });
    expect(await screen.findByLabelText('Trip password')).toBeInTheDocument();
    expect(localStorage.getItem('tp-trip-key')).toBeNull();
  });

  it('keeps loading with the correct key and does not re-verify on every reload', async () => {
    render(<AppProvider><p>group is showing</p></AppProvider>);
    await screen.findByText('group is showing');
    const before = db.rpc;
    for (let i = 0; i < 3; i++) await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await new Promise(r => setTimeout(r, 300)); });
    expect(screen.getByText('group is showing')).toBeInTheDocument();
    expect(db.rpc).toBe(before);
  });
});
