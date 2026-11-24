import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
vi.mock('../components/sound', () => ({ thud: vi.fn(), jingle: vi.fn() }));
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { RELEASE } from '../lib/release';
import { ADMIN_IDS } from '../lib/tripadmin';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import { PEOPLE } from '../types';
import type { Area, GroupResult, Item, Leg, Person } from '../types';
import MissionHQ from './MissionHQ';

const group: GroupResult = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
const areas = [...new Set(group.final!.days.flatMap(d => (d.area ? [d.area] : [])))];
const AT = '2026-11-02T00:00:00Z';
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const stay = (area: Area, n = 1) => ({ id: `s-${area}-${n}`, name: 'Alex' as const, area, kind: 'stay' as const, title: `${area} ${n}`, status: 'live' as const, createdAt: AT });

/** Every booking ticked, every flight in, every area pinned; `lone` has one unpinned option and `lone`'s scout is Lazza. */
function seed(o: { me?: Person; start?: string | null; lone?: Area; dark?: Person[]; open?: boolean } = {}) {
  localStorage.setItem('tp:me', o.me ?? 'Lazza');
  put('tp:settings', { startDate: o.start === undefined ? '2026-12-08' : o.start, plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
  put('tp:placesug', areas.map(a => stay(a)));
  put('tp:staysadmin', { pins: areas.filter(a => a !== o.lone).map(a => ({ area: a, suggestionId: `s-${a}-1`, at: AT })), scouts: o.lone ? { [o.lone]: 'Lazza' } : {}, closed: [] });
  put('tp:travellers', Object.fromEntries(PEOPLE.filter(p => !o.dark?.includes(p)).map(p => [p, { name: p, arriveLocal: '2026-12-08T09:00', arriveFlight: null, departLocal: '2026-12-16T09:00', departFlight: null, updatedAt: AT }])));
  put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ADMIN_IDS.map(id => [id, { done: !o.open, doneAt: AT }])), updatedAt: AT });
}
const cbs = () => ({ onGo: vi.fn(), onOpen: vi.fn() });
const mount = (c = cbs()) => {
  render(<AppProvider store={new LocalStore()}><MissionHQ group={group} today="2026-12-01" {...c} /></AppProvider>);
  return c;
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('Mission HQ', () => {
  it('puts your next move first and brightest: the 2nd stay for a scout, above the countdown, the only accent', async () => {
    seed({ lone: areas[0] });
    const { onGo } = mount();
    const move = await screen.findByText(`Find a 2nd stay for ${areas[0]}`);
    const timer = await screen.findByRole('timer');
    expect(move.compareDocumentPosition(timer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const accents = [...document.querySelectorAll('.spy [class*="spy-btn-solid"], .spy [class*="spy-stamp"]:not(.spy-stamp-quiet)')];
    expect(accents).toHaveLength(1);
    expect(accents[0]).toHaveTextContent('Start mission');
    expect(timer).toHaveTextContent(/^T-\d+d \d\d:\d\d:\d\d$/);
    await userEvent.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(onGo).toHaveBeenCalledWith({ file: 'stays', id: areas[0], label: `Find a 2nd stay for ${areas[0]}` });
  });

  it('opens a file on tap, and shows the crew ring and three files', async () => {
    seed({ lone: areas[0] });
    const { onOpen } = mount();
    await userEvent.click(await screen.findByRole('button', { name: /^Stays/ }));
    expect(onOpen).toHaveBeenCalledWith('stays');
    expect(screen.getByRole('img', { name: /^Crew readiness \d+ percent$/ })).toBeInTheDocument();
    expect(document.querySelectorAll('.spy-mission')).toHaveLength(3);
  });

  it('with no start date says so and shows no countdown digits', async () => {
    seed({ lone: areas[0], start: null });
    mount();
    expect(await screen.findByText('Launch date not set')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(document.body.textContent).not.toMatch(/T-\d+d/);
  });

  it('with every mission done it keeps the stamped board: three Done stamps, no plain fallback', async () => {
    seed();
    mount();
    expect(await screen.findByRole('heading', { name: 'Mission HQ' })).toBeInTheDocument();
    expect(document.querySelector('.spy')).not.toBeNull();
    expect(document.querySelectorAll('.spy-mission .spy-stamp')).toHaveLength(3);
    expect(screen.queryByText('Every mission is done.')).toBeNull();
  });

  it('renders nothing for someone who is not one of the five', async () => {
    seed();
    localStorage.setItem('tp:me', 'Mum');
    const { container } = render(<AppProvider store={new LocalStore()}><MissionHQ group={group} {...cbs()} /></AppProvider>);
    await waitFor(() => expect(localStorage.getItem('tp:me')).toBe('Mum'));
    expect(container.innerHTML).toBe('');
  });
});
