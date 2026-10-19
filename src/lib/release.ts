import releaseJson from '../content/release.json';
import { isGuest, type Pace, type Player } from '../types';

/** The group's decided list: when set, it is the plan, in place of the head to head votes. Empty items turns it off. */
export interface Release { days: number; pace: Pace; items: string[] }

// VITE_RELEASE=off builds the app with the vote flow, which the vote-flow browser specs run against (playwright.config.ts).
export const RELEASE: Release | null = releaseJson.items.length && import.meta.env.VITE_RELEASE !== 'off' ? (releaseJson as Release) : null;

/** A guest sandbox runs its own seeded votes, so only the five members get the released plan. */
export const releaseFor = (me: Player | null): Release | null => (isGuest(me) ? null : RELEASE);
