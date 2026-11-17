import type { DayBooking } from '../types';
import { addDays } from './calendar';

// RFC 5545 text escaping: backslash first, so the ones added for commas and semicolons survive.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, m => `\\${m}`).replace(/\r?\n/g, '\\n');
// RFC 5545 3.1: a line is at most 75 octets (UTF-8, not characters); the rest continues on a line that starts with one space.
const enc = new TextEncoder();
function fold(line: string): string {
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}
const compact = (date: string) => date.replace(/-/g, '');

/** An all-day calendar of the trip: one event per day, and one for each date a booking has (opens, book-by); done bookings have none. */
export function tripIcs(days: { n: number; date: string; title: string }[], bookings: DayBooking[]): string {
  const events: { uid: string; date: string; summary: string }[] = days.map(d => ({ uid: `day-${d.n}`, date: d.date, summary: d.title }));
  for (const b of bookings) {
    if (b.status === 'done') continue;
    if (b.opensOn) events.push({ uid: `open-${b.id}`, date: b.opensOn, summary: `Booking opens: ${b.label}` });
    if (b.bookBy) events.push({ uid: `by-${b.id}`, date: b.bookBy, summary: `Book by: ${b.label}` });
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Group Trip Hero//Sri Lanka 2026//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    // An unreadable date has no day to put the event on, so it is left out rather than thrown.
    const end = addDays(e.date, 1);
    if (end === null) continue;
    lines.push(
      'BEGIN:VEVENT', `UID:${e.uid}@grouptriphero`,
      // DTSTAMP is required; the event's own date keeps the file the same on every download.
      `DTSTAMP:${compact(e.date)}T000000Z`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(end)}`,
      `SUMMARY:${esc(e.summary)}`, 'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(l => `${fold(l)}\r\n`).join('');
}
