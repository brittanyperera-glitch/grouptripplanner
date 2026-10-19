import releaseJson from '../content/release.json';
import type { Pace } from '../types';

/** The group's decided list: when set, it is the plan, in place of the head to head votes. Empty items turns it off. */
export interface Release { days: number; pace: Pace; items: string[] }

export const RELEASE: Release | null = releaseJson.items.length ? (releaseJson as Release) : null;
