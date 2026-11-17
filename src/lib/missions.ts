import type { TripModel } from '../screens/useTripModel';
import { PEOPLE } from '../types';
import type { AppState, Person, Plan } from '../types';
import { DAY_MONTH } from './dates';
import { outcome, scoutOf, stayCtx } from './stayflow';
import { voteOpen } from './stays';

export type MissionId = 'stays' | 'supply' | 'touchdown';
/** What the HQ needs: the app state and locked plan for the stays, and the trip model for bookings and flights. */
export interface MissionInput { state: AppState; plan: Plan | null; model: Pick<TripModel, 'bookings' | 'missing'> }

export interface MissionFileInfo {
  id: MissionId; title: string; done: number; total: number; complete: boolean; status: string;
  tag?: { text: string; tone: 'warn' | 'dim' };
  unclaimed?: number;
  missing?: Person[];
}
export interface Move {
  file: MissionId; label: string;
  /** The booking id, or the area for a scout duty. */
  id?: string;
  /** 'YYYY-MM-DD', for a booking with a book-by date. */
  deadline?: string;
}

const names = (l: string[]) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`);
// A booking that has not opened (or has no date) cannot be booked yet, so it is nobody's move and carries no deadline.
const bookable = (b: { status: string }) => b.status === 'open' || b.status === 'overdue';

/** Every area that needs a stay, with who scouts it and where its decision stands. */
function stayAreas({ state, plan }: MissionInput) {
  const ctx = stayCtx(state, PEOPLE[0], plan);
  const open = voteOpen(ctx.crewOf, ctx.participants);
  return ctx.areas.map(area => {
    const o = outcome(ctx, area);
    // A lone stay is 'decided' the moment it is suggested, but until voting opens people are still adding and locking.
    const decided = o.kind === 'decided' && (o.via === 'pin' || open);
    // Any kind that is neither decided nor in the group's hands (wait, vote) is the scout's to fix, so a kind added later defaults to duty.
    const duty = !decided && o.kind !== 'wait' && o.kind !== 'vote';
    const what = o.kind === 'empty' ? 'a stay' : o.kind === 'replacing' ? 'a replacement stay' : 'a 2nd stay';
    return { area, decided, duty, what, scout: scoutOf(ctx, area) };
  });
}

export function missionFiles(i: MissionInput): MissionFileInfo[] {
  const areas = stayAreas(i);
  const { bookings, missing } = i.model;
  const decided = areas.filter(a => a.decided).length;
  const todo = bookings.filter(b => b.status !== 'done');
  const toBook = todo.filter(bookable);
  const done = bookings.length - todo.length;
  const unclaimed = todo.filter(b => b.owner === null).length;
  const due = toBook.flatMap(b => (b.bookBy ? [b.bookBy] : [])).sort()[0];
  const landed = PEOPLE.length - missing.flights.length;
  const file = (id: MissionId, title: string, d: number, total: number, status: string, extra: Partial<MissionFileInfo> = {}): MissionFileInfo =>
    ({ id, title, done: d, total, complete: total > 0 && d >= total, status, ...extra });
  return [
    file('stays', 'Stays', decided, areas.length, `${decided} of ${areas.length} decided`),
    file('supply', 'Supply runs', done, bookings.length, `${done} of ${bookings.length} secured${unclaimed ? ` · ${unclaimed} unclaimed` : ''}`,
      { unclaimed, ...(due ? { tag: { text: `Book by ${DAY_MONTH.format(new Date(`${due}T00:00:00Z`))}`, tone: 'warn' as const } } : {}) }),
    file('touchdown', 'Touchdown', landed, PEOPLE.length, missing.flights.length ? `${names(missing.flights)} still dark` : 'Everyone is down',
      { missing: missing.flights, tag: { text: `${landed} of ${PEOPLE.length} in`, tone: 'dim' } }),
  ];
}

/** Each person's own missions: their flights, the areas they scout, the bookings they own. Unclaimed bookings are nobody's yet. */
export function crewReadiness(i: MissionInput): { people: { name: Person; done: number; total: number }[]; percent: number } {
  const areas = stayAreas(i);
  const people = PEOPLE.map(name => {
    const scouted = areas.filter(a => a.scout === name);
    const owned = i.model.bookings.filter(b => b.owner === name);
    const flights = i.model.missing.flights.includes(name) ? 0 : 1;
    return { name, done: flights + scouted.filter(a => !a.duty).length + owned.filter(b => b.status === 'done').length, total: 1 + scouted.length + owned.length };
  });
  const sum = (k: 'done' | 'total') => people.reduce((n, p) => n + p[k], 0);
  return { people, percent: Math.round((100 * sum('done')) / sum('total')) };
}

// A game-feel choice, not data: the share of a person's own tasks done (in percent) that reaches Level 2, 3 and 4.
export const LEVEL_AT = [34, 67, 100] as const;
export const levelOf = (done: number, total: number): number => (total > 0 ? 1 + LEVEL_AT.filter(p => done * 100 >= p * total).length : 1);
/** Tasks still to do for the next level, or null at the top (or with no tasks). Always within the person's own total. */
export const toNextLevel = (done: number, total: number): number | null => {
  const p = total > 0 ? LEVEL_AT.find(x => done * 100 < x * total) : undefined;
  return p === undefined ? null : Math.ceil((p * total) / 100) - done;
};

/** Dated bookings by deadline, then undated ones (the train first), then the rest; mine before unclaimed at equal rank. */
const rank = (b: { bookBy: string | null; id: string; owner: Person | null }, me: Person) =>
  `${b.bookBy ? `0${b.bookBy}` : `1${b.id === 'book:train' ? 0 : 1}`}${b.owner === me ? 0 : 1}`;

/** One most urgent open task for this person: a booking, then their scout duty, then their flights. */
export function nextMove(me: Person, i: MissionInput): Move | null {
  const due = i.model.bookings
    .filter(b => bookable(b) && (b.owner === null || b.owner === me))
    .sort((a, b) => (rank(a, me) < rank(b, me) ? -1 : 1))[0];
  if (due) return { file: 'supply', id: due.id, ...(due.bookBy ? { deadline: due.bookBy } : {}), label: `${due.owner ? 'Book' : 'Claim'} ${due.label}` };
  const dry = stayAreas(i).find(a => a.scout === me && a.duty);
  if (dry) return { file: 'stays', id: dry.area, label: `Find ${dry.what} for ${dry.area}` };
  return i.model.missing.flights.includes(me) ? { file: 'touchdown', label: 'Add your flights' } : null;
}

/** Spy mode lasts only while a mission file with work in it is open; an empty file would otherwise hold it on forever. */
export const spyActive = (i: MissionInput): boolean => missionFiles(i).some(f => f.total > 0 && !f.complete);
