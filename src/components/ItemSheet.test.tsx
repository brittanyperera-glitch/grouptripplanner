import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import type { Item } from '../types';
import ItemSheet from './ItemSheet';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const byId = (id: string) => ITEMS.find(i => i.id === id)!;

describe("Britt's guide notes on the full-screen card", () => {
  it('shows the note for a place she wrote about', () => {
    render(<ItemSheet items={[byId('yala')]} title="Yala" onClose={() => {}} />);
    expect(screen.getByTestId('is-britt').textContent).toBe(`Britt says: ${byId('yala').britt}`);
  });
  it('shows nothing for a place she did not', () => {
    expect(byId('galle').britt).toBeUndefined();
    render(<ItemSheet items={[byId('galle')]} title="Galle" onClose={() => {}} />);
    expect(screen.queryByTestId('is-britt')).toBeNull();
  });
  it('every note is short enough for the card (40 words)', () => {
    const noted = ITEMS.filter(i => i.britt);
    expect(noted.length).toBe(14);
    for (const i of noted) expect(i.britt!.split(/\s+/).length, i.id).toBeLessThanOrEqual(40);
  });
});
