import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import { emptyRanking } from '../types';
import type { GroupResult, Item, Person, Plan as PlanT, Response } from '../types';
import Finalize from './Finalize';
import Plan from './Plan';

// Brittany 2026-10-15: after the head to heads each person finalizes their own list.
const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const [A, B, C] = [ITEMS[0], ITEMS[1], ITEMS[2]];

const resp = (name: Person, over: Partial<Response> = {}): Response => {
  const r = emptyRanking(); r.must = [[A.id, B.id]]; r.keen = [[C.id]];
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: [A.id, B.id, C.id], submitted: true, updatedAt: '', ...over };
};
const saved = (p: Person) => JSON.parse(localStorage.getItem(`tp:resp:${p}`) ?? '{}') as Response;
const plan = (): PlanT => ({ route: ['AIR', 'AIR'], areas: [], chosen: [A.id], dropped: [], travelHours: 1, fits: true, missingMusts: [], score: 0, days: [] });
const group = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: plan(), final: plan(), knockouts: [], results: [], extras: [], knocked: [B.id], finalized: [], locked: false, ...over,
});
const show = (g: GroupResult) => render(<AppProvider store={new LocalStore()}><Finalize group={g} /><Plan group={g} /></AppProvider>);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tp:me', 'Alex');
  localStorage.setItem('tp:resp:Alex', JSON.stringify(resp('Alex')));
});

describe('Finalize your list', () => {
  it('opens in tier order with the knocked-down Must at the end of the Keens, and saves the moved list', async () => {
    const user = userEvent.setup();
    show(group());
    const list = await screen.findByRole('region', { name: 'Finalize your list' });
    expect(Array.from(list.querySelectorAll('.nm')).map(n => n.textContent)).toEqual([A.name, C.name, B.name]);
    expect(within(list).getByText('Lost a head to head')).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: `Move ${B.name} up` }));
    await user.click(screen.getByRole('button', { name: 'Save my list' }));
    await waitFor(() => expect(saved('Alex').final).toEqual({ ...emptyRanking(), must: [[A.id]], keen: [[C.id, B.id]] }));
    expect(saved('Alex').ranking).toEqual(resp('Alex').ranking);
  });
  it('after saving shows how many have finalized, and the plan stays provisional until all five have', async () => {
    localStorage.setItem('tp:resp:Alex', JSON.stringify(resp('Alex', { final: { ...emptyRanking(), must: [[A.id]] } })));
    show(group({ finalized: ['Alex', 'Lazza'] }));
    expect(await screen.findByText(/Your final list is saved\. 2 of 5 done/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change my list' })).toBeInTheDocument();
    expect(screen.getByText(/Provisional until all five finalize their lists/)).toBeInTheDocument();
  });
  it('is not offered while head to heads are open or once the plan is locked', async () => {
    const { unmount } = show(group({ final: null, knockouts: [{ forkId: 'ko:x', a: [A.id], b: [C.id], votes: { a: [], b: [] } }] }));
    await screen.findByText(/Provisional until the knockouts are done/);
    expect(screen.queryByRole('region', { name: 'Finalize your list' })).toBeNull();
    unmount();
    show(group({ finalized: ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'], locked: true }));
    await screen.findByText(/about 1\.0 h driving/);
    expect(screen.queryByRole('region', { name: 'Finalize your list' })).toBeNull();
    expect(screen.queryByText(/Your final list is saved/)).toBeNull();
  });
});
