import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../data/catalogue.json';
import { AppProvider } from '../state';
import { emptyRanking, PEOPLE } from '../types';
import type { Item, Person, Plan, Response, Tier } from '../types';
import Friends from './Friends';
import Poster, { routeLines } from './Poster';
import { Trailer, trailerFrames } from './Trailer';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;

const resp = (name: Person, tier: Tier, submitted = true): Response => {
  const r = emptyRanking();
  r[tier] = ITEMS.slice(0, 4).map(i => [i.id]);
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: [], submitted, updatedAt: '' };
};
const seed = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));

const plan: Plan = {
  route: ['AIR', 'Colombo', 'AIR'], areas: ['Colombo', 'Cultural Triangle', 'Ella'], chosen: [], dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [1, 2, 3].map(n => ({ n, area: 'Colombo' as const, spare: 0, rainSlack: false, entries: [{ kind: 'activity' as const, label: 'x', hours: 1, itemId: ITEMS[n].id }] })),
};

beforeEach(() => localStorage.clear());
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

describe('trailer', () => {
  it('has a frame per day with its photo and place names', () => {
    const f = trailerFrames(plan, ITEMS);
    expect(f.map(x => x.n)).toEqual([1, 2, 3]);
    expect(f[0].names).toContain(ITEMS[1].name);
  });
  it('goes straight to the poster when motion is off', async () => {
    render(<AppProvider><Trailer plan={plan} items={ITEMS} onClose={() => {}} /></AppProvider>);
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-stage', 'poster');
    expect(screen.getByRole('button', { name: 'Save poster' })).toBeInTheDocument();
  });
  it('plays title then days, and a tap skips to the poster', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
    render(<AppProvider><Trailer plan={plan} items={ITEMS} onClose={() => {}} /></AppProvider>);
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveAttribute('data-stage', 'title');
    await userEvent.click(dlg);
    expect(dlg).toHaveAttribute('data-stage', 'poster');
  });
  it('advances on its own and ends on the poster within 15 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
    render(<AppProvider><Trailer plan={plan} items={ITEMS} onClose={() => {}} /></AppProvider>);
    await screen.findByRole('dialog');
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-stage', 'day');
    for (let t = 0; t < 13000; t += 500) act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-stage', 'poster');
  });
});

describe('poster', () => {
  it('shows the title, dates, route with arrows and the credits line', () => {
    render(<Poster areas={plan.areas} />);
    const svg = screen.getByRole('img', { name: 'Sri Lanka poster' });
    expect(svg).toHaveTextContent('SRI LANKA');
    expect(svg).toHaveTextContent('DEC 2026');
    expect(svg.textContent).toContain('Colombo →');
    expect(svg.textContent).toContain('Cultural Triangle →');
    expect(svg).toHaveTextContent('starring BRITTANY ALEX ANTEK LAZZA SAULIE');
    expect(svg.querySelectorAll('svg.avatar-art.full')).toHaveLength(5);
  });
  it('wraps long routes at arrows', () => {
    const lines = routeLines(['Colombo', 'Cultural Triangle', 'Kandy and Knuckles', 'Hill country', 'Ella', 'South coast']);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every(l => l.length <= 30)).toBe(true);
    expect(lines.slice(0, -1).every(l => l.endsWith('→'))).toBe(true);
  });
  it('shares the PNG file when the browser can', async () => {
    vi.stubGlobal('Image', class { src = ''; decode = async () => {}; });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['png'], { type: 'image/png' })); };
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true });
    render(<Poster areas={plan.areas} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save poster' }));
    expect(share).toHaveBeenCalledOnce();
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    expect(arg.files[0].type).toBe('image/png');
    vi.unstubAllGlobals();
  });
  it('downloads when sharing files is unavailable', async () => {
    vi.stubGlobal('Image', class { src = ''; decode = async () => {}; });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['png'], { type: 'image/png' })); };
    Object.assign(navigator, { share: undefined, canShare: undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<Poster areas={plan.areas} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save poster' }));
    expect(click).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
