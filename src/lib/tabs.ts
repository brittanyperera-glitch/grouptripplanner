import { NAMES } from './names';
import { SUB_IDS } from './todo';
import type { SubId } from './todo';

export type ReleasedTab = 'Route' | 'To do' | 'Guide' | 'Me';

/** To do is dropped only on the trip once nobody owes anything. crewOwes null means the plan has not loaded: show all four. */
export function releasedTabs({ tripStarted, crewOwes }: { tripStarted: boolean; crewOwes: boolean | null }): ReleasedTab[] {
  const all: ReleasedTab[] = [NAMES.route, NAMES.todo, NAMES.guide, NAMES.me];
  return tripStarted && crewOwes === false ? all.filter(t => t !== NAMES.todo) : all;
}

// The tab ids a stored tab could hold before the four-tab bar; the new ids map to themselves.
const OLD_TAB: Record<string, ReleasedTab> = {
  'My trip': 'Route', Picks: 'Route', Suggest: 'Route', Stays: 'To do', Group: 'Me', Profile: 'Me', Guide: 'Guide',
  Route: 'Route', 'To do': 'To do', Me: 'Me',
};

export function normaliseTab(raw: string, tabs: ReleasedTab[]): ReleasedTab {
  const t = OLD_TAB[raw];
  return t && tabs.includes(t) ? t : 'Route';
}

export function normaliseSub(raw: string): SubId | null {
  if (raw === 'command') return 'organiser';
  return (SUB_IDS as readonly string[]).includes(raw) ? (raw as SubId) : null;
}
