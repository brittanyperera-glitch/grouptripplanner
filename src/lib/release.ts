import releaseJson from '../content/release.json';
import { GUEST_RELEASE } from '../guest/sampleRelease';
import { isGuest, type Pace, type Player } from '../types';

/** The group's decided list: when set, it is the plan, in place of the head to head votes. Empty items turns the released plan off.
 *  `ruledOut` are places the group chose against, so a longer trip does not offer them back. */
export interface Release { days: number; pace: Pace; items: string[]; ruledOut: string[] }

// VITE_RELEASE=off builds the app with the vote flow, which the vote-flow browser specs run against (playwright.config.ts).
export const RELEASE: Release | null = releaseJson.items.length && import.meta.env.VITE_RELEASE !== 'off' ? (releaseJson as Release) : null;

// The guest demo's made-up trip: off whenever the vote flow is, so that build still runs the voting flow for a guest.
export const GUEST_SAMPLE: Release | null = import.meta.env.VITE_RELEASE !== 'off' ? GUEST_RELEASE : null;

/** The five members get the group's plan; a guest gets the made-up sample, never the real one. */
export const releaseFor = (me: Player | null): Release | null => (isGuest(me) ? GUEST_SAMPLE : RELEASE);
