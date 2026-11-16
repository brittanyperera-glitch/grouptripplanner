import type { DayBooking } from '../types';
import { addDays } from './deadlines';

// RFC 5545 text escaping: backslash first, so the ones added for commas and semicolons survive.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, m => `\\${m}`).replace(/\r?\n/g, '\\n');
const compact = (date: string) => date.replace(/-/g, '');

/** An all-day calendar of the trip: one event per day, and one per booking on the day to act (opens, else book-by). */
export function tripIcs(days: { n: number; date: string; title: string }[], bookings: DayBooking[]): string {
  const events: { uid: string; date: string; summary: string }[] = days.map(d => ({ uid: `day-${d.n}`, date: d.date, summary: d.title }));
  for (const b of bookings) {
    if (b.opensOn) events.push({ uid: `open-${b.id}`, date: b.opensOn, summary: `Booking opens: ${b.label}` });
    else if (b.bookBy) events.push({ uid: `by-${b.id}`, date: b.bookBy, summary: `Book by: ${b.label}` });
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Group Trip Hero//Sri Lanka 2026//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT', `UID:${e.uid}@grouptriphero`,
      // DTSTAMP is required; the event's own date keeps the file the same on every download.
      `DTSTAMP:${compact(e.date)}T000000Z`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`,
      `SUMMARY:${esc(e.summary)}`, 'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(l => `${l}\r\n`).join('');
}
