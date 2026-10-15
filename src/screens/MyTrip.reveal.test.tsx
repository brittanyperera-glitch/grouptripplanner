import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import type { Plan } from '../types';
import MyTrip, { REVEAL_SEEN_KEY } from './MyTrip';

const plan: Plan & { mustFit: number | null } = {
  route: ['AIR', 'Colombo', 'Kandy', 'Ella', 'AIR'], areas: ['Colombo', 'Kandy and Knuckles', 'Ella'], chosen: ['galleface', 'tooth'],
  dropped: [], travelHours: 9, fits: true, missingMusts: [], score: 0, mustFit: 4,
  days: [
    { n: 1, area: 'Colombo', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'Drive from the airport to Colombo', hours: 1, from: 'AIR', to: 'Colombo' }, { kind: 'activity', label: 'x', hours: 2, itemId: 'galleface' }] },
    { n: 2, area: 'Kandy and Knuckles', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'Drive from Colombo to Kandy', hours: 3, from: 'Colombo', to: 'Kandy' }, { kind: 'activity', label: 'y', hours: 2, itemId: 'tooth' }] },
    { n: 3, area: 'Ella', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'Drive from Kandy to Ella', hours: 4, from: 'Kandy', to: 'Ella' }] },
    { n: 4, area: null, spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'Drive from Ella to the airport', hours: 5, from: 'Ella', to: 'AIR' }] },
  ],
};

const WEBDRIVER = navigator.webdriver;
const fullMotion = () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
};
const ui = () => <AppProvider store={new LocalStore()}><MyTrip plan={plan} days={4} /></AppProvider>;
const mount = async (el: ReactElement) => {
  const r = render(el);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return r;
};
const routeMap = () => screen.getByRole('img', { name: /^Route:/ });
const labels = () => [...routeMap().querySelectorAll('text')].map(t => t.textContent);

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Lazza'); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); Object.defineProperty(navigator, 'webdriver', { value: WEBDRIVER, configurable: true }); });

describe('My trip reveal', () => {
  it('Play my route reveal opens the personal reveal, which closes back to My trip', async () => {
    render(ui());
    fireEvent.click(await screen.findByRole('button', { name: 'Play my route reveal' }));
    const dlg = screen.getByRole('dialog', { name: 'Route reveal' });
    const ready = within(dlg).getByRole('region', { name: 'Mission ready' });
    expect(within(ready).getAllByRole('img', { name: / selfie$/ }).map(i => i.getAttribute('src'))).toEqual(['/img/players/lazza-selfie.png']);
    expect(within(dlg).queryByRole('list', { name: 'Compromises' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'See the poster' })).toBeNull();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Back to my trip' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Your best 4 days')).toBeInTheDocument();
  });

  it('plays itself the first time My trip opens with motion on, and only the first time', async () => {
    fullMotion();
    const first = render(ui());
    expect(await screen.findByRole('dialog', { name: 'Route reveal' })).toBeInTheDocument();
    expect(localStorage.getItem(REVEAL_SEEN_KEY)).not.toBeNull();
    expect(REVEAL_SEEN_KEY.startsWith('tp:')).toBe(true); // so ?fresh resets it
    first.unmount();
    render(ui());
    await screen.findByText('Your best 4 days');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not play itself with motion off', async () => {
    render(ui());
    await screen.findByText('Your best 4 days');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(REVEAL_SEEN_KEY)).toBeNull();
  });
});

describe('My trip map drive', () => {
  it('draws the route leg by leg while the tuk-tuk drives it once, then parks', async () => {
    localStorage.setItem(REVEAL_SEEN_KEY, '1');
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fullMotion();
    await mount(ui());
    const tuk = () => routeMap().querySelector('[data-tuktuk]');
    expect(tuk()).toHaveAttribute('data-driving', 'true');
    expect(labels()).not.toContain('Ella');
    const drive = () => routeMap().closest('.map')?.getAttribute('data-drive');
    expect(drive()).toBe('on');
    const seen: string[] = [];
    for (let t = 0; t < 15000 && drive() !== 'done'; t += 100) {
      act(() => { vi.advanceTimersByTime(100); });
      for (const n of ['Colombo', 'Kandy', 'Ella']) if (labels().includes(n) && !seen.includes(n)) seen.push(n);
    }
    expect(seen).toEqual(['Colombo', 'Kandy', 'Ella']);
    expect(drive()).toBe('done');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(tuk()).toHaveAttribute('data-driving', 'false');
    expect(routeMap().querySelectorAll('polyline')).toHaveLength(2);
    expect(labels()).toEqual(expect.arrayContaining(['Airport', 'Colombo', 'Kandy', 'Ella']));
  });

  it('with motion off the map is static, with no tuk-tuk', async () => {
    render(ui());
    await screen.findByText('Your best 4 days');
    expect(routeMap().querySelector('[data-tuktuk]')).toBeNull();
    expect(labels()).toEqual(expect.arrayContaining(['Airport', 'Colombo', 'Kandy', 'Ella']));
  });
});

describe('RouteMap default render', () => {
  it('stays static without drive: two polylines, every stop, no tuk-tuk (Plan uses this)', async () => {
    fullMotion();
    const { default: RouteMap } = await import('../components/Map');
    const { container } = render(<RouteMap route={plan.route} />);
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    expect(container.querySelector('[data-tuktuk]')).toBeNull();
    expect([...container.querySelectorAll('text')].map(t => t.textContent)).toEqual(['Airport', 'Colombo', 'Kandy', 'Ella']);
  });
});
