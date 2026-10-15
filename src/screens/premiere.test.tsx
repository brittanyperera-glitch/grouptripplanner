import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../data/catalogue.json';
import { AppProvider } from '../state';
import { emptyRanking, PEOPLE } from '../types';
import type { Item, Person, Plan, Response, Tier } from '../types';
import { IMAGE_AVATARS } from '../components/Avatar';
import Friends from './Friends';
import Poster, { routeLines } from './Poster';

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
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn(), fillText: vi.fn() })) as never;
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
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn(), fillText: vi.fn() })) as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['png'], { type: 'image/png' })); };
    Object.assign(navigator, { share: undefined, canShare: undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<Poster areas={plan.areas} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save poster' }));
    expect(click).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

describe('poster export fidelity', () => {
  const stubCanvas = () => {
    const fills: { text: string; font: string }[] = [];
    const ctx: Record<string, unknown> = {
      font: '', fillStyle: '', textAlign: '', letterSpacing: '',
      drawImage: () => {},
      fillText(text: string) { fills.push({ text, font: String(ctx.font) }); },
    };
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['png'], { type: 'image/png' })); };
    return { fills };
  };
  const readText = (b: Blob) => new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });

  it('draws the title in the app font after loading it, not the SVG fallback', async () => {
    const load = vi.fn(async () => []);
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true });
    vi.stubGlobal('Image', class { src = ''; decode = async () => {}; });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const { fills } = stubCanvas();
    const { posterBlob } = await import('./Poster');
    const { container } = render(<Poster areas={plan.areas} />);
    await posterBlob(container.querySelector('svg.poster-art') as SVGSVGElement);
    expect(load).toHaveBeenCalledWith(expect.stringContaining('Barlow Condensed'), expect.anything());
    const title = fills.find(f => f.text === 'SRI LANKA');
    expect(title?.font).toContain('Barlow Condensed');
    expect(title?.font).toContain('800');
    vi.unstubAllGlobals();
  });

  it('inlines an image avatar as a data URL so it survives export', async () => {
    (IMAGE_AVATARS as Set<Person>).add('Alex');
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => png })));
    vi.stubGlobal('Image', class { src = ''; decode = async () => {}; });
    Object.defineProperty(document, 'fonts', { value: { load: async () => [] }, configurable: true });
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    stubCanvas();
    const { posterBlob } = await import('./Poster');
    const { container } = render(<Poster areas={plan.areas} />);
    expect(container.querySelector('image[href="/img/players/alex.png"]')).not.toBeNull();
    await posterBlob(container.querySelector('svg.poster-art') as SVGSVGElement);
    const svg = await readText(blobs[0]);
    expect(svg).toContain('data:image/png;base64');
    expect(svg).not.toContain('/img/players/alex.png');
    (IMAGE_AVATARS as Set<Person>).delete('Alex');
    vi.unstubAllGlobals();
  });
});
