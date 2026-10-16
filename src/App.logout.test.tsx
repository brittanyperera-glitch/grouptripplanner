import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { openMenu } from './__fixtures__/menu';

beforeEach(() => { localStorage.clear(); window.location.hash = ''; });
afterEach(() => { cleanup(); window.location.hash = ''; });

const onLanding = async () => {
  expect(await screen.findByRole('button', { name: /Try it as a guest/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /on the trip/ })).toBeInTheDocument();
};

// Brittany 2026-10-16: everyone, trip member or guest, can log out back to the guest / trip password screen.
describe('Log out', () => {
  it('from the Menu takes a trip member to the landing screen and forgets the password and who they are', async () => {
    localStorage.setItem('tp:me', 'Alex');
    localStorage.setItem('tp-trip-key', 'secret');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'Menu' });
    openMenu();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await onLanding();
    expect(localStorage.getItem('tp:me')).toBeNull();
    expect(localStorage.getItem('tp-trip-key')).toBeNull();
  });

  it('is on the character picker too, before anyone is chosen', async () => {
    localStorage.setItem('tp-trip-key', 'secret');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    await onLanding();
    expect(localStorage.getItem('tp-trip-key')).toBeNull();
  });

  it('a guest gets the same Log out, which ends the demo on the landing screen', async () => {
    window.location.hash = '#/guest';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Aunty' }));
    await screen.findByRole('button', { name: 'Menu' });
    openMenu();
    expect(screen.queryByRole('button', { name: 'Finish and reset' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await onLanding();
  });
});
