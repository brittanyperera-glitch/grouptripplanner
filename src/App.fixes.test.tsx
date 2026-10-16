import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStore } from './store/local';
import { emptyRanking, PEOPLE, type Person, type Response } from './types';
import App from './App';
import { openMenu } from './__fixtures__/menu';
import { WALKTHROUGH_KEY, todayKey } from './lib/walkthrough';
// These tests exercise the tabs, not the once-a-day welcome-back walkthrough (it has its own tests), so it counts as seen today.
const seenWalkToday = () => localStorage.setItem(WALKTHROUGH_KEY, todayKey(new Date()));

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('./data/catalogue.json', () => ({ default: cat }));

const mk = (id: string, name: string, area: string) => ({
  id, name, area, about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, when: 'morning',
});
const THREE = [mk('a', 'Alpha Rock', 'Cultural Triangle'), mk('b', 'Beta Falls', 'Cultural Triangle'), mk('c', 'Gamma Beach', 'South coast')];

const row = (name: Person, over: Partial<Response> = {}): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z', ...over,
});
const seed = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
const saved = (n: Person) => JSON.parse(localStorage.getItem(`tp:resp:${n}`) ?? '{}') as Response;
const DONE = { rated: ['a', 'b', 'c'], submitted: true };

beforeEach(() => {
  localStorage.clear(); seenWalkToday();
  cat.items = THREE;
});

describe('R2 serial full-row saves', () => {
  it('failed save, then a newer save, then retry leaves the newest row stored', async () => {
    let calls = 0;
    class Flaky extends LocalStore {
      override async saveResponse(...a: Parameters<LocalStore['saveResponse']>) {
        calls++;
        if (calls === 1) throw new Error('offline');
        return super.saveResponse(...a);
      }
    }
    const user = userEvent.setup();
    render(<App store={new Flaky()} />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Alex' }));
    await user.click(await screen.findByRole('button', { name: /^9 days/ }));
    await screen.findByRole('button', { name: /Couldn't save\. Tap to retry/ });
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('button', { name: /^14 days/ }));
    await waitFor(() => expect(saved('Alex').days).toBe(14));
    const banner = screen.queryByRole('button', { name: /Couldn't save/ });
    if (banner) await user.click(banner);
    await new Promise(r => setTimeout(r, 50));
    expect(saved('Alex').days).toBe(14);
  });
});

describe('R3 change days or pace', () => {
  it('on the rating screen it returns to Days and keeps ratings', async () => {
    seed(row('Alex', { rated: ['a'], ranking: { ...emptyRanking(), must: [['a']] } }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('2 of 3');
    openMenu();
    await user.click(screen.getByRole('button', { name: 'Change days or pace' }));
    await user.click(await screen.findByRole('button', { name: /^14 days/ }));
    await user.click(await screen.findByRole('button', { name: /^Slow/ }));
    await screen.findByText('2 of 3');
    await waitFor(() => expect(saved('Alex').days).toBe(14));
    expect(saved('Alex').pace).toBe(2);
    expect(saved('Alex').rated).toEqual(['a']);
    expect(saved('Alex').ranking.must).toEqual([['a']]);
  });

  it('from the tabs via the Menu, while not locked', async () => {
    seed(row('Alex', { ...DONE, ranking: { ...emptyRanking(), must: [['a'], ['b'], ['c']] } }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tablist');
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'Change days or pace' }));
    expect(await screen.findByText('How many days can you do?')).toBeInTheDocument();
  });

  it('is gone once the group is locked', async () => {
    for (const p of PEOPLE) seed(row(p, DONE));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Picks' }));
    await screen.findByText(/ratings are locked/i);
    expect(screen.queryByRole('button', { name: 'Change days or pace' })).toBeNull();
    openMenu();
    expect(screen.queryByRole('button', { name: 'Change days or pace' })).toBeNull();
  });
});

describe('R4 lock while editing picks', () => {
  it('closes the picks screen and keeps the ratings when the group locks', async () => {
    const ranking = { ...emptyRanking(), must: [['a'], ['b']], keen: [['c']] };
    for (const p of PEOPLE) if (p !== 'Saulie') seed(row(p, { ...DONE, ranking }));
    seed(row('Saulie', { ...DONE, submitted: false, ranking }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Picks' }));
    expect(await screen.findByRole('button', { name: /^Gamma Beach,/ })).toBeInTheDocument();
    const before = localStorage.getItem('tp:resp:Alex');

    seed(row('Saulie', { ...DONE, ranking }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tp:resp:Saulie' })); });

    expect(await screen.findByText(/ratings are locked/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Gamma Beach,/ })).toBeNull();
    expect(localStorage.getItem('tp:resp:Alex')).toBe(before);
  });
});
