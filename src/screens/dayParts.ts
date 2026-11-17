import { IconCar, IconPin, IconSun, IconTrain } from '../components/Icons';
import type { DayEntry } from '../types';

// The words and thresholds of a day card, shared by MyTrip's DayRows and TripDay so the two cannot drift.

// A day with this many driving hours or more gets a "Long driving day" note.
export const LONG_DRIVE_HOURS = 5;
export const MIN_ROUND_TRIP = 0.25;

export const hrs = (h: number) => h.toFixed(1);
export const hrsShort = (h: number) => (Number.isInteger(h) ? String(h) : hrs(h));
export const ICON = { drive: IconCar, train: IconTrain, free: IconSun, activity: IconPin } as const;

export function entryText(e: DayEntry): string {
  if (e.kind === 'activity') return `${e.label}, ${hrsShort(e.onSite ?? e.hours)} h`;
  return e.hours > 0 ? `${e.label}, ${hrsShort(e.hours)} h` : e.label;
}
