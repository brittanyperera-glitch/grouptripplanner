import { MAX_NIGHTS, MIN_NIGHTS } from '../types';
import type { Area, CrewStays, PlaceSuggestion, Player, StayPin } from '../types';
import { livePin } from './stays';

/** Admin is a UI gate only (one shared password), so these helpers decide what is shown, not who may write. */
export const isAdmin = (me: Player | null | undefined): boolean => me === 'Brittany';

/** The pinned stay for an area, or null when unpinned or the pinned suggestion is no longer live. */
export const pinnedId = (pins: StayPin[], area: Area, suggestions: PlaceSuggestion[]): string | null => {
  const f = livePin(area, pins, suggestions, null);
  return f.pinned ? f.id : null;
};

/** The full pin list to store (saveStaysAdmin replaces pins whole): the area's old pins are dropped and one new one is kept. */
export function withPin(pins: StayPin[], area: Area, suggestionId: string | null, at: string): StayPin[] {
  const rest = pins.filter(p => p.area !== area);
  return suggestionId === null ? rest : [...rest, { area, suggestionId, at }];
}

/** Who has locked in, so Brittany can reopen their list. Stays are only editable while unlocked. */
export const unlockable = (me: Player | null | undefined, crewOf: Partial<Record<Player, CrewStays>>, participants: Player[]): Player[] =>
  isAdmin(me) ? participants.filter(p => crewOf[p]?.locked === true) : [];

/**
 * Close ranking: Brittany may stop waiting on missing rankings once 3+ stays are still waiting.
 * `closed` is the stored StaysAdmin.closed list.
 */
export function canCloseRanking(me: Player | null | undefined, distinctStays: number, ranked: number, participants: number, closed: Area[], area: Area): boolean {
  return isAdmin(me) && distinctStays >= 3 && ranked < participants && !closed.includes(area);
}

/** The full nights map to store (saveStaysAdmin replaces it whole): n is clamped to 1..14, and a value equal to the itinerary's count drops the override. */
export function withNights(nights: Partial<Record<Area, number>>, area: Area, n: number, derived: number | undefined): Partial<Record<Area, number>> {
  const v = Math.min(MAX_NIGHTS, Math.max(MIN_NIGHTS, Math.round(Number.isFinite(n) ? n : MIN_NIGHTS)));
  const { [area]: _old, ...rest } = nights;
  void _old;
  return v === derived ? rest : { ...rest, [area]: v };
}
