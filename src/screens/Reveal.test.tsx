import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../data/catalogue.json';
import type { Compromise } from '../lib/compromises';
import { AppProvider } from '../state';
import { PEOPLE } from '../types';
import type { Item, Plan } from '../types';
import { HOLD_MS, Reveal, dayTag, revealStops } from './Reveal';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const nm = (id: string) => ITEMS.find(i => i.id === id)!.name;
const act1 = (id: string) => ({ kind: 'activity' as const, label: id, hours: 2, itemId: id });

const rplan: Plan = {
  route: ['AIR', 'Colombo', 'Kandy', 'Ella', 'AIR'], areas: ['Colombo', 'Kandy and Knuckles', 'Ella'], chosen: ['galleface', 'tooth', 'knuckles', 'ninearch'],
  dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [
    { n: 1, area: 'Colombo', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'a', hours: 1, from: 'AIR', to: 'Colombo' }, act1('galleface')] },
    { n: 2, area: 'Kandy and Knuckles', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'b', hours: 3, from: 'Colombo', to: 'Kandy' }, act1('tooth')] },
    { n: 3, area: 'Kandy and Knuckles', spare: 0, rainSlack: false, entries: [act1('knuckles')] },
    { n: 4, area: 'Ella', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'c', hours: 4, from: 'Kandy', to: 'Ella' }, act1('ninearch')] },
    { n: 5, area: null, spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'd', hours: 5, from: 'Ella', to: 'AIR' }] },
  ],
};
const cards: Compromise[] = [
  { kind: 'region', text: 'North out: South won 3 to 2', stop: 'Ella' },
  { kind: 'skipped', text: 'Kandy lake stays though Alex skipped it', stop: 'Kandy' },
  { kind: 'missed', text: 'Yala missed out: not enough days', stop: 'Ella' },
];

const WEBDRIVER = navigator.webdriver;
const fullMotion = () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
};
const stage = () => screen.getByRole('dialog').getAttribute('data-stage');
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
// AppProvider loads its store asynchronously; flush that without moving the reveal's clock.
const mount = async (ui: ReactElement) => { render(ui); await act(async () => { await Promise.resolve(); }); await act(async () => { await Promise.resolve(); }); };
const cardPlace = () => screen.queryByRole('region', { name: 'Day card' })?.querySelector('h2')?.textContent ?? null;

beforeEach(() => { localStorage.clear(); Object.defineProperty(document, 'fonts', { value: { load: async () => [] }, configurable: true }); });
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks();
  Object.defineProperty(navigator, 'webdriver', { value: WEBDRIVER, configurable: true });
});

describe('revealStops', () => {
  it('gives one stop per hub in route order, with its day numbers, planned items and compromise lines', () => {
    expect(revealStops(rplan, ITEMS, cards)).toEqual([
      { hub: 'Colombo', name: 'Colombo', days: [1], items: [nm('galleface')], notes: [] },
      { hub: 'Kandy', name: 'Kandy', days: [2, 3], items: [nm('tooth'), nm('knuckles')], notes: ['Kandy lake stays though Alex skipped it'] },
      { hub: 'Ella', name: 'Ella', days: [4], items: [nm('ninearch')], notes: ['North out: South won 3 to 2', 'Yala missed out: not enough days'] },
    ]);
  });
  it('puts a morning activity before the drive on the stop you left, and the train on the stop it takes you to', () => {
    const p: Plan = {
      ...rplan,
      days: [
        rplan.days[0], rplan.days[1],
        { n: 3, area: 'Ella', spare: 0, rainSlack: false, entries: [act1('knuckles'), { kind: 'train', label: 'Nanu Oya to Ella train', hours: 4, itemId: 'train', from: 'Kandy', to: 'Ella' }, act1('ninearch')] },
        { n: 4, area: null, spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'd', hours: 5, from: 'Ella', to: 'AIR' }] },
      ],
    };
    const s = revealStops(p, ITEMS, []);
    expect(s.map(x => [x.hub, x.days, x.items])).toEqual([
      ['Colombo', [1], [nm('galleface')]],
      ['Kandy', [2, 3], [nm('tooth'), nm('knuckles')]],
      ['Ella', [3], [nm('train'), nm('ninearch')]],
    ]);
  });
  it('keeps the compromise priority order and the 5 line cap from compromises()', () => {
    const many: Compromise[] = Array.from({ length: 7 }, (_, i) => ({ kind: 'missed' as const, text: `line ${i}`, stop: 'Ella' as const }));
    expect(revealStops(rplan, ITEMS, many)[2].notes).toEqual(['line 0', 'line 1', 'line 2', 'line 3', 'line 4']);
  });
  it('tags the days the way the HUD prints them', () => {
    expect(dayTag([1])).toBe('DAY 01');
    expect(dayTag([2, 3, 4])).toBe('DAYS 02 TO 04');
    expect(dayTag([2, 5])).toBe('DAYS 02 AND 05');
    expect(dayTag([])).toBe('PASSING THROUGH');
  });
});

