import './TripView.css';
import { useEffect, useRef, useState } from 'react';
import ItemSheet from '../components/ItemSheet';
import RouteMap from '../components/Map';
import { motion } from '../components/motion';
import Sheet from '../components/Sheet';
import { stayItemId } from '../lib/tripadmin';
import { useApp } from '../state';
import type { Area, GroupResult, Item, Leg } from '../types';
import { bookingText } from './bookingText';
import TripDay, { dateLabel } from './TripDay';
import { useTripModel, type TripModel } from './useTripModel';

const COPY = {
  empty: 'The trip appears here once the route is set.',
  back: 'Back to the trip',
  stayLink: 'Open the stay',
  noStay: 'No stay chosen yet. Suggest one on the Stays tab.',
  unclaimed: 'nobody has claimed it yet',
  replay: 'Replay mission',
};

const DAY_HASH = /^#\/day-(\d+)$/;
/** The day in the hash, or 1 when there is none or it is not one of this trip's days. */
const hashDay = (count: number) => {
  const n = Number(DAY_HASH.exec(window.location.hash)?.[1]);
  return n >= 1 && n <= count ? n : 1;
};

function StaySheet({ model, day, area, onClose }: { model: TripModel; day: number; area: Area; onClose(): void }) {
  const v = model.views[day - 1];
  const block = model.blocks.find(b => b.area === area && b.fromDay <= day && day <= b.toDay);
  const booking = model.bookings.find(b => b.id === stayItemId(area));
  const link = v.tonight?.link;
  return (
    <Sheet
      title={v.tonight?.title ?? `Stay in ${area}`} closeLabel="Close" onClose={onClose}
      footer={link
        ? <a className="cta" href={link} target="_blank" rel="noopener noreferrer">{COPY.stayLink}</a>
        : <button type="button" className="cta alt" onClick={onClose}>{COPY.back}</button>}
    >
      <p className="tv-stay">{area}</p>
      {block?.checkIn && block.checkOut && <p className="tv-stay">Check in {dateLabel(block.checkIn)}, out {dateLabel(block.checkOut)}</p>}
      <p className="tv-stay">{booking ? (booking.owner ? bookingText(booking) : `${bookingText(booking)}, ${COPY.unclaimed}`) : COPY.noStay}</p>
    </Sheet>
  );
}

/** Props-in Trip view: the map, a strip of day chips, and the one selected day as a postcard. */
export function TripViewBody({ model, items, legs, onReplay }: { model: TripModel; items: Item[]; legs: Leg[]; onReplay?(): void }) {
  const count = model.views.length;
  const [picked, setDay] = useState(() => hashDay(count));
  // A re-solve to fewer days can leave the pick past the end.
  const day = Math.min(picked, Math.max(count, 1));
  const [place, setPlace] = useState<Item | null>(null);
  const [stay, setStay] = useState<Area | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onHash = () => { if (DAY_HASH.test(window.location.hash)) setDay(hashDay(count)); };
    // The model can fill after the first render, when the hash day had no day to point at yet.
    const n = Number(DAY_HASH.exec(window.location.hash)?.[1]);
    if (n >= 1 && n <= count) setDay(n);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [count]);
  useEffect(() => {
    strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: motion() === 'full' ? 'smooth' : 'auto' });
  }, [day]);

  if (!model.plan || count === 0) return <section className="body" aria-label="Trip view"><p className="tv-empty">{COPY.empty}</p></section>;
  const view = model.views[day - 1];
  const pick = (n: number) => {
    setDay(n);
    // Only the day-N part of the hash is ours; a raw or guest hash stays as it is.
    if (window.location.hash === '' || DAY_HASH.test(window.location.hash)) window.history.replaceState(null, '', `#/day-${n}`);
  };
  return (
    <section className="body tv" aria-label="Trip view">
      <div className="tv-map"><RouteMap route={model.plan.route} drive legs={view.legs} parkAt={view.parkAt} dayN={day} /></div>
      <div ref={strip} className="tv-strip" role="group" aria-label="Days">
        {model.views.map(v => (
          <button key={v.n} type="button" className="tv-chip" aria-pressed={v.n === day} onClick={() => pick(v.n)}>
            <b>Day {v.n}</b>{v.date && <small>{dateLabel(v.date)}</small>}
          </button>
        ))}
      </div>
      <div key={day} className={motion() === 'full' ? 'tv-card flip' : 'tv-card'}>
        <TripDay
          view={view} items={items} legs={legs} rainSlack={model.plan.days[day - 1].rainSlack}
          onPlace={id => setPlace(items.find(i => i.id === id) ?? null)} onStay={setStay}
        />
      </div>
      {onReplay && <button type="button" className="cta alt" onClick={onReplay}>{COPY.replay}</button>}
      {place && <ItemSheet items={[place]} title={place.name} onClose={() => setPlace(null)} />}
      {stay && <StaySheet model={model} day={day} area={stay} onClose={() => setStay(null)} />}
    </section>
  );
}

// Not mounted in App yet on purpose: where Trip view lives is review item A11, an open plan change.
export default function TripView({ group, today, onReplay }: { group: GroupResult; today?: string; onReplay?(): void }) {
  const { items, legs } = useApp();
  return <TripViewBody model={useTripModel(group, today)} items={items} legs={legs} onReplay={onReplay} />;
}
