import { describe, expect, it } from 'vitest';
import type { DayBooking } from '../types';
import { bookingParts, bookingText } from './bookingText';

const b = (o: Partial<DayBooking>): DayBooking => ({ id: 'book:train', label: 'Ella train', status: 'open', opensOn: null, bookBy: null, owner: null, ...o });

describe('bookingText', () => {
  it('words every status once, with the owner only where there is one', () => {
    expect(bookingText(b({ status: 'open', owner: 'Alex' }))).toBe('Open · Alex booking');
    expect(bookingText(b({ status: 'open' }))).toBe('Open');
    expect(bookingText(b({ status: 'done', owner: 'Alex' }))).toBe('Done · Alex');
    expect(bookingText(b({ status: 'not-open', opensOn: '2026-11-08' }))).toBe('Opens 8 Nov');
    expect(bookingText(b({ status: 'not-open' }))).toBe('Not open yet');
    expect(bookingText(b({ status: 'overdue', bookBy: '2026-11-20' }))).toBe('Overdue');
    expect(bookingText(b({ status: 'undated' }))).toBe('No date yet');
  });

  it('hands the screen the same words in parts, so the chip and the owner can sit in separate elements', () => {
    expect(bookingParts(b({ status: 'open', owner: 'Alex' }))).toEqual({ status: 'Open', owner: 'Alex', note: 'booking' });
    expect(bookingParts(b({ status: 'done', owner: 'Alex' }))).toEqual({ status: 'Done', owner: 'Alex', note: null });
  });
});
