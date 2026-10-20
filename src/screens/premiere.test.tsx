import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../data/catalogue.json';
import { AppProvider } from '../state';
import { emptyRanking, PEOPLE } from '../types';
import type { Item, Person, Response, Tier } from '../types';
import Friends from './Friends';
import { TRAVEL_POSTER, TravelPoster } from './Poster';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;

const resp = (name: Person, tier: Tier, submitted = true): Response => {
  const r = emptyRanking();
  r[tier] = ITEMS.slice(0, 4).map(i => [i.id]);
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: [], submitted, updatedAt: '' };
};
const seed = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));

beforeEach(() => { localStorage.clear(); Object.defineProperty(document, 'fonts', { value: { load: async () => [] }, configurable: true }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Friends', () => {
  it('shows nothing until all five submitted', () => {
    PEOPLE.forEach(p => seed(resp(p, 'must', p !== 'Saulie')));
    localStorage.setItem('tp:me', 'Alex');
    render(<AppProvider><Friends /></AppProvider>);
    expect(screen.queryByLabelText('Friendship stats')).toBeNull();
  });
  it('shows twin, clash and divisive place once all five submitted', async () => {
    const tiers: Tier[] = ['must', 'must', 'skip', 'keen', 'must'];
    PEOPLE.forEach((p, i) => seed(resp(p, tiers[i])));
    localStorage.setItem('tp:me', 'Brittany');
    render(<AppProvider><Friends /></AppProvider>);
    const sec = await screen.findByLabelText('Friendship stats');
    expect(sec).toHaveTextContent('Travel twin');
    expect(sec).toHaveTextContent('Biggest clash');
    expect(sec).toHaveTextContent('Most divisive');
    expect(sec).toHaveTextContent('3 Must, 1 Skip');
  });
});

describe('poster', () => {
  const stubPoster = () => vi.stubGlobal('fetch', vi.fn(async () => new Response('jpg', { status: 200, headers: { 'content-type': 'image/jpeg' } })));
  it('shows the illustrated poster with its description', () => {
    render(<TravelPoster />);
    expect(screen.getByRole('img')).toHaveAttribute('src', TRAVEL_POSTER);
  });
  it('shares the poster file when the browser can', async () => {
    stubPoster();
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true });
    render(<TravelPoster />);
    await userEvent.click(screen.getByRole('button', { name: 'Save poster' }));
    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    expect(arg.files[0].type).toBe('image/jpeg');
    vi.unstubAllGlobals();
  });
  it('downloads when sharing files is unavailable', async () => {
    stubPoster();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    Object.assign(navigator, { share: undefined, canShare: undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<TravelPoster />);
    await userEvent.click(screen.getByRole('button', { name: 'Save poster' }));
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    vi.unstubAllGlobals();
  });
  it('says so when the poster file is missing and the host answers with the app page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    render(<TravelPoster />);
    await userEvent.click(screen.getByRole('button', { name: 'Save poster' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    vi.unstubAllGlobals();
  });
});
