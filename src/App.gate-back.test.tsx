import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// No row is visible and no password verifies, so the real trip stops at the password screen.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q = () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r), order: () => Promise.resolve({ data: [], error: null }) });
    return {
      rpc: async () => ({ data: false, error: null }),
      from: () => ({ select: q }),
      channel: () => { const ch = { on: () => ch, subscribe: () => ch, send: async () => 'ok' }; return ch; },
      removeChannel: async () => undefined,
    };
  },
}));

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  // A known person with no trip password opens straight on the trip, so the password screen is the first thing shown.
  localStorage.setItem('tp:me', 'Alex');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

// Audit finding 16, end to end through App: Back on the password screen reaches the landing screen.
describe('password screen Back', () => {
  it('takes a visitor from the trip password back to the landing screen', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByLabelText('Trip password')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Group Trip Hero' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Trip password')).toBeNull();
  });
});
