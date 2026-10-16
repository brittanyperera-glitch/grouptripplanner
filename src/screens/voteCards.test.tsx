import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../lib/__fixtures__/catalogue-46.json';
import { LocalStore } from '../store/local';
import { AppProvider, useApp } from '../state';
import { emptyRanking } from '../types';
import type { GroupResult, Item, Knockout, Person, Response } from '../types';
import Extras from './Extras';
import Knockouts from './Knockouts';

// Brittany 2026-10-16: no per-person votes on the cards, tap a card for the full page, say why we must choose.
vi.mock('../data/catalogue.json', async () => ({ default: (await import('../lib/__fixtures__/catalogue-46.json')).default }));

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const item = (id: string) => ITEMS.find(i => i.id === id)!;

class SpyStore extends LocalStore {
  vote = vi.fn(async () => {});
}

const NORTH = ['jaffna', 'delft', 'trinco', 'nainativu'], SOUTH = ['sigiriya', 'yala', 'galle', 'horton'];
const KO: Knockout = { forkId: 'ko:galle', a: ['galle'], b: ['horton', 'sigiriya', 'yala'], votes: { a: [], b: ['Lazza'] } };
const group = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knocked: [], finalized: [], locked: false, knockouts: [KO], ...over,
});
const mustRow = (name: Person, must: string[]): Response => {
  const r = emptyRanking();
  r.must = must.map(id => [id]);
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: must, submitted: true, updatedAt: '' };
};

// A guest only exists inside the sandbox: pick one before the children mount.
function AsGuest({ children }: { children: ReactNode }) {
  const { me, setMe } = useApp();
  useEffect(() => { setMe('Aunty'); }, [setMe]);
  return me ? <>{children}</> : null;
}

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });

describe('head to head cards show no per-person votes', () => {
  it('prints no "Name Must" or "Name Keen" chip even when people rated the place', async () => {
    localStorage.setItem('tp:resp:Brittany', JSON.stringify(mustRow('Brittany', ['galle', 'horton'])));
    localStorage.setItem('tp:resp:Antek', JSON.stringify(mustRow('Antek', ['galle', 'horton'])));
    const { container } = render(<AppProvider store={new SpyStore()}><Knockouts group={group()} /></AppProvider>);
    await screen.findByRole('group', { name: /Knockout/ });
    expect(screen.queryByText(/\b(Must|Keen)$/)).toBeNull();
    expect(container.querySelector('.chip, .chips')).toBeNull();
    expect(screen.getByText('1 of 5 voted')).toBeInTheDocument();
  });
});

describe('the conflict line', () => {
  it('says the plan cannot hold both in the real day count and names what drops', async () => {
    render(<AppProvider store={new SpyStore()}><Knockouts group={group({ days: 12 })} /></AppProvider>);
    const line = await screen.findByTestId('ko-why');
    expect(line).toHaveTextContent("The plan can't hold both in 12 days.");
    expect(line).toHaveTextContent('Adding Galle Fort and sunset means dropping Horton Plains and World\'s End and 2 more.');
    expect(line.textContent).not.toMatch(/more day/);
    expect((line.textContent ?? '').trim().split(/\s+/).length).toBeLessThan(25);
  });
  it('lists both names when each side is a pair', async () => {
    const k: Knockout = { forkId: 'ko:x', a: ['galle', 'yala'], b: ['horton', 'sigiriya'], votes: { a: [], b: [] } };
    render(<AppProvider store={new SpyStore()}><Knockouts group={group({ knockouts: [k] })} /></AppProvider>);
    expect(await screen.findByTestId('ko-why')).toHaveTextContent(/Adding .+ and .+ means dropping .+ and .+\.$/);
  });
  it('the region fork says north and south do not both fit in the real day count', async () => {
    const k: Knockout = { forkId: 'region:north', a: NORTH, b: SOUTH, votes: { a: [], b: [] } };
    render(<AppProvider store={new SpyStore()}><Knockouts group={group({ knockouts: [k], days: 9 })} /></AppProvider>);
    expect(await screen.findByTestId('ko-why')).toHaveTextContent("Going north and keeping the south don't both fit in 9 days.");
  });
});

