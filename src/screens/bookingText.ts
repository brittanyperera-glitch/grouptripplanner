import { DAY_MONTH } from '../lib/dates';
import type { BookingStatus, DayBooking } from '../types';

export const STATUS_LABEL: Record<BookingStatus, string> = { undated: 'No date yet', 'not-open': 'Not open yet', open: 'Open', overdue: 'Overdue', done: 'Done' };

/** '2026-12-01' as '1 Dec'. */
export const dayMonth = (d: string) => DAY_MONTH.format(new Date(`${d}T00:00:00Z`));

/** The one wording of a booking's state, in pieces for the screen chip; the print lists join the same pieces. */
export function bookingParts(b: DayBooking): { status: string; owner: string | null; note: string | null } {
  const status = b.status === 'not-open' && b.opensOn ? `Opens ${dayMonth(b.opensOn)}` : STATUS_LABEL[b.status];
  return { status, owner: b.owner, note: b.owner && b.status !== 'done' ? 'booking' : null };
}

/** The tag on a Supply runs card: the same words as the print lists, except an open booking says what to do by when. */
export function deadlineTag(b: DayBooking): string {
  return b.status === 'open' ? (b.bookBy ? `Book by ${dayMonth(b.bookBy)}` : bookingParts(b).status) : bookingParts(b).status;
}

/** 'Open · Alex booking', 'Done · Alex', 'Opens 8 Nov', 'Overdue'. */
export function bookingText(b: DayBooking): string {
  const { status, owner, note } = bookingParts(b);
  return owner ? `${status} · ${owner}${note ? ` ${note}` : ''}` : status;
}
