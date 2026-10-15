import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Copy } from '../state';
import type { Item } from '../types';
import Rate from './Rate';

const copy = { welcome: '', quips: { name: {}, days: {}, pace: {}, tier: {} }, items: {} } as Copy;
const base: Item = { id: 'a', name: 'Crab', area: 'Colombo', about: 'x', hours: 2, slot: 'evening', fee: '', sideTrip: 0 };
const tag = (item: Item) => {
  const { container } = render(<Rate item={item} n={1} total={3} copy={copy} onTier={vi.fn()} />);
  return container.querySelector('.area-tag')!.textContent;
};

describe('category chip on the rating card', () => {
  it('shows area and category for a catalogue item', () => {
    expect(tag({ ...base, category: 'Food' })).toBe('Colombo · Food');
  });
  it('shows the area alone for a suggestion with no category', () => {
    expect(tag({ ...base, id: 's:1' })).toBe('Colombo');
  });
});
