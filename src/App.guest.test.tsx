import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type Person, type Response } from './types';
import App from './App';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
const copy = vi.hoisted(() => ({
  welcome: 'Welcome',
  guestWelcome: 'Pick your guest character',
  guestWelcomeSub: 'Try the whole thing. Nothing you do is saved.',
  quips: { name: { Aunty: 'welcome aunty!' } as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, { take?: string; review?: string; reviewUrl?: string }>,
}));
vi.mock('./data/catalogue.json', () => ({ default: cat }));
vi.mock('./content/copy.json', () => ({ default: copy }));

const mk = (id: string, name: string, area: string) => ({
  id, name, area, about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, photo: id, when: 'morning', credit: `Credit ${id}`,
});
const THREE = [mk('a', 'Alpha Rock', 'Cultural Triangle'), mk('b', 'Beta Falls', 'Cultural Triangle'), mk('c', 'Gamma Beach', 'South coast')];
const submitted = (name: Person): Response => ({ name, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: true, updatedAt: '2026-10-14T00:00:00Z' });

beforeEach(() => { localStorage.clear(); window.location.hash = ''; cat.items = THREE; });
afterEach(() => { cleanup(); window.location.hash = ''; });

async function pickGuest(user: ReturnType<typeof userEvent.setup>, who = 'Aunty') {
  window.location.hash = '#/guest';
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
  await user.click(await screen.findByRole('button', { name: who }));
}

describe('guest mode in the app shell', () => {
  it('(a) the picker at #/guest offers only the three guest characters', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/guest';
    render(<App />);
    expect(await screen.findByText('Pick your guest character')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose your character' }));
    for (const g of ['Tuktuk', 'Aunty', 'Groom']) expect(await screen.findByRole('button', { name: g })).toBeInTheDocument();
    for (const p of PEOPLE) expect(screen.queryByRole('button', { name: p })).toBeNull();
    expect(document.querySelectorAll('.carousel .char')).toHaveLength(3);
  });

  it('(b) picking Aunty shows her opening quip', async () => {
    await pickGuest(userEvent.setup());
    expect(await screen.findByText('welcome aunty!')).toBeInTheDocument();
  });

  it('(c) a guest lands on the Days step, not the tabs and not locked', async () => {
    await pickGuest(userEvent.setup());
    expect(await screen.findByRole('button', { name: /^9 days/ })).toBeInTheDocument();
    expect(screen.queryByText(/Ratings are locked/)).toBeNull();
    expect(screen.queryByRole('tab', { name: 'My trip' })).toBeNull();
  });

  it('(d) a guest who finishes the flow reaches the tabs and My trip shows a plan', async () => {
    const user = userEvent.setup();
    await pickGuest(user);
    await user.click(await screen.findByRole('button', { name: /^9 days/ }));
    await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: 'Must' }));
    await user.click(await screen.findByRole('button', { name: 'Done, submit' }));
    await user.click(await screen.findByRole('tab', { name: 'My trip' }));
    expect(await screen.findByText('Your best 9 days')).toBeInTheDocument();
    expect(screen.queryByText('Loading')).toBeNull();
  });

  it('(e) #/landing shows the Landing screen and the guest card opens the picker', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/landing';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'The Homecoming' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /Try it as a guest/ }));
    expect(await screen.findByText('Pick your guest character')).toBeInTheDocument();
  });

  it('(f) Log out (guest) returns to Landing and leaves localStorage as it was', async () => {
    const user = userEvent.setup();
    localStorage.setItem('tp:me', 'Alex');
    localStorage.setItem('tp-trip-key', 'secret');
    const before = JSON.stringify(Object.entries(localStorage).sort());
    await pickGuest(user);
    await user.click(await screen.findByRole('button', { name: 'Menu' }));
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'The Homecoming' })).toBeInTheDocument();
    expect(JSON.stringify(Object.entries(localStorage).sort())).toBe(before);
  });

  it('(h) a trip member with all five submitted still sees the locked state', async () => {
    const user = userEvent.setup();
    for (const p of PEOPLE) localStorage.setItem(`tp:resp:${p}`, JSON.stringify(submitted(p)));
    localStorage.setItem('tp:me', 'Alex');
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Picks' }));
    await waitFor(() => expect(screen.getByText(/Ratings are locked/)).toBeInTheDocument());
  });
});