describe('route reveal, motion on', () => {
  it('opens on the paper with the stamp HUD, then drives stop to stop: bubble, buzz and a day card at each, auto advancing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fullMotion();
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    await mount(<AppProvider><Reveal plan={rplan} cards={cards} onClose={() => {}} /></AppProvider>);
    expect(stage()).toBe('intro');
    expect(screen.getByText('LK.exe // Trip generator')).toBeInTheDocument();
    expect(screen.getByText('Mission unlocked')).toBeInTheDocument();
    expect(screen.getByText('THE PLAN IS IN.')).toBeInTheDocument();
    expect(cardPlace()).toBeNull();

    const seen: { place: string; tag: string; at: number; bubble: string }[] = [];
    let t = 0, left = -1;
    while (stage() !== 'complete' && t < 60000) {
      tick(100); t += 100;
      const place = cardPlace();
      if (stage() === 'stop' && place && seen[seen.length - 1]?.place !== place) {
        const card = screen.getByRole('region', { name: 'Day card' });
        seen.push({ place, tag: card.querySelector('.rv-card-tag')!.textContent!, at: t, bubble: screen.getByRole('note').textContent ?? '' });
      }
      if (stage() === 'drive' && seen.length === 1 && left < 0) left = t;
    }
    expect(seen.map(s => s.place)).toEqual(['Colombo', 'Kandy', 'Ella']);
    expect(seen.map(s => s.tag)).toEqual(['DAY 01 // DESTINATION LOCKED', 'DAYS 02 TO 03 // DESTINATION LOCKED', 'DAY 04 // DESTINATION LOCKED']);
    expect(seen.every(s => s.bubble.length > 0 && s.bubble.length <= 32)).toBe(true);
    // Held on the first stop about 2.5 s before driving on.
    expect(left - seen[0].at).toBeGreaterThanOrEqual(HOLD_MS - 100);
    expect(left - seen[0].at).toBeLessThanOrEqual(HOLD_MS + 200);
    expect(vibrate).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('region', { name: 'Mission complete' })).toBeInTheDocument();
  });

  it('shows that stop\'s items and compromise lines on its card, and Next stop moves on before the hold ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fullMotion();
    await mount(<AppProvider><Reveal plan={rplan} cards={cards} onClose={() => {}} /></AppProvider>);
    let t = 0;
    while (cardPlace() !== 'Colombo' && t < 20000) { tick(100); t += 100; }
    const card = screen.getByRole('region', { name: 'Day card' });
    expect(card).toHaveTextContent(nm('galleface'));
    expect(card).toHaveTextContent('STOP 1 OF 3');
    expect(card).not.toHaveTextContent('North out');
    fireEvent.click(screen.getByRole('button', { name: 'Next stop' }));
    expect(stage()).toBe('drive');
    t = 0;
    while (cardPlace() !== 'Kandy' && t < 20000) { tick(100); t += 100; }
    expect(t).toBeLessThan(HOLD_MS);
    const k = screen.getByRole('region', { name: 'Day card' });
    expect(k).toHaveTextContent(nm('tooth'));
    expect(k).toHaveTextContent(nm('knuckles'));
    expect(k).toHaveTextContent('Kandy lake stays though Alex skipped it');
    expect(k).toHaveTextContent('STOP 2 OF 3');
  });

  it('Skip jumps to Mission Complete, which leads to the poster', async () => {
    fullMotion();
    await mount(<AppProvider><Reveal plan={rplan} cards={cards} onClose={() => {}} /></AppProvider>);
    expect(stage()).toBe('intro');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(stage()).toBe('complete');
    const done = screen.getByRole('region', { name: 'Mission complete' });
    expect(within(done).getByText('MISSION COMPLETE')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See the poster' }));
    expect(stage()).toBe('poster');
    expect(screen.getByRole('button', { name: 'Save poster' })).toBeInTheDocument();
  });
});

describe('route reveal, motion off', () => {
  it('shows the finished map, every day card as a list and Mission Complete at once, with no wobble', async () => {
    render(<AppProvider><Reveal plan={rplan} cards={cards} onClose={() => {}} /></AppProvider>);
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveAttribute('data-stage', 'complete');
    expect(screen.queryByRole('button', { name: 'Next stop' })).toBeNull();
    const map = screen.getByRole('img', { name: /^Route:/ });
    for (const n of ['COLOMBO', 'KANDY', 'ELLA']) expect(map.textContent).toContain(n);
    const list = screen.getByRole('list', { name: 'Day cards' });
    const rows = [...list.children] as HTMLElement[];
    expect(rows.map(r => r.querySelector('h2')?.textContent)).toEqual(['Colombo', 'Kandy', 'Ella']);
    expect(rows[1]).toHaveTextContent('DAYS 02 TO 03');
    expect(rows[2]).toHaveTextContent('North out: South won 3 to 2');
    const done = screen.getByRole('region', { name: 'Mission complete' });
    expect(within(done).getAllByRole('img', { name: / selfie$/ }).map(i => i.getAttribute('src')))
      .toEqual(PEOPLE.map(p => `/img/players/${p.toLowerCase()}-selfie.png`));
    expect(within(done).getByRole('list', { name: 'Itinerary' }).children).toHaveLength(rplan.days.length);
    expect(within(done).getByRole('list', { name: 'Chosen experiences' })).toHaveTextContent(nm('ninearch'));
    expect(dlg.querySelector('[data-tuktuk][data-driving="true"]')).toBeNull();
  });
});

