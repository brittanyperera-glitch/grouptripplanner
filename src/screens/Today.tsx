import './Today.css';
import { motion } from '../components/motion';
import TransportLine, { transportOf } from '../components/TransportLine';
import { lastArrival as lastArrivalOf, leaveBy as leaveByOf } from '../lib/arrivals';
import { useApp } from '../state';
import type { GroupResult, Item, Leg } from '../types';
import TripDay, { dateLabel } from './TripDay';
import { useTripModel, type TripModel } from './useTripModel';

export interface TodayProps {
  model: TripModel; items: Item[]; legs: Leg[];
  /** 'HH:MM', worked out per person by the container; null draws no line. */
  leaveBy: string | null;
  /** 'HH:MM' of the last person to land on day 1. */
  lastArrival?: string | null;
  onWholeTrip(n: number): void;
}

/** The trip day that is today, as a postcard: postmark, Britt's line, tonight, the next leg and today's bookings. Nothing outside the trip. */
export default function Today({ model, items, legs, leaveBy, lastArrival = null, onWholeTrip }: TodayProps) {
  const at = model.views.findIndex(v => v.date === model.today);
  if (at < 0) return null;
  const view = model.views[at];
  const last = at === model.views.length - 1;
  const byId = new Map(items.map(i => [i.id, i]));
  const britt = view.entries.map(e => (e.itemId ? byId.get(e.itemId)?.britt : undefined)).find(Boolean);
  // Only later days: today's own drive is already on the card. The last day has none, its drive is the airport run the leave-by line covers.
  const ahead = model.views.slice(at + 1);
  const leg = ahead.flatMap(v => v.entries.map(e => ({ n: v.n, t: transportOf(e, legs) }))).find(x => x.t);
  const [, , d] = view.date!.split('-');
  const tonight = view.tonight;
  const block = tonight && model.blocks.find(b => b.area === tonight.area && b.fromDay <= view.n && view.n <= b.toDay);
  const stay = tonight?.title && (tonight.link ? <a href={tonight.link} target="_blank" rel="noopener noreferrer">{tonight.title}</a> : tonight.title);

  return (
    <section className="td-today" aria-label="Today">
      <div className="tt-card">
        {view.area && <div className="tt-postmark" role="img" aria-label="Postmark"><span>{view.area}</span><span>{`${+d} ${dateLabel(view.date!).split(' ')[2]}`}</span><span>{view.date!.slice(0, 4)}</span></div>}
        <TripDay view={{ ...view, tonight: null }} items={items} legs={legs} />
      </div>
      {britt && <p className="tt-britt"><b>Britt says:</b> {britt}</p>}
      {leg && leg.t && (
        <div role="group" className={`tt-box tt-leg${motion() === 'full' ? ' go' : ''}`} aria-label="Next leg">
          <b>Day {leg.n}</b>
          <TransportLine t={leg.t} />
        </div>
      )}
      {tonight && (
        <div role="group" className="tt-box tt-stay" aria-label="Tonight">
          <b>Tonight</b>
          <span className="tt-title">{stay || `No stay chosen yet in ${tonight.area}`}</span>
          {block && <small>{tonight.checkIn ? 'Check in today' : `Night ${view.n - block.fromDay + 1} of ${block.nights}`}{block.checkOut ? `, out ${dateLabel(block.checkOut)}` : ''}</small>}
        </div>
      )}
      {view.n === 1 && lastArrival && <p className="tt-note">Last arrival: {lastArrival}</p>}
      {last && leaveBy && <p className="tt-box tt-leave">Leave for the airport by {leaveBy}</p>}
      <button type="button" className="tt-whole" onClick={() => onWholeTrip(view.n)}>See the whole trip</button>
    </section>
  );
}

/** Reads the app's own state. Leave-by and last arrival come from arrivals.ts here, the one place to swap when per-person leave-by lands. */
export function TodayScreen({ group, today, onWholeTrip }: { group: GroupResult; today?: string; onWholeTrip(n: number): void }) {
  const { state, items, legs } = useApp();
  const model = useTripModel(group, today);
  const days = model.plan?.days ?? [];
  const travellers = state.travellers ?? {};
  const lastDate = model.views[model.views.length - 1]?.date;
  const leave = days.length ? leaveByOf(travellers, days[days.length - 1]) : null;
  const landed = lastArrivalOf(travellers);
  return (
    <Today
      model={model} items={items} legs={legs} onWholeTrip={onWholeTrip}
      leaveBy={leave && leave.slice(0, 10) === lastDate ? leave.slice(11) : null}
      lastArrival={landed && landed.slice(0, 10) === model.start ? landed.slice(11) : null}
    />
  );
}
