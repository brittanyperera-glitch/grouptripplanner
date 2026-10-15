import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, type Person, type Response } from './types';
import { readFileSync } from 'node:fs';
import App from './App';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
const copy = vi.hoisted(() => ({
  welcome: '',
  quips: { name: {} as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, unknown>,
  howto: undefined as unknown,
}));
vi.mock('./data/catalogue.json', () => ({ default: cat }));
vi.mock('./content/copy.json', () => ({ default: copy }));

const mk = (id: string, name: string) => ({
  id, name, area: 'Cultural Triangle', about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, photo: id, when: 'morning', credit: `Credit ${id}`,
  google: { rating: '4.7', reviews: '24,355', url: `https://maps.example/${id}` },
});
const row = (name: Person, over: Partial<Response> = {}): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z', ...over,
});
const seed = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/?howto=1');
  cat.items = [mk('a', 'Alpha Rock'), mk('b', 'Beta Falls')];
  copy.quips = { name: {}, days: {}, pace: {}, tier: {} };
  copy.items = {};
  copy.howto = (JSON.parse(readFileSync('src/content/copy.json', 'utf8')) as { howto: unknown }).howto;
});

async function toPace(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
  await user.click(await screen.findByRole('button', { name: 'Alex' }));
}
const pickDaysAndPace = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: /^9 days/ }));
  await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
};

describe('how-to step', () => {
  it('shows after pace for a first-time player', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toPace(user);
    await pickDaysAndPace(user);
    expect(await screen.findByRole('button', { name: 'Skip the tutorial' })).toBeTruthy();
    expect(screen.queryByText(/^1 of 2$/)).toBeNull();
  });

  it('Skip the tutorial goes to the first rate card and remembers it was seen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toPace(user);
    await pickDaysAndPace(user);
    await user.click(await screen.findByRole('button', { name: 'Skip the tutorial' }));
    expect(await screen.findByText(/^1 of 2$/)).toBeTruthy();
    expect(localStorage.getItem('tp:howto-seen')).not.toBeNull();
  });

  it('does not show when changing days or pace from the rating screen', async () => {
    seed(row('Alex'));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Change days or pace' }));
    await user.click(await screen.findByRole('button', { name: /^9 days/ }));
    await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
    expect(await screen.findByText(/^1 of 2$/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip the tutorial' })).toBeNull();
  });

  it('does not show once submitted', async () => {
    seed(row('Alex', { submitted: true, rated: ['a', 'b'], ranking: { ...emptyRanking(), must: [['a'], ['b']] } }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Change days or pace' }));
    await user.click(await screen.findByRole('button', { name: /^9 days/ }));
    await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
    await screen.findByRole('tablist');
    expect(screen.queryByRole('button', { name: 'Skip the tutorial' })).toBeNull();
  });

  it('does not show again once seen', async () => {
    localStorage.setItem('tp:howto-seen', '1');
    const user = userEvent.setup();
    render(<App />);
    await toPace(user);
    await pickDaysAndPace(user);
    expect(await screen.findByText(/^1 of 2$/)).toBeTruthy();
  });

  it('writes nothing to the store during practice', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toPace(user);
    await pickDaysAndPace(user);
    await screen.findByRole('button', { name: 'Skip the tutorial' });
    const snap = () => JSON.stringify(Object.keys(localStorage).filter(k => k !== 'tp:howto-seen').sort().map(k => [k, localStorage.getItem(k)]));
    await waitFor(() => expect(localStorage.getItem('tp:resp:Alex')).not.toBeNull());
    const before = snap();
    await user.keyboard('{ArrowLeft}{ArrowDown}{ArrowUp}{ArrowRight}');
    await screen.findByRole('button', { name: "Let's go" });
    expect(snap()).toBe(before);
    expect(JSON.parse(localStorage.getItem('tp:resp:Alex') ?? '{}').rated).toEqual([]);
  });
});
