import type { PrefStance } from '../types';

// The quiz packs extra answers into PrefAnswer.picks. Stored as written, so these formats must not change:
//   stretch:<same|plus20|plus50|anything>   budget card, second question
//   nights:<stayTypeKey>:<n>                stayType card; absent means any
const STRETCH_PREFIX = 'stretch:';
const NIGHTS_PREFIX = 'nights:';
type Picks = Record<string, PrefStance>;

export const stretchKey = (level: string) => `${STRETCH_PREFIX}${level}`;
export const isStretchKey = (k: string) => k.startsWith(STRETCH_PREFIX);
export const stretchLevel = (k: string): string | undefined => (isStretchKey(k) ? k.slice(STRETCH_PREFIX.length) : undefined);

export const nightsKey = (type: string, n: number) => `${NIGHTS_PREFIX}${type}:${n}`;
export const parseNights = (k: string): { type: string; n: number } | null => {
  const m = /^nights:([a-z]+):(\d+)$/.exec(k);
  return m ? { type: m[1], n: Number(m[2]) } : null;
};

/** Not an option key: option readers skip these, the dedicated readers above parse them. */
export const isExtraKey = (k: string) => k.includes(':');

export const nightsOf = (picks: Picks, type: string): number | undefined => {
  const k = Object.keys(picks).find(x => x.startsWith(`${NIGHTS_PREFIX}${type}:`));
  return k ? Number(k.split(':')[2]) : undefined;
};
export const withoutNights = (picks: Picks, type: string): Picks =>
  Object.fromEntries(Object.entries(picks).filter(([k]) => !k.startsWith(`${NIGHTS_PREFIX}${type}:`)));