describe('tapping a card opens the full page', () => {
  it('lists every place of that option with what it is, and does not vote', async () => {
    const store = new SpyStore();
    const user = userEvent.setup();
    render(<AppProvider store={store}><Knockouts group={group()} /></AppProvider>);
    await user.click(await screen.findByRole('button', { name: /^Details.*Horton/ }));
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    for (const id of KO.b) {
      expect(within(sheet).getByText(item(id).name)).toBeInTheDocument();
      expect(within(sheet).getByText(item(id).about)).toBeInTheDocument();
    }
    expect(within(sheet).queryByText(item('galle').name)).toBeNull();
    expect(store.vote).not.toHaveBeenCalled();
  });
  it('"Vote for this" in the page casts one vote for that option', async () => {
    const store = new SpyStore();
    const user = userEvent.setup();
    render(<AppProvider store={store}><Knockouts group={group()} /></AppProvider>);
    await user.click(await screen.findByRole('button', { name: /^Details.*Galle/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Vote for this' }));
    expect(store.vote).toHaveBeenCalledTimes(1);
    expect(store.vote).toHaveBeenCalledWith({ forkId: 'ko:galle', name: 'Alex', choice: 'a' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('the Vote pill on the card is the only vote on the card', async () => {
    const store = new SpyStore();
    const user = userEvent.setup();
    render(<AppProvider store={store}><Knockouts group={group()} /></AppProvider>);
    await user.click(await screen.findByRole('button', { name: /^Vote for Horton/ }));
    expect(store.vote).toHaveBeenCalledTimes(1);
    expect(store.vote).toHaveBeenCalledWith({ forkId: 'ko:galle', name: 'Alex', choice: 'b' });
  });
  it('Escape closes the page and focus returns to the card', async () => {
    const user = userEvent.setup();
    render(<AppProvider store={new SpyStore()}><Knockouts group={group()} /></AppProvider>);
    const opener = await screen.findByRole('button', { name: /^Details.*Galle/ });
    await user.click(opener);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });
  it('the region card opens the same page for the whole list', async () => {
    const k: Knockout = { forkId: 'region:north', a: NORTH, b: SOUTH, votes: { a: [], b: [] } };
    const user = userEvent.setup();
    render(<AppProvider store={new SpyStore()}><Knockouts group={group({ knockouts: [k] })} /></AppProvider>);
    await user.click(await screen.findByRole('button', { name: /^Details.*North/ }));
    const sheet = await screen.findByRole('dialog');
    for (const id of NORTH) expect(within(sheet).getByText(item(id).name)).toBeInTheDocument();
  });
});

describe('my own vote shows for a guest too', () => {
  it('a guest sees the tick after voting', async () => {
    const user = userEvent.setup();
    const { container } = render(<AppProvider store={new LocalStore()} sandbox={{ onFinish: () => {} }}><AsGuest><Knockouts group={group()} /></AsGuest></AppProvider>);
    const pill = await screen.findByRole('button', { name: /^Vote for Horton/ });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('.mine')).toBeNull();
    await user.click(pill);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Vote for Horton/ })).toHaveAttribute('aria-pressed', 'true'));
    expect(container.querySelectorAll('.mine')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Vote for Galle/ })).toHaveAttribute('aria-pressed', 'false');
  });
  it('a trip member sees the same tick', async () => {
    const user = userEvent.setup();
    render(<AppProvider store={new LocalStore()}><Knockouts group={group()} /></AppProvider>);
    await user.click(await screen.findByRole('button', { name: /^Vote for Galle/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Vote for Galle/ })).toHaveAttribute('aria-pressed', 'true'));
  });
  it('a guest who already saved keep picks sees them as saved', async () => {
    localStorage.setItem('tp:votes', JSON.stringify([
      { forkId: 'genre:safari:yala', name: 'Aunty', choice: 'a' }, { forkId: 'genre:safari:udawalawe', name: 'Aunty', choice: 'b' },
    ]));
    const k: Knockout = {
      forkId: 'genre:safari', a: ['yala', 'udawalawe'], b: [], votes: { a: [], b: [] },
      genre: { id: 'safari', tally: { yala: { keep: [], drop: [] }, udawalawe: { keep: [], drop: [] } } },
    };
    render(<AppProvider store={new LocalStore()} sandbox={{ onFinish: () => {} }}><AsGuest><Knockouts group={group({ knockouts: [k] })} /></AsGuest></AppProvider>);
    const card = await screen.findByRole('group', { name: '2 safaris on the shortlist' });
    expect(within(card).getByText('Saved')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Keep Yala leopard safari' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card).getByRole('button', { name: 'Keep Udawalawe elephants and Transit Home' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('extras are photo rows without names', () => {
  const extras = [
    { id: 'galle', who: [{ name: 'Alex' as const, tier: 'must' as const }, { name: 'Antek' as const, tier: 'keen' as const }] },
    { id: 'yala', who: [{ name: 'Lazza' as const, tier: 'keen' as const }] },
  ];
  it('shows the place, its hours and how many want it, with no names or tiers', async () => {
    render(<AppProvider store={new SpyStore()}><Extras group={group({ extras })} /></AppProvider>);
    const section = await screen.findByLabelText('Extras');
    expect(within(section).queryByText(/\((Must|Keen)\)/)).toBeNull();
    expect(section.textContent).not.toMatch(/Alex|Antek|Lazza/);
    expect(within(section).getByText('2 of 5 want it')).toBeInTheDocument();
    expect(within(section).getByText('1 of 5 want it')).toBeInTheDocument();
    expect(within(section).getByText('3 h')).toBeInTheDocument();
    expect(within(section).getByText('4.5 h')).toBeInTheDocument();
  });
  it('tapping a row opens the page for that one place, with no vote button', async () => {
    const user = userEvent.setup();
    render(<AppProvider store={new SpyStore()}><Extras group={group({ extras })} /></AppProvider>);
    await user.click(await screen.findByRole('button', { name: /Yala leopard safari/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(item('yala').about)).toBeInTheDocument();
    expect(within(sheet).queryByText(item('galle').name)).toBeNull();
    expect(within(sheet).queryByRole('button', { name: /Vote/ })).toBeNull();
  });
});
