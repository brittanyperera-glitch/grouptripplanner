import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Added with D11 (24 Nov 2026, "Show the new four tabs"): the shell with the real release switch, so a guest gets the sample trip.
// src/App.guest.test.tsx keeps running a guest through the voting flow, as the vote-flow build does.
vi.unmock('./lib/release');
vi.mock('./components/sound', async orig => ({ ...(await orig<typeof import('./components/sound')>()), thud: vi.fn(), jingle: vi.fn() }));
import App from './App';

beforeEach(() => { localStorage.clear(); window.location.hash = '#/guest'; });
afterEach(() => { cleanup(); window.location.hash = ''; });

async function guestOnRoute(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
  await user.click(await screen.findByRole('button', { name: 'Aunty' }));
  await user.click(await screen.findByRole('button', { name: 'Close' }));
}

describe('a guest on the sample trip', () => {
  it('plays the route reveal once, then lands on Route with the four tabs and no header Menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Aunty' }));
    expect(await screen.findByText('Mission unlocked')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('tab', { name: 'Route' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').map(t => t.textContent?.replace(/\d+$/, ''))).toEqual(['Route', 'To do', 'Guide', 'Me']);
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(localStorage.getItem('tp:reveal-seen')).toContain('9:');
  });

  it('has Leave the demo on Me, in place of Log out, with no Organiser and no Group stats row', async () => {
    const user = userEvent.setup();
    await guestOnRoute(user);
    await user.click(await screen.findByRole('tab', { name: 'Me' }));
    expect(await screen.findByRole('button', { name: 'Leave the demo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Organiser/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Group stats/ })).toBeNull();
  });

  it('Leave the demo ends the session on the landing screen and clears the #/guest hash', async () => {
    const user = userEvent.setup();
    await guestOnRoute(user);
    await user.click(await screen.findByRole('tab', { name: 'Me' }));
    await user.click(await screen.findByRole('button', { name: 'Leave the demo' }));
    expect(await screen.findByRole('heading', { name: 'Group Trip Hero' })).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });
});
