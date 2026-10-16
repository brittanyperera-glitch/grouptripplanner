import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStore } from './store/local';
import { ServerLike } from './store/__fixtures__/serverLike';
import { emptyRanking, type Person, type Response } from './types';
import App from './App';
import { openMenu } from './__fixtures__/menu';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
const copy = vi.hoisted(() => ({
  welcome: '',
  quips: { name: {} as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, unknown>,
}));
vi.mock('./data/catalogue.json', () => ({ default: cat }));
vi.mock('./content/copy.json', () => ({ default: copy }));

const mk = (id: string, name: string, area: string) => ({
  id, name, area, about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, photo: id, when: 'morning', credit: `Credit ${id}`,
});
const done = (name: Person): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: { ...emptyRanking(), must: [['a'], ['b'], ['c']] }, final: { ...emptyRanking(), must: [['a']] },
  rated: ['a', 'b', 'c'], submitted: true, updatedAt: '2026-10-14T00:00:00Z',
});

// Quiz marked done for the person under test, so this exercises what it did before the stayQuiz to-do existed.
const quizDone = (name: string) => localStorage.setItem(`tp:stays:${name}`, JSON.stringify({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z' }));
beforeEach(() => {
  localStorage.clear();
  cat.items = [mk('a', 'Alpha Rock', 'Cultural Triangle'), mk('b', 'Beta Falls', 'Cultural Triangle'), mk('c', 'Gamma Beach', 'South coast')];
});
afterEach(() => vi.useRealTimers());

describe('Start over', () => {
  it('needs a second tap, then resets only my row, keeps me signed in and lands on the days step', async () => {
    localStorage.setItem('tp:resp:Alex', JSON.stringify(done('Alex')));
    localStorage.setItem('tp:resp:Lazza', JSON.stringify(done('Lazza')));
    localStorage.setItem('tp:me', 'Alex');
    quizDone('Alex');
    localStorage.setItem('tp:sound-muted', '1');
    localStorage.setItem('tp:reveal-mine', '1');
    const lazza = localStorage.getItem('tp:resp:Lazza');
    const store = new LocalStore();
    render(<App store={store} />);
    expect(await screen.findByRole('tab', { name: 'My trip' })).toBeInTheDocument();

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByRole('button', { name: 'Tap again to start over' })).toBeInTheDocument();
    expect((await store.load()).responses.Alex?.submitted).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Tap again to start over' }));
    expect(await screen.findByRole('button', { name: /^9 days/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'My trip' })).toBeNull();

    const alex = (await store.load()).responses.Alex;
    expect(alex).toMatchObject({ days: null, flex: false, pace: null, ranking: emptyRanking(), final: null, rated: [], submitted: false });
    expect(localStorage.getItem('tp:resp:Lazza')).toBe(lazza);
    expect(localStorage.getItem('tp:me')).toBe('Alex');
    expect(localStorage.getItem('tp:sound-muted')).toBe('1');
    expect(localStorage.getItem('tp:reveal-mine')).toBeNull();
  });

  it('a first tap left alone for four seconds goes back to Start over', async () => {
    localStorage.setItem('tp:resp:Alex', JSON.stringify(done('Alex')));
    localStorage.setItem('tp:me', 'Alex');
    quizDone('Alex');
    render(<App store={new LocalStore()} />);
    await screen.findByRole('tab', { name: 'My trip' });
    vi.useFakeTimers();
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();
    vi.useRealTimers();
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByRole('tab', { name: 'My trip' })).toBeInTheDocument();
  });

  it('with a server that only updates on a realtime reload, lands on days, not Loading or the old tabs', async () => {
    const store = new ServerLike();
    store.rows = { Alex: done('Alex'), Lazza: done('Lazza') };
    // Quiz done on the server, so this still lands on My trip as before the stayQuiz to-do existed.
    store.stays = { crew: { Alex: { name: 'Alex', prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z' } }, suggestions: [], admin: { pins: [], scouts: {} } };
    localStorage.setItem('tp:me', 'Alex');
    render(<App store={store} />);
    await screen.findByRole('tab', { name: 'My trip' });
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to start over' }));
    expect(await screen.findByRole('button', { name: /^9 days/ })).toBeInTheDocument();
    expect(screen.queryByText('Loading')).toBeNull();
    await vi.waitFor(() => expect(store.rows.Alex?.submitted).toBe(false));
    expect(store.rows.Alex?.rated).toEqual([]);
    expect(store.rows.Lazza).toEqual(done('Lazza'));
  });

  it('is offered on the first step too, once a name is chosen', async () => {
    localStorage.setItem('tp:me', 'Alex');
    render(<App store={new LocalStore()} />);
    await screen.findByRole('button', { name: /^9 days/ });
    openMenu();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();
  });
});
