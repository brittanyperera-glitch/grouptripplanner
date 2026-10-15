// @vitest-environment-options {"url": "https://trip.example.com/"}
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionMissing } from './store';
import App from './App';

afterEach(() => { vi.unstubAllEnvs(); localStorage.clear(); });

const MSG = 'Not connected to the shared database. Ask Brittany to add the Supabase keys.';

describe('R1 production without Supabase keys', () => {
  it('shows a blocking screen instead of silently using local storage', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    render(<App />);
    expect(await screen.findByText(MSG)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alex' })).toBeNull();
  });

  it('blocks when only one of the two keys is set', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    render(<App />);
    expect(await screen.findByText(MSG)).toBeInTheDocument();
  });

  it('dev and tests keep the local store', async () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Choose your character' })).toBeInTheDocument();
    expect(screen.queryByText(MSG)).toBeNull();
  });

  it('a production bundle served from localhost (vite preview) may use the local store', () => {
    expect(connectionMissing({ prod: true, url: '', key: '', host: 'localhost' })).toBe(false);
    expect(connectionMissing({ prod: true, url: '', key: '', host: '127.0.0.1' })).toBe(false);
    expect(connectionMissing({ prod: true, url: '', key: '', host: 'trip.example.com' })).toBe(true);
  });
});

describe('R9 bad Supabase URL', () => {
  it('shows the load error bar, not a blank page', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SUPABASE_URL', 'not a url');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'k');
    // A friend past the trip password gate, so the unreachable server is what they meet.
    localStorage.setItem('tp-trip-key', 'made-up');
    render(<App />);
    expect(await screen.findByRole('button', { name: /Couldn't load\. Tap to retry/ })).toBeInTheDocument();
  });
});
