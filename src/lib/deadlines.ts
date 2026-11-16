import type { BookingDates, DayBooking, Item, Person, Plan } from '../types';

/** Lead times live on the catalogue source (data/catalogue.json); Item is frozen and does not name them. */
export type LeadRule = { opensDaysBefore?: number; bookByDaysBefore?: number };
type Bookable = Item & LeadRule;

const DAY_MS = 86_400_000;
/** 'YYYY-MM-DD' plus n days, on UTC so the local timezone never shifts the date. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

export interface StatusArgs {
  id: string; label: string; today: string; done: boolean; owner: Person | null;
  /** The day the booking is used; null while the trip has no start date. */
  useDate: string | null; rule: LeadRule; override?: BookingDates;
}

export function bookingStatus(a: StatusArgs): DayBooking {
  const { useDate, rule, override } = a;
  const opensOn = override?.opensOn ?? (useDate && rule.opensDaysBefore ? addDays(useDate, -rule.opensDaysBefore) : null);
  const bookBy = override?.bookBy ?? (useDate && rule.bookByDaysBefore ? addDays(useDate, -rule.bookByDaysBefore) : null);
  const status = a.done ? 'done' : !useDate ? 'undated' : opensOn && a.today < opensOn ? 'not-open' : bookBy && a.today > bookBy ? 'overdue' : 'open';
  return { id: a.id, label: a.label, status, opensOn, bookBy, owner: a.owner };
}

export interface DeadlineInput {
  plan: Plan; start: string | null; today: string; items: Item[];
  stayItems: { id: string; label: string; day: number }[];
  done: Record<string, boolean>; owners: Record<string, Person | null>; overrides: Record<string, BookingDates>;
}

/** Every booking of the trip, filed under the day it is used (a stay under its check-in day). */
export function bookingsByDay(input: DeadlineInput): Record<number, DayBooking[]> {
  const { plan, start, today, done, owners, overrides } = input;
  const byDay: Record<number, DayBooking[]> = {};
  const add = (day: number, id: string, label: string, rule: LeadRule) => {
    const useDate = start ? addDays(start, day - 1) : null;
    (byDay[day] ??= []).push(bookingStatus({ id, label, today, useDate, rule, done: !!done[id], owner: owners[id] ?? null, override: overrides[id] }));
  };
  const bookable = new Map((input.items as Bookable[]).filter(i => i.book).map(i => [i.id, i]));
  const seen = new Set<string>();
  for (const d of plan.days) {
    for (const e of d.entries) {
      const it = e.itemId ? bookable.get(e.itemId) : undefined;
      if (!it || seen.has(it.id)) continue;
      seen.add(it.id);
      add(d.n, `book:${it.id}`, it.name, it);
    }
  }
  for (const s of input.stayItems) add(s.day, s.id, s.label, {});
  return byDay;
}
