import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import { emptyRanking } from '../types';
import type { GroupResult, Item, Person, Plan as PlanT, Response } from '../types';
import MyTrip from './MyTrip';
import Plan from './Plan';

// D7 (Brittany 2026-10-15): Skip stays a strong minus, not a veto, and the group plan says who skipped.
const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const [A, B] = [ITEMS[0], ITEMS[1]];

const resp = (name: Person, must: string[], skip: string[]): Response => {
  const r = emptyRanking(); r.must = must.map(id => [id]); r.skip = skip.map(id => [id]);
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: [...must, ...skip], submitted: true, updatedAt: '' };
};
const seed = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));

const twoItems = (): PlanT & { mustFit: number | null } => ({
  route: ['AIR', 'AIR'], areas: [], chosen: [A.id, B.id], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0, mustFit: null,
  days: [{ n: 1, area: null, spare: 0, rainSlack: false, entries: [
    { kind: 'activity', label: A.name, hours: 2, onSite: 2, itemId: A.id },
    { kind: 'activity', label: B.name, hours: 2, onSite: 2, itemId: B.id },
  ] }],
});
const group = (p: PlanT): GroupResult => ({ open: true, days: 9, pace: 1, base: p, final: p, knockouts: [], results: [], extras: [], knocked: [], finalized: [], locked: false });

beforeEach(() => {
  localStorage.clear();
  seed(resp('Brittany', [A.id, B.id], []));
  seed(resp('Alex', [], [A.id]));
  seed(resp('Lazza', [], [A.id]));
});

describe('who skipped a planned item', () => {
  it('the group plan names everyone who skipped each item, and only on that item', async () => {
    render(<AppProvider store={new LocalStore()}><Plan group={group(twoItems())} /></AppProvider>);
    const line = await screen.findByText('Skipped by Alex and Lazza');
    expect(line.closest('.entry')).toHaveTextContent(A.name);
    expect(screen.getAllByText(/^Skipped by/)).toHaveLength(1);
  });
  it('my own trip does not show it', async () => {
    render(<AppProvider store={new LocalStore()}><MyTrip plan={twoItems()} days={9} /></AppProvider>);
    await screen.findByText(A.name, { exact: false });
    expect(screen.queryByText(/Skipped by/)).toBeNull();
  });
});
