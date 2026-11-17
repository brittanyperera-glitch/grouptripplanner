import type { BookingStatus, DayBooking } from '../types';

export const STATUS_LABEL: Record<BookingStatus, string> = { undated: 'No date yet', 'not-open': 'Not open yet', open: 'Open', overdue: 'Overdue', done: 'Done' };

const OPENS = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The one wording of a booking's state, in pieces for the screen chip; the print lists join the same pieces. */
export function bookingParts(b: DayBooking): { status: string; owner: string | null; note: string | null } {
  const status = b.status === 'not-open' && b.opensOn ? `Opens ${OPENS.format(new Date(`${b.opensOn}T00:00:00Z`))}` : STATUS_LABEL[b.status];
  return { status, owner: b.owner, note: b.owner && b.status !== 'done' ? 'booking' : null };
}

/** 'Open · Alex booking', 'Done · Alex', 'Opens 8 Nov', 'Overdue'. */
export function bookingText(b: DayBooking): string {
  const { status, owner, note } = bookingParts(b);
  return owner ? `${status} · ${owner}${note ? ` ${note}` : ''}` : status;
}
