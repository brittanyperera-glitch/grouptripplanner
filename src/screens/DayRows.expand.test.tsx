import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import type { Item, Plan } from '../types';
import { DayRows } from './MyTrip';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const train = ITEMS.find(i => i.id === 'train')!;
const galle = ITEMS.find(i => i.id === 'galle')!;
const entry = (i: Item) => ({ kind: 'activity' as const, label: i.name, hours: i.hours, itemId: i.id });
const plan: Plan = {
  route: ['AIR', 'Ella', 'AIR'], areas: [], chosen: [train.id, galle.id], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
  days: [{ n: 1, area: 'Ella', spare: 0, rainSlack: false, entries: [entry(train), entry(galle), { kind: 'free', label: 'Free time', hours: 0 }] }],
};

afterEach(cleanup);

describe('tap-to-expand plan entries', () => {
  it('toggles aria-expanded and shows book, heads up and Britt says for an item that has them', () => {
    expect(train.book && train.warn && train.britt).toBeTruthy();
    render(<DayRows plan={plan} items={ITEMS} />);
    const row = screen.getByRole('button', { name: new RegExp(train.name) });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(train.book!, { exact: false })).toBeNull();
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(train.book!, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(train.warn!, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(train.britt!, { exact: false })).toBeInTheDocument();
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(train.book!, { exact: false })).toBeNull();
  });

  it('keeps one row open at a time', () => {
    render(<DayRows plan={plan} items={ITEMS} />);
    const [a, b] = [screen.getByRole('button', { name: new RegExp(train.name) }), screen.getByRole('button', { name: new RegExp(galle.name) })];
    fireEvent.click(a);
    fireEvent.click(b);
    expect(a).toHaveAttribute('aria-expanded', 'false');
    expect(b).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the full sheet for that item from Full details', () => {
    render(<DayRows plan={plan} items={ITEMS} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(galle.name) }));
    fireEvent.click(screen.getByRole('button', { name: 'Full details' }));
    const sheet = screen.getByRole('dialog', { name: galle.name });
    expect(within(sheet).getByRole('heading', { level: 3, name: galle.name })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves entries without an item plain, and plain without items passed in', () => {
    render(<DayRows plan={plan} items={ITEMS} />);
    expect(screen.getByText('Free time').closest('button')).toBeNull();
    cleanup();
    render(<DayRows plan={plan} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
