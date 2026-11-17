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
    ({ id, title, done: d, total, complete: d >= total, status, ...extra });
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

// A game-feel choice, not data: missions done to reach Level 2, 3 and 4.
export const LEVEL_AT = [1, 3, 5] as const;
export const levelOf = (done: number): number => 1 + LEVEL_AT.filter(t => done >= t).length;
/** Missions still to do for the next level, or null at the top. */
export const toNextLevel = (done: number): number | null => { const t = LEVEL_AT.find(x => x > done); return t === undefined ? null : t - done; };

/** One most urgent open mission for this person: a booking deadline, then their scout duty, then their flights. */
export function nextMove(me: Person, i: MissionInput): Move | null {
  const due = i.model.bookings
    .filter(b => bookable(b) && b.bookBy && (b.owner === null || b.owner === me))
    .sort((a, b) => ((a.bookBy ?? '') < (b.bookBy ?? '') ? -1 : 1))[0];
  if (due) return { file: 'supply', id: due.id, deadline: due.bookBy ?? undefined, label: `${due.owner ? 'Book' : 'Claim'} ${due.label}` };
  const dry = stayAreas(i).find(a => a.scout === me && a.duty);
  if (dry) return { file: 'stays', id: dry.area, label: `Find ${dry.what} for ${dry.area}` };
  return i.model.missing.flights.includes(me) ? { file: 'touchdown', label: 'Add your flights' } : null;
}

/** Spy mode lasts only while a mission file is open. */
export const spyActive = (i: MissionInput): boolean => missionFiles(i).some(f => !f.complete);
