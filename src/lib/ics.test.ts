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

describe('tripIcs bookings and folding', () => {
  it('gives a booking with both dates two events, opens and book-by', () => {
    const ics = tripIcs([], [bk('book:train', 'Train', '2026-11-12', '2026-11-24')]);
    expect(count(ics, 'BEGIN:VEVENT')).toBe(2);
    expect(ics).toContain('SUMMARY:Booking opens: Train');
    expect(ics).toContain('SUMMARY:Book by: Train');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261112');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261124');
  });
  it('gives a done booking no events', () => {
    const done: DayBooking = { ...bk('book:train', 'Train', '2026-11-12', '2026-11-24'), status: 'done' };
    expect(count(tripIcs([], [done]), 'BEGIN:VEVENT')).toBe(0);
  });
  it('folds lines over 75 octets with CRLF and one space, without splitting a character', () => {
    const long = `${'Booking '.repeat(14)}caf\u00e9 \u{1F334}`.repeat(2);
    const ics = tripIcs([{ n: 1, date: '2026-12-08', title: long }], []);
    const lines = ics.split('\r\n');
    for (const l of lines) expect(Buffer.byteLength(l), l).toBeLessThanOrEqual(75);
    expect(lines.some(l => l.startsWith(' '))).toBe(true);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${long}`);
  });
});

