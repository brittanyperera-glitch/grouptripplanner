import type { Day, Person, Traveller } from '../types';
import { CHECKIN } from './planner';

type Travellers = Partial<Record<Person, Traveller>>;
export interface ArrivalFlag { name: Person; kind: 'late' | 'early' | 'missing'; text: string }

const MIN = 60_000;
const utc = (t: string) => Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10), +t.slice(11, 13) || 0, +t.slice(14, 16) || 0);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const dateOf = (t: string) => t.slice(0, 10);
// A stored value that is not a date or a time is unset: it must never reach Date.UTC, which would throw on the way out.
const goodDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);
const goodTime = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);
const people = (t: Travellers) => Object.values(t).filter((x): x is Traveller => !!x);

// With the last day, a traveller whose leave-by falls before that day starts is flagged too (03:15 flights). No planner day-start constant exists to test against sooner.
export function arrivalFlags(travellers: Travellers, rawStart: string | null, days: number | null, lastDay?: Day): ArrivalFlag[] {
  const start = goodDate(rawStart) ? rawStart : null;
  const last = start && days !== null ? fmt(utc(start) + (days - 1) * 1440 * MIN).slice(0, 10) : null;
  return people(travellers).flatMap((t): ArrivalFlag[] => {
    const { name } = t;
    const a = goodTime(t.arriveLocal) ? t.arriveLocal : null, d = goodTime(t.departLocal) ? t.departLocal : null;
    if (!a || !d) return [{ name, kind: 'missing', text: `${name} has not entered ${a ? 'a departure' : d ? 'an arrival' : 'flights'}` }];
    const flags: ArrivalFlag[] = [];
    if (start && dateOf(a) > start) flags.push({ name, kind: 'late', text: `${name} lands on ${dateOf(a)}, after day 1 (${start})` });
    if (last && dateOf(d) < last) flags.push({ name, kind: 'early', text: `${name} leaves on ${dateOf(d)}, before the last day (${last})` });
    else if (last && lastDay && leaveFor(d, lastDay) < last) flags.push({ name, kind: 'early', text: `${name} must leave by ${leaveFor(d, lastDay)}, before the last day (${last}) starts` });
    return flags;
  });
}

export function lastArrival(travellers: Travellers): string | null {
  const all = people(travellers).flatMap(t => (goodTime(t.arriveLocal) ? [t.arriveLocal] : []));
  return all.length ? all.reduce((x, y) => (y > x ? y : x)) : null;
}

const airportDrive = (lastDay?: Day) =>
  // A drive with no recorded destination still counts: only a drive known to go elsewhere is left out.
  lastDay?.entries.reduce((s, e) => s + (e.kind === 'drive' && (e.to === undefined || e.to === 'AIR') ? e.hours : 0), 0) ?? 0;
const leaveFor = (depart: string, lastDay?: Day) => fmt(utc(depart) - Math.round((CHECKIN + airportDrive(lastDay)) * 60) * MIN);

/** Each traveller's own latest time to set off: their departure minus check-in minus the last day's drive to the airport. */
export function leaveByEach(travellers: Travellers, lastDay: Day): Partial<Record<Person, string>> {
  return Object.fromEntries(people(travellers).filter(t => goodTime(t.departLocal)).map(t => [t.name, leaveFor(t.departLocal as string, lastDay)]));
}

// The group's single leave-by: the earliest flight on the latest departure date. Day carries no date, so that date is the last day.
export function leaveBy(travellers: Travellers, lastDay: Day): string | null {
  const deps = people(travellers).flatMap(t => (goodTime(t.departLocal) ? [t.departLocal] : []));
  if (!deps.length) return null;
  const date = deps.reduce((x, y) => (dateOf(y) > dateOf(x) ? y : x)).slice(0, 10);
  return leaveFor(deps.filter(d => dateOf(d) === date).reduce((x, y) => (y < x ? y : x)), lastDay);
}
