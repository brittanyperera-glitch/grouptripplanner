import { describe, expect, it } from 'vitest';
import type { DayBooking } from '../types';
import { tripIcs } from './ics';

const days = Array.from({ length: 9 }, (_, i) => ({ n: i + 1, date: `2026-12-${String(8 + i).padStart(2, '0')}`, title: `Day ${i + 1}, Colombo; Kandy` }));
const bk = (id: string, label: string, opensOn: string | null, bookBy: string | null): DayBooking => ({ id, label, status: 'open', opensOn, bookBy, owner: null });
const count = (s: string, needle: string) => s.split('\r\n').filter(l => l === needle).length;

describe('tripIcs', () => {
  const ics = tripIcs(days, [bk('book:train', 'Train', '2026-11-12', null), bk('book:crab', 'Crab', null, '2026-11-24'), bk('book:sigiriya', 'Sigiriya', null, null)]);
  it('has a calendar wrapper and PRODID', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('PRODID:');
  });
  it('has 9 day events plus one per dated booking, and none for an undated one', () => {
    expect(count(ics, 'BEGIN:VEVENT')).toBe(11);
    expect(count(ics, 'END:VEVENT')).toBe(11);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261208');
    expect(ics).toContain('SUMMARY:Booking opens: Train');
    expect(ics).toContain('SUMMARY:Book by: Crab');
    expect(ics).not.toContain('Sigiriya');
  });
  it('puts a booking on its action date', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261112');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261124');
  });
  it('ends every line with CRLF and never a bare LF', () => {
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });
  it('gives every event a distinct UID', () => {
    const uids = ics.split('\r\n').filter(l => l.startsWith('UID:'));
    expect(uids).toHaveLength(11);
    expect(new Set(uids).size).toBe(11);
  });
  it('escapes commas and semicolons in text', () => {
    expect(ics).toContain('SUMMARY:Day 1\\, Colombo\\; Kandy');
  });
  it('is just the calendar when there is nothing', () => {
    expect(count(tripIcs([], []), 'BEGIN:VEVENT')).toBe(0);
  });
});
