import type { DayEntry, Leg } from '../types';
import { hubName } from './Map';
import { IconCar, IconTrain } from './Icons';
import './TransportLine.css';

export interface Transport { mode: 'Drive' | 'Train'; places: string; time: string; km?: number }

/** "2 h 50", "3 h", "48 min". */
export function hm(hours: number): string {
  const total = Math.round(hours * 60), h = Math.floor(total / 60), m = total % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m}`;
}

/** The measured road distance for a drive, only when a Google Maps leg between the same two hubs has the same time. A train or an unmeasured leg has none. */
function kmFor(e: DayEntry, legs: Leg[]): number | undefined {
  if (e.kind !== 'drive' || !e.from || !e.to) return undefined;
  const leg = legs
    .filter(l => (l.a === e.from && l.b === e.to) || (l.a === e.to && l.b === e.from))
    .sort((x, y) => x.hours - y.hours)[0];
  return leg && Math.abs(leg.hours - e.hours) < 0.02 ? leg.km : undefined;
}

/** The transport line for a drive or train entry, or null for anything else. */
export function transportOf(e: DayEntry, legs: Leg[]): Transport | null {
  if (e.kind === 'train') return { mode: 'Train', places: e.label.replace(/\s+train$/i, ''), time: `about ${hm(e.hours)}` };
  if (e.kind !== 'drive') return null;
  const m = /^Drive from (.+?) to (.+)$/.exec(e.label);
  const places = m ? `${m[1]} to ${m[2]}` : e.from && e.to ? `${hubName(e.from)} to ${e.to === 'AIR' ? 'the airport' : hubName(e.to)}` : e.label;
  return { mode: 'Drive', places, time: hm(e.hours), km: kmFor(e, legs) };
}

export const transportText = (t: Transport) => [t.mode, t.places, t.time, ...(t.km === undefined ? [] : [`${Math.round(t.km)} km`])].join(' · ');

/** One small row: mode icon and "Drive · Sigiriya to Kandy · 2 h 58 · 89 km". */
export default function TransportLine({ t }: { t: Transport }) {
  const Icon = t.mode === 'Train' ? IconTrain : IconCar;
  return (
    <span className="tline" data-mode={t.mode.toLowerCase()}>
      <Icon size={14} />
      <span className="tline-txt">{transportText(t)}</span>
    </span>
  );
}
