import './TripView.css';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ItemSheet from '../components/ItemSheet';
import RouteMap from '../components/Map';
import { motion } from '../components/motion';
import Sheet from '../components/Sheet';
import { releaseFor } from '../lib/release';
import { stayItemId } from '../lib/tripadmin';
import { useApp } from '../state';
import { AREAS } from '../types';
import type { Area, DayView, GroupResult, Item, Leg } from '../types';
import { bookingText } from './bookingText';
import IdeaSheet, { parseIdea } from './IdeaSheet';
import TripDay, { dateLabel } from './TripDay';
import { useTripModel, type TripModel } from './useTripModel';

const COPY = {
  empty: 'The trip appears here once the route is set.',
  back: 'Back to the trip',
  stayLink: 'Open the stay',
  noStay: 'No stay chosen yet.',
  unclaimed: 'nobody has claimed it yet',
  one: 'One day',
  all: 'All days',
};

const VIEW_KEY = 'tp:route-view';
type View = 'one' | 'all';
const readView = (): View => {
  try { return localStorage.getItem(VIEW_KEY) === 'all' ? 'all' : 'one'; } catch { return 'one'; }
};
// A view preference like mute: with storage blocked the switch still works, it just forgets on reload.
const saveView = (v: View) => {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ }
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

// The body's tests mount it with no provider, and a card with no app behind it simply has no ideas.
function useAppIfAny() {
  try { return useApp(); } catch { return null; }
}

interface BodyProps {
  model: TripModel; items: Item[]; legs: Leg[];
  /** The trip day that is today: the chip starts pressed and the strip and card come before the map. A day in the hash still wins. */
  todayDay?: number;
  /** Shown instead of the plain day card while today's chip is the one pressed. */
  todayCard?: ReactNode;
  onBooking?(id: string): void; onFlights?(): void;
}

/** Props-in Trip view: the map, a strip of day chips, and the selected day as a postcard, or every day one under the other. */
export function TripViewBody({ model, items, legs, todayDay, todayCard, onBooking, onFlights }: BodyProps) {
  const count = model.views.length;
  const onTrip = todayDay !== undefined && todayDay >= 1 && todayDay <= count;
  const [picked, setDay] = useState(() => (DAY_HASH.test(window.location.hash) || !onTrip ? hashDay(count) : todayDay));
  // A re-solve to fewer days can leave the pick past the end.
  const day = Math.min(picked, Math.max(count, 1));
  const [view, setViewState] = useState<View>(readView);
  const [place, setPlace] = useState<Item | null>(null);
  const [stay, setStay] = useState<{ day: number; area: Area } | null>(null);
  const [idea, setIdea] = useState<{ day: number; area: Area } | null>(null);
  const app = useAppIfAny();
  const strip = useRef<HTMLDivElement>(null);
  const all = useRef(view === 'all');
  all.current = view === 'all';
  const setView = (v: View) => { setViewState(v); saveView(v); };
  // All days: the card is already on the page, so picking a day brings it into view.
  const reveal = (n: number) => document.getElementById(`day-${n}`)?.scrollIntoView?.({ block: 'start', behavior: motion() === 'full' ? 'smooth' : 'auto' });
  const pick = (n: number) => {
    setDay(n);
    // Only the day-N part of the hash is ours; a raw or guest hash stays as it is.
    if (window.location.hash === '' || DAY_HASH.test(window.location.hash)) window.history.replaceState(window.history.state, '', `#/day-${n}`);
    if (all.current) reveal(n);
  };

  useEffect(() => {
    const onHash = () => {
      if (!DAY_HASH.test(window.location.hash)) return;
      setDay(hashDay(count));
      if (all.current) reveal(hashDay(count));
    };
    // The model can fill after the first render, when the hash day had no day to point at yet.
    const n = Number(DAY_HASH.exec(window.location.hash)?.[1]);
    if (n >= 1 && n <= count) setDay(n);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [count]);
  // The clamp is kept, not just drawn: a pick past the end becomes the last day and its hash, so a re-solve back to more days does not jump again.
  useEffect(() => {
    if (count > 0 && picked > count) pick(count);
  }, [count, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: motion() === 'full' ? 'smooth' : 'auto' });
  }, [day]);

  if (!model.plan || count === 0) return <section className="body" aria-label="Trip view"><p className="tv-empty">{COPY.empty}</p></section>;
  const plan = model.plan;
  const one = model.views[day - 1];
  const map = <div className="tv-map"><RouteMap route={plan.route} drive legs={one.legs} parkAt={one.parkAt} dayN={day} /></div>;
  const ideasOf = (n: number) => (app?.state.suggestions ?? []).filter(s => s.status === 'pending').flatMap(s => {
    const p = parseIdea(s.note);
    return p.day === n ? [{ id: s.id, name: s.name, title: s.title, text: p.text }] : [];
  });
  const areaOf = (v: DayView) => v.area ?? v.tonight?.area ?? AREAS[0];
  const card = (v: DayView) => (todayCard && v.n === todayDay ? todayCard : (
    <TripDay
      view={v} items={items} legs={legs} visited={plan.chosen} rainSlack={plan.days[v.n - 1].rainSlack}
      onPlace={id => setPlace(items.find(i => i.id === id) ?? null)} onStay={a => setStay({ day: v.n, area: a })} onBooking={onBooking} onFlights={onFlights}
      ideas={ideasOf(v.n)} onIdea={app?.me && releaseFor(app.me) ? () => setIdea({ day: v.n, area: areaOf(v) }) : undefined}
    />
  ));
  const chips = (
    <div ref={strip} className="tv-strip" role="group" aria-label="Days">
      {model.views.map(v => (
        <button key={v.n} type="button" className="tv-chip" aria-pressed={v.n === day} onClick={() => pick(v.n)}>
          <b>Day {v.n}</b>{v.date && <small>{dateLabel(v.date)}</small>}
        </button>
      ))}
    </div>
  );
  return (
    <section className="body tv" aria-label="Trip view">
      <div className="tv-view" role="group" aria-label="View">
        {([['one', COPY.one], ['all', COPY.all]] as const).map(([v, label]) => (
          <button key={v} type="button" className="tv-seg" aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
        ))}
      </div>
      {view === 'all' ? (
        <>
          <div className="tv-map"><RouteMap route={plan.route} /></div>
          {chips}
          {model.views.map(v => <div key={v.n} id={`day-${v.n}`} className="tv-card tv-day">{card(v)}</div>)}
        </>
      ) : (
        <>
          {!onTrip && map}
          {chips}
          <div key={day} className={motion() === 'full' ? 'tv-card flip' : 'tv-card'}>{card(one)}</div>
          {onTrip && map}
        </>
      )}
      {place && <ItemSheet items={[place]} title={place.name} onClose={() => setPlace(null)} />}
      {idea && <IdeaSheet day={idea.day} area={idea.area} onClose={() => setIdea(null)} />}
      {stay && <StaySheet model={model} day={stay.day} area={stay.area} onClose={() => setStay(null)} />}
    </section>
  );
}

// Not mounted in App yet on purpose: where Trip view lives is review item A11, an open plan change.
export default function TripView({ group, today }: { group: GroupResult; today?: string }) {
  const { items, legs } = useApp();
  return <TripViewBody model={useTripModel(group, today)} items={items} legs={legs} />;
}
