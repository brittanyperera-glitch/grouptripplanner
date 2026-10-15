import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Copy } from '../state';
import type { Item } from '../types';
import Rate from './Rate';

const item = {
  id: 'a', name: 'Alpha Rock', area: 'Cultural Triangle', category: 'Hike', about: 'About text', hours: 3, slot: 'morning',
  fee: 'LKR 3,000 (~£6.50)', warn: 'Steep steps', sideTrip: 0, google: { url: 'https://maps.example/a' },
} as unknown as Item;

function card(review?: string, reviewUrl?: string) {
  const copy = { welcome: '', quips: { name: {}, days: {}, pace: {}, tier: {} }, items: { a: { review, reviewUrl } } } as unknown as Copy;
  const { container } = render(<Rate item={item} n={2} total={5} copy={copy} onTier={vi.fn()} />);
  return container.querySelector('.card:not(.ghost)') as HTMLElement;
}
const text = (el: Element, sel: string) => el.querySelector(sel)?.textContent ?? null;

describe('swipe card layout', () => {
  it('keeps title, stamp, facts, description, heads-up, review and map link inside the card', () => {
    const c = card('“Lovely” (Vishwa Bahnu, Google review)');
    expect(c.querySelector('.title')?.textContent).toBe('Alpha Rock');
    for (const sel of ['.area-tag', '.pill', '.about', '.fact-warn', '.review', 'a.gr', '.info']) expect(c.querySelector(sel), sel).not.toBeNull();
    expect(c.querySelector('.pills')?.textContent).toContain('LKR 3,000 (~£6.50)');
  });
});

describe('review card', () => {
  it('shows the stored name in full, an initial badge, a source label and the quote', () => {
    const r = card('“Lovely place” (Vishwa Bahnu, Google review)').querySelector('.review') as HTMLElement;
    expect(text(r, '.review-name')).toBe('Vishwa Bahnu');
    expect(text(r, '.review-badge')).toBe('V');
    expect(text(r, '.review-source')).toBe('Google review');
    expect(text(r, '.review-quote')).toBe('“Lovely place”');
    expect(r.textContent).not.toContain('(');
  });
  it('shows only the label when the review has no person', () => {
    for (const [raw, label] of [['“Fine” (Google review)', 'Google review'], ['“Listed” (Google AI Overview)', 'Google AI Overview']]) {
      const r = card(raw).querySelector('.review') as HTMLElement;
      expect(r.querySelector('.review-name'), raw).toBeNull();
      expect(r.querySelector('.review-badge'), raw).toBeNull();
      expect(text(r, '.review-source')).toBe(label);
    }
  });
  it('links the quote when there is a review url and has no star rating', () => {
    const r = card('“Lovely” (Ash, Google review)', 'https://g.example/r').querySelector('.review') as HTMLElement;
    expect(r.querySelector('.review-quote a')?.getAttribute('href')).toBe('https://g.example/r');
    expect(r.textContent).not.toMatch(/[★⭐]/);
  });
});
