import { PEOPLE } from '../types';
import type { AppState, GroupResult, Plan, Player } from '../types';
import type { Award } from './awards';
import { outstanding } from './outstanding';

export type OpenTab = 'Picks' | 'Group' | 'Suggest' | 'Stays' | 'Awards' | 'Quiz' | 'Bingo';
export interface OpenItem {
  id: 'votes' | 'final' | 'rate' | 'approve' | 'stayQuiz' | 'stayAdd' | 'bingo' | 'awards';
  label: string;
  count?: number;
  target: { tab: OpenTab; view?: 'knockouts' };
}
export interface OpenCtx {
  me: Player | null;
  group: GroupResult | null | undefined;
  state: AppState;
  /** Places I have not rated yet. */
  unrated: number;
  /** All five have submitted, so no new rating is possible. */
  ratingsLocked: boolean;
  awardsUnseen: boolean;
}

/** Head to heads are done and my Finalize list is the next step (also the Group tab's finalize stage). */
export const isFinalizing = (g: GroupResult): boolean => g.open && g.knockouts.length === 0 && !!g.final && !g.locked;

/** A late item reopened a decided route: all five saved a Finalize list, one vote is open, and the group still holds the plan. */
export const isReopened = (g: GroupResult, state: Pick<AppState, 'responses'>): boolean => !g.final && !!g.held && PEOPLE.every(p => !!state.responses[p]?.final);

/**
 * The route the group has decided, or null: the locked plan, or the plan held while a late item's vote is open.
 * The one test for "has the route been decided", for the Stays tab, its to-do and Trip admin's group bookings.
 */
export function routePlan(group: GroupResult | null | undefined, state: Pick<AppState, 'responses'>): Plan | null {
  if (!group) return null;
  if (group.locked && group.final) return group.final;
  return isReopened(group, state) ? group.held ?? null : null;
}

/** Awards stay up while a late vote reopens the route: the last locked plan still stands (Brittany 2026-10-17). */
export const awardsOpen = (group: GroupResult | null | undefined, state: Pick<AppState, 'responses'>): boolean => !!group && (group.locked || routePlan(group, state) !== null);

/** The decided and open votes the awards read. While a late vote is open only resolved ones count, so one vote cannot change the winners. */
export const awardForks = (group: GroupResult) => (group.locked ? [...group.results, ...group.knockouts] : [...group.results]);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
// Same idea from several people is one row: the same key as Suggest groups by.
export const ideaKey = (s: { title: string; area: string }) => `${s.title.trim().toLowerCase()}|${s.area}`;

/** Places still to rate: late items are voted head to head, never rated. */
export const toRate = <T extends { id: string; late?: boolean }>(items: T[], rated: string[]): T[] => items.filter(i => !i.late && !rated.includes(i.id));

/** What is waiting on this device's user, in the order it should be tackled. Pure. */
export function openItems({ me, group, state, unrated, ratingsLocked, awardsUnseen }: OpenCtx): OpenItem[] {
  const out: OpenItem[] = [];
  if (me === null) return out;
  if (group?.open) {
    const mine = outstanding(group, state.votes, me).mine;
    if (mine > 0) out.push({ id: 'votes', label: `Vote on ${plural(mine, 'head-to-head', 'head-to-heads')}`, count: mine, target: { tab: 'Group', view: 'knockouts' } });
    if (isFinalizing(group) && !state.responses[me]?.final) out.push({ id: 'final', label: 'Save your final list', count: 1, target: { tab: 'Group' } });
  }
  if (!ratingsLocked && unrated > 0) out.push({ id: 'rate', label: `${plural(unrated, 'new place', 'new places')} to rate`, count: unrated, target: { tab: 'Picks' } });
  if (me === 'Brittany') {
    const ideas = new Set(state.suggestions.filter(s => s.status === 'pending').map(ideaKey)).size;
    if (ideas > 0) out.push({ id: 'approve', label: `${plural(ideas, 'idea', 'ideas')} waiting for approval`, count: ideas, target: { tab: 'Suggest' } });
  }
  if (!state.stays?.crew[me]?.quizDone) out.push({ id: 'stayQuiz', label: 'Do your travel profile (3 minutes)', target: { tab: 'Quiz' } });
  // Once the route is final, finding somewhere to stay is everyone's job until they lock in their stays (zero is allowed).
  if (routePlan(group, state) && !state.stays?.crew[me]?.locked) out.push({ id: 'stayAdd', label: 'Find somewhere to stay', count: 1, target: { tab: 'Stays' } });
  // Ratings are not checked here: the caller only builds this list once the member has submitted, as for stayQuiz.
  // A card with no written square is not a card yet: the to-do clears once something is written.
  if (!state.stays?.crew[me]?.bingo?.some(c => c.squares.some(s => s.text.trim() !== ''))) out.push({ id: 'bingo', label: 'Make your travel bingo card', target: { tab: 'Bingo' } });
  if (awardsOpen(group, state) && awardsUnseen) out.push({ id: 'awards', label: 'See the group awards', target: { tab: 'Awards' } });
  return out;
}

/** Number badges for the tabs that hold an action; a tab with nothing to do has no key. */
export function tabBadges(items: OpenItem[]): Partial<Record<'Picks' | 'Group' | 'Suggest' | 'Stays', number>> {
  const sum = (...ids: OpenItem['id'][]) => items.filter(i => ids.includes(i.id)).reduce((n, i) => n + (i.count ?? 0), 0);
  const all = { Group: sum('votes', 'final'), Picks: sum('rate'), Suggest: sum('approve'), Stays: sum('stayAdd') };
  return Object.fromEntries(Object.entries(all).filter(([, n]) => n > 0));
}

/** Changes whenever an award or its winners change, so a new result is shown again. */
export const awardsKey = (awards: Award[]): string => awards.map(a => `${a.id}:${a.winners.join('+')}`).join('|');