describe('itinerary', () => {
  it('names every place a day visits, in order, and the last day flies home', async () => {
    const p: Plan = {
      ...rplan,
      days: [
        rplan.days[0], rplan.days[1],
        { n: 3, area: 'Ella', spare: 0, rainSlack: false, entries: [act1('knuckles'), { kind: 'train', label: 'Nanu Oya to Ella train', hours: 4, itemId: 'train', from: 'Kandy', to: 'Ella' }, act1('ninearch')] },
        { n: 4, area: null, spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'd', hours: 5, from: 'Ella', to: 'AIR' }] },
      ],
    };
    render(<AppProvider><Reveal plan={p} onClose={() => {}} /></AppProvider>);
    const list = await screen.findByRole('list', { name: 'Itinerary' });
    expect([...list.querySelectorAll('.rv-itin-place')].map(e => e.textContent)).toEqual(['Colombo', 'Kandy', 'Kandy to Ella', 'Fly home']);
  });
  it('shows each day its real catalogue photo, on a dashed route, with a stamp day label and no monospace chips', async () => {
    const photo = (id: string) => `/img/${ITEMS.find(i => i.id === id)!.photo}.jpg`;
    const p: Plan = {
      ...rplan,
      days: [
        // A travel-only day shows where it ends up: the first thing planned there.
        { n: 1, area: 'Colombo', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'a', hours: 1, from: 'AIR', to: 'Colombo' }] },
        { n: 2, area: 'Colombo', spare: 0, rainSlack: false, entries: [act1('galleface')] },
        { n: 3, area: 'Kandy and Knuckles', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'b', hours: 3, from: 'Colombo', to: 'Kandy' }, act1('tooth'), act1('knuckles')] },
        { n: 4, area: 'Ella', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'c', hours: 4, from: 'Kandy', to: 'Ella' }, act1('ninearch')] },
        { n: 5, area: null, spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'd', hours: 5, from: 'Ella', to: 'AIR' }] },
      ],
    };
    render(<AppProvider><Reveal plan={p} onClose={() => {}} /></AppProvider>);
    const list = await screen.findByRole('list', { name: 'Itinerary' });
    const days = [...list.children] as HTMLElement[];
    expect(days.map(d => d.querySelector('img')?.getAttribute('src') ?? null))
      .toEqual([photo('galleface'), photo('galleface'), photo('tooth'), photo('ninearch'), null]);
    expect(days.map(d => d.querySelector('.stamp-label')?.textContent)).toEqual(['D01', 'D02', 'D03', 'D04', 'D05']);
    expect(list.classList.contains('route')).toBe(true);
    expect(days[2].querySelector('img')).toHaveAttribute('alt', nm('tooth'));
    const done = screen.getByRole('region', { name: 'Mission complete' });
    expect(done.querySelector('.rv-chips, .rv-itin b')).toBeNull();
  });
});

describe('route reveal, just me', () => {
  it('motion off: my day cards with no compromise lines, then MISSION READY with only my selfie and a way back', async () => {
    const onClose = vi.fn();
    render(<AppProvider><Reveal plan={rplan} who="Lazza" onClose={onClose} /></AppProvider>);
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText('YOUR ROUTE IS IN.')).toBeInTheDocument();
    const rows = [...screen.getByRole('list', { name: 'Day cards' }).children] as HTMLElement[];
    expect(rows.map(r => r.querySelector('h2')?.textContent)).toEqual(['Colombo', 'Kandy', 'Ella']);
    expect(rows[0]).toHaveTextContent('STOP 1 OF 3 · YOUR CALL');
    expect(within(dlg).queryByRole('list', { name: 'Compromises' })).toBeNull();
    const ready = screen.getByRole('region', { name: 'Mission ready' });
    expect(within(ready).getByText('MISSION READY')).toBeInTheDocument();
    expect(within(ready).getAllByRole('img', { name: / selfie$/ }).map(i => i.getAttribute('src'))).toEqual(['/img/players/lazza-selfie.png']);
    expect(within(dlg).queryByRole('button', { name: 'See the poster' })).toBeNull();
    fireEvent.click(within(ready).getByRole('button', { name: 'Back to my trip' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('Skip lands on MISSION READY', async () => {
    fullMotion();
    await mount(<AppProvider><Reveal plan={rplan} who="Lazza" onClose={() => {}} /></AppProvider>);
    expect(stage()).toBe('intro');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(stage()).toBe('complete');
    expect(screen.getByRole('region', { name: 'Mission ready' })).toBeInTheDocument();
  });
});
