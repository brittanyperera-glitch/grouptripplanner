import type { AppState, GroupResult, Player } from '../types';
import type { Award } from './awards';
import { outstanding } from './outstanding';

export type OpenTab = 'Picks' | 'Group' | 'Suggest' | 'Awards';
export interface OpenItem {
  id: 'votes' | 'final' | 'rate' | 'approve' | 'awards';
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
  if (group?.locked && awardsUnseen) out.push({ id: 'awards', label: 'See the group awards', target: { tab: 'Awards' } });
  return out;
}

/** Number badges for the tabs that hold an action; a tab with nothing to do has no key. */
export function tabBadges(items: OpenItem[]): Partial<Record<'Picks' | 'Group' | 'Suggest', number>> {
  const sum = (...ids: OpenItem['id'][]) => items.filter(i => ids.includes(i.id)).reduce((n, i) => n + (i.count ?? 0), 0);
  const all = { Group: sum('votes', 'final'), Picks: sum('rate'), Suggest: sum('approve') };
  return Object.fromEntries(Object.entries(all).filter(([, n]) => n > 0));
}

/** Changes whenever an award or its winners change, so a new result is shown again. */
export const awardsKey = (awards: Award[]): string => awards.map(a => `${a.id}:${a.winners.join('+')}`).join('|');
