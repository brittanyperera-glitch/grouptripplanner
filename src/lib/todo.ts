import type { Person } from '../types';
import { bookable, bookingRank, stayAreas } from './missions';
import type { MissionId, MissionInput } from './missions';
import { isAdmin } from './override';
import { outcome, rankedBy, stayCtx, stayStatus } from './stayflow';
import type { ReleasedTab } from './tabs';

export const SUB_IDS = ['stays', 'bookings', 'flights', 'organiser', 'crew-stats', 'crew-decided', 'complaints'] as const;
export type SubId = (typeof SUB_IDS)[number];
export type Open = { sub: SubId; target?: string } | { overlay: 'quiz' | 'bingo' | 'awards' } | { tab: ReleasedTab };
export interface Task {
  id: string; kind: 'booking' | 'stay' | 'flights' | 'ideas' | 'bingo' | 'awards';
  file?: MissionId; label: string; owed: boolean; deadline?: string; open: Open;
}
interface Extra { bingoMade: boolean; awardsUnseen: boolean; ideasPending: number }

/** My stays step: empty while I am locked and waiting on others, and when every area is decided. */
function staysTasks(me: Person, i: MissionInput): Task[] {
  if (!i.plan || stayAreas(i).every(a => a.decided)) return [];
  const ctx = stayCtx(i.state, me, i.plan);
  const st = stayStatus(ctx);
  const stay = (id: string, label: string, open: Open): Task => ({ id: `stay:${id}`, kind: 'stay', file: 'stays', label, owed: true, open });
  if (!st.quizDone) return [stay('quiz', 'Do your travel profile', { overlay: 'quiz' })];
  if (!st.locked) return [stay(st.current, st.mine.length > 0 ? `Lock in my stays (${st.mine.length})` : 'Add a stay', { sub: 'stays' })];
  if (!st.open) return [];
  if (!st.ranked) return [stay('rank', 'Pick your top 2', { sub: 'stays', target: st.rankAreas.find(a => !rankedBy(ctx, me, a)) })];
  return ctx.areas.flatMap(area => {
    const o = outcome(ctx, area);
    return o.kind === 'vote' && !o.a.includes(me) && !o.b.includes(me) ? [stay(`vote:${area}`, `Head to head: ${area}`, { sub: 'stays', target: area })] : [];
  });
}

/** One person's tasks, owed ones first in the order bookings, stays step, scout duty, flights, ideas; then the fun ones, never owed. */
export function tasksFor(me: Person, i: MissionInput, extra: Extra): Task[] {
  const mine = i.model.bookings.filter(b => bookable(b) && b.owner === me);
  const free = i.model.bookings.filter(b => bookable(b) && b.owner === null).sort((a, b) => (bookingRank(a, me) < bookingRank(b, me) ? -1 : 1))[0];
  const bookings = [...mine, ...(free ? [free] : [])].sort((a, b) => (bookingRank(a, me) < bookingRank(b, me) ? -1 : 1)).map((b): Task => ({
    id: `booking:${b.id}`, kind: 'booking', file: 'supply', label: `${b.owner ? 'Book' : 'Claim'} ${b.label}`, owed: true,
    ...(b.bookBy ? { deadline: b.bookBy } : {}), open: { sub: 'bookings', target: b.id },
  }));
  const scout = stayAreas(i).filter(a => a.scout === me && a.duty).map((a): Task => ({
    id: `scout:${a.area}`, kind: 'stay', file: 'stays', label: `Find ${a.what} for ${a.area}`, owed: true, open: { sub: 'stays', target: a.area },
  }));
  const flights: Task[] = i.model.missing.flights.includes(me)
    ? [{ id: 'flights', kind: 'flights', file: 'touchdown', label: 'Add your flights', owed: true, open: { sub: 'flights' } }] : [];
  const ideas: Task[] = isAdmin(me) && extra.ideasPending > 0
    ? [{ id: 'ideas', kind: 'ideas', label: `Ideas waiting (${extra.ideasPending})`, owed: true, open: { sub: 'organiser', target: 'ideas' } }] : [];
  const fun: Task[] = [
    ...(extra.bingoMade ? [] : [{ id: 'bingo', kind: 'bingo' as const, label: 'Make your travel bingo card', owed: false, open: { overlay: 'bingo' as const } }]),
    ...(extra.awardsUnseen ? [{ id: 'awards', kind: 'awards' as const, label: 'See the group awards', owed: false, open: { overlay: 'awards' as const } }] : []),
  ];
  return [...bookings, ...staysTasks(me, i), ...scout, ...flights, ...ideas, ...fun];
}

export const nextTask = (t: Task[]): Task | null => t.find(x => x.owed) ?? null;
export const owedCount = (t: Task[]): number => t.filter(x => x.owed).length;
/** The card line for one mission file: the first thing I owe in it. */
export const youLine = (file: MissionId, t: Task[]): string => {
  const x = t.find(y => y.owed && y.file === file);
  return x ? `You: ${x.label}` : 'You: nothing to do';
};
