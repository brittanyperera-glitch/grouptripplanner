import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Raw from './Raw';

const RIGHT = 'made-up-right';

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    const headers = ((args[2] as { global?: { headers?: Record<string, string> } } | undefined)?.global?.headers) ?? {};
    const empty = { data: [], error: null };
    return {
      rpc: async () => ({ data: headers['x-trip-key'] === RIGHT, error: null }),
      from: () => ({ select: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve(empty).then(r), order: () => Promise.resolve(empty) }) }),
      channel: () => { const ch = { on: () => ch, subscribe: () => ch, send: async () => 'ok' }; return ch; },
      removeChannel: async () => undefined,
    };
  },
}));

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#/raw-tp-raw-local';
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.location.hash = ''; });

describe('Raw page behind the trip password', () => {
  it('asks for the password first, then shows the tables', async () => {
    render(<Raw />);
    await userEvent.type(await screen.findByLabelText('Trip password'), RIGHT);
    await userEvent.click(screen.getByRole('button', { name: 'Let me in' }));
    expect(await screen.findByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(5);
  });

  it('goes straight to the tables with a stored password', async () => {
    localStorage.setItem('tp-trip-key', RIGHT);
    render(<Raw />);
    expect(await screen.findByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Trip password')).toBeNull();
  });
});
