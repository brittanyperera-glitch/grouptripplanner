import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import { PEOPLE } from '../types';
import type { Area, CrewStays, GroupResult, Plan, PlaceSuggestion } from '../types';
import { HOSTELS, HUB_AREA, hostelPrice } from '../lib/stayflow';
import Stays from './Stays';

const grp = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../workers/usePlan', async orig => ({ ...(await orig<typeof import('../workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

// One night in each area the six unpriced guide hostels live in, plus Ella, so Stays hands the sheet the real area list.
const AREAS_IN_PLAN: Area[] = ['Ella', 'North', 'East coast', 'Kandy and Knuckles', 'Hill country', 'South coast'];
const plan = {
  route: ['AIR'], areas: AREAS_IN_PLAN, chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
  // The last day is a bare departure day: a night is counted for an area only when a later day follows it.
  days: [...AREAS_IN_PLAN, null].map((area, i) => ({ n: i + 1, area, entries: [], spare: 0, rainSlack: false })),
} as unknown as Plan;
const crewRow = (name: (typeof PEOPLE)[number]): CrewStays => ({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z' });

const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const mount = async () => {
  localStorage.setItem('tp:me', 'Brittany');
  render(<AppProvider store={new LocalStore()}><Stays /></AppProvider>);
  await screen.findByRole('list', { name: 'Stays steps' });
  return userEvent.setup();
};
const openSheet = async (user: Awaited<ReturnType<typeof mount>>, area: Area) => {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${area}, `) }));
  await user.click(btn('+ Add a stay'));
  return within(screen.getByRole('dialog'));
};
const fold = () => screen.getByRole('dialog').querySelector('details') as HTMLDetailsElement;

beforeEach(() => {
  localStorage.clear();
  grp.current = { final: plan, locked: true } as unknown as GroupResult;
  localStorage.setItem('tp:stays:Brittany', JSON.stringify(crewRow('Brittany')));
});
afterEach(() => cleanup());

describe('add a stay starts with the guide pick and the link', () => {
  it('opens with the pick and the link up front and the details fold closed', async () => {
    const dlg = await openSheet(await mount(), 'Ella');
    expect(dlg.getByLabelText("Choose from the guide's hostels")).toBeVisible();
    expect(dlg.getByLabelText('Link')).toBeVisible();
    expect(fold().open).toBe(false);
    expect(fold().querySelector('summary')).toHaveTextContent('Add details');
    expect(dlg.getByRole('button', { name: 'Add this stay' })).toBeDisabled();
  });

  it('picking a guide hostel enables Save with the fold still closed', async () => {
    const user = await mount();
    const dlg = await openSheet(user, 'Ella');
    await user.selectOptions(dlg.getByLabelText("Choose from the guide's hostels"), 'ella-escapade');
    expect(dlg.getByRole('button', { name: 'Add this stay' })).toBeEnabled();
    expect(fold().open).toBe(false);
    await user.click(dlg.getByRole('button', { name: 'Add this stay' }));
    expect(JSON.parse(localStorage.getItem('tp:placesug') ?? '[]')).toMatchObject([{ hostelId: 'ella-escapade', priceGbp: 6.04 }]);
  });

  it('a pasted bare link opens the fold and puts the cursor in Name; Save waits for it', async () => {
    const user = await mount();
    const dlg = await openSheet(user, 'Ella');
    await user.click(dlg.getByLabelText('Link'));
    await user.paste('https://example.com/hut');
    expect(fold().open).toBe(true);
    expect(dlg.getByLabelText('Name')).toHaveFocus();
    expect(dlg.getByRole('button', { name: 'Add this stay' })).toBeDisabled();
  });

  it('with the name already filled, the pasted link puts the cursor in the price instead', async () => {
    const user = await mount();
    const dlg = await openSheet(user, 'Ella');
    await user.type(dlg.getByLabelText('Name'), 'Hill hut');
    await user.click(dlg.getByLabelText('Link'));
    await user.paste('https://example.com/hut');
    expect(dlg.getByLabelText(/^Price per person/)).toHaveFocus();
    expect(dlg.getByRole('button', { name: 'Add this stay' })).toBeDisabled();
    await user.type(dlg.getByLabelText(/^Price per person/), '12');
    expect(dlg.getByRole('button', { name: 'Add this stay' })).toBeEnabled();
  });

  it('typing a link by hand opens the fold but never takes the cursor off the link', async () => {
    const user = await mount();
    const dlg = await openSheet(user, 'Ella');
    await user.type(dlg.getByLabelText('Link'), 'example.com/hut');
    expect(fold().open).toBe(true);
    expect(dlg.getByLabelText('Link')).toHaveFocus();
    expect(dlg.getByLabelText('Link')).toHaveValue('example.com/hut');
  });

  it('a link that is not a web link leaves the fold alone', async () => {
    const user = await mount();
    const dlg = await openSheet(user, 'Ella');
    await user.click(dlg.getByLabelText('Link'));
    await user.paste('javascript:alert(1)');
    expect(fold().open).toBe(false);
  });

  it('the fold opens and closes by hand', async () => {
    const user = await mount();
    await openSheet(user, 'Ella');
    await user.click(screen.getByText('Add details'));
    expect(fold().open).toBe(true);
    await user.click(screen.getByText('Add details'));
    expect(fold().open).toBe(false);
  });

  it('an eat, do or gem idea has no fold: its name is up front', async () => {
    const user = await mount();
    await user.click(screen.getByRole('button', { name: /^Ella, / }));
    await user.click(btn('Gems'));
    await user.click(btn('+ Add an idea'));
    expect(screen.getByRole('dialog').querySelector('details')).toBeNull();
    expect(within(screen.getByRole('dialog')).getByLabelText('Name')).toBeVisible();
  });
});

describe('editing a stay', () => {
  it('opens with the fold open and my saved values in it', async () => {
    const mine: PlaceSuggestion = { id: 'a1', name: 'Brittany', area: 'Ella', kind: 'stay', title: 'Hill hut', priceGbp: 10, why: 'Quiet', rooms: 'dorm', status: 'live', createdAt: '2026-10-11' };
    localStorage.setItem('tp:placesug', JSON.stringify([mine]));
    const user = await mount();
    await user.click(screen.getByRole('button', { name: /^Ella, / }));
    await user.click(btn('Edit'));
    const dlg = within(screen.getByRole('dialog'));
    expect(fold().open).toBe(true);
    expect(dlg.getByLabelText('Name')).toHaveValue('Hill hut');
    expect(dlg.getByLabelText(/^Price per person/)).toHaveValue('10');
    expect(dlg.getByLabelText(/^Why/)).toHaveValue('Quiet');
    expect(dlg.getByRole('button', { name: 'Dorm' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the six guide hostels with no price (real catalogue)', () => {
  const unpriced = HOSTELS.filter(h => hostelPrice(h) === null);
  it('there are six, and each sits in an area the sheet can show', () => {
    expect(unpriced).toHaveLength(6);
    expect(unpriced.every(h => AREAS_IN_PLAN.includes(HUB_AREA[h.hub] as Area))).toBe(true);
  });
  it.each(unpriced.map(h => [h.id, h.name] as const))('picking %s enables Save while the fold is closed', async (id) => {
    const user = await mount();
    const h = unpriced.find(x => x.id === id)!;
    const dlg = await openSheet(user, HUB_AREA[h.hub] as Area);
    await user.selectOptions(dlg.getByLabelText("Choose from the guide's hostels"), id);
    expect(fold().open).toBe(false);
    expect(dlg.getByRole('button', { name: 'Add this stay' })).toBeEnabled();
  });
});
