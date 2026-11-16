import { PEOPLE } from '../types';
import type { Area, DayBooking, DayEdit, DayView, NightBlock, Person, Plan, Traveller } from '../types';
import { dateOf, nightHub } from './calendar';

export interface DayViewInput {
  plan: Plan; start: string | null; blocks: NightBlock[];
  stays: Partial<Record<Area, { id: string; title: string; link: string | null }>>;
  bookingsByDay: Record<number, DayBooking[]>;
  travellers: Partial<Record<Person, Traveller>>;
  custom: DayEdit[]; paceHours: number;
}

const isLeg = (kind: string) => kind === 'drive' || kind === 'train';

/** Everything one day shows, composed from inputs only so Trip view, Today and print cannot disagree. */
export function dayView(input: DayViewInput, n: number): DayView {
  const { plan, start, blocks, stays, bookingsByDay, travellers, paceHours } = input;
  const day = plan.days[n - 1];
  if (!day) throw new RangeError(`dayView: the plan has no day ${n}`);
  const date = dateOf(n, start);

  // Leg k is the k-th drive or train entry across the plan: the same hub pair repeats, so it is never matched by hubs.
  const before = plan.days.slice(0, n - 1).reduce((s, d) => s + d.entries.filter(e => isLeg(e.kind)).length, 0);
  const legs = day.entries.filter(e => isLeg(e.kind)).map((_, j) => before + j);

  const custom = input.custom.filter(e => e.kind === 'custom' && e.day === n);
  const customHours = custom.reduce((s, e) => s + (e.hours ?? 0), 0);
  // The plan's own spare is clamped at 0 and respects the half-length last day; once a stop is added, only the pace can say what is left.
  const spare = custom.length ? paceHours - day.entries.reduce((s, e) => s + e.hours, 0) - customHours : day.spare;

  const block = blocks.find(b => b.fromDay <= n && n <= b.toDay);
  const stay = block ? stays[block.area] : undefined;
  const flights = PEOPLE.flatMap(name => {
    const t = travellers[name];
    if (!t || !date) return [];
    return [
      ...(t.arriveLocal?.slice(0, 10) === date ? [{ name, kind: 'arrive' as const, time: t.arriveLocal, flight: t.arriveFlight }] : []),
      ...(t.departLocal?.slice(0, 10) === date ? [{ name, kind: 'depart' as const, time: t.departLocal, flight: t.departFlight }] : []),
    ];
  }).sort((a, b) => a.time.localeCompare(b.time));

  return {
    n, date, area: day.area, entries: day.entries, spare, overBudget: spare < 0, legs,
    parkAt: (n > 1 ? nightHub(plan, n - 1) : null) ?? plan.route[0],
    tonight: block ? { area: block.area, stayId: stay?.id ?? null, title: stay?.title ?? null, link: stay?.link ?? null, checkIn: n === block.fromDay } : null,
    bookings: bookingsByDay[n] ?? [], flights, custom,
  };
}
