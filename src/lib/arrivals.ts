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

export function arrivalFlags(travellers: Travellers, rawStart: string | null, days: number): ArrivalFlag[] {
  const start = goodDate(rawStart) ? rawStart : null;
  const last = start ? fmt(utc(start) + (days - 1) * 1440 * MIN).slice(0, 10) : null;
  return people(travellers).flatMap((t): ArrivalFlag[] => {
    const { name } = t;
    const a = goodTime(t.arriveLocal) ? t.arriveLocal : null, d = goodTime(t.departLocal) ? t.departLocal : null;
    if (!a || !d) return [{ name, kind: 'missing', text: `${name} has not entered ${a ? 'a departure' : d ? 'an arrival' : 'flights'}` }];
    const flags: ArrivalFlag[] = [];
    if (start && dateOf(a) > start) flags.push({ name, kind: 'late', text: `${name} lands on ${dateOf(a)}, after day 1 (${start})` });
    if (last && dateOf(d) < last) flags.push({ name, kind: 'early', text: `${name} leaves on ${dateOf(d)}, before the last day (${last})` });
    return flags;
  });
}

export function lastArrival(travellers: Travellers): string | null {
  const all = people(travellers).flatMap(t => (goodTime(t.arriveLocal) ? [t.arriveLocal] : []));
  return all.length ? all.reduce((x, y) => (y > x ? y : x)) : null;
}

// Day carries no date, so the last day is taken as the date of the latest departure.
export function leaveBy(travellers: Travellers, lastDay: Day): string | null {
  const deps = people(travellers).flatMap(t => (goodTime(t.departLocal) ? [t.departLocal] : []));
  if (!deps.length) return null;
  const date = deps.reduce((x, y) => (dateOf(y) > dateOf(x) ? y : x)).slice(0, 10);
  const first = deps.filter(d => dateOf(d) === date).reduce((x, y) => (y < x ? y : x));
  // A drive with no recorded destination still counts: only a drive known to go elsewhere is left out.
  const drive = lastDay.entries.reduce((s, e) => s + (e.kind === 'drive' && (e.to === undefined || e.to === 'AIR') ? e.hours : 0), 0);
  return fmt(utc(first) - Math.round((CHECKIN + drive) * 60) * MIN);
}
