import './Itinerary.css';
import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import RouteMap, { hubName } from '../components/Map';
import { dayView } from '../lib/dayView';
import { chosenStays, type ChosenStay } from '../lib/chosenStays';
import { STAY_COPY } from '../lib/stayflow';
import { useApp } from '../state';
import type { GroupResult, Item, Leg, Plan, StayType } from '../types';
import { bookOf, tipsOf } from './BookCard';
import { bookingText } from './bookingText';
import TripDay, { dateLabel, flightText } from './TripDay';
import { useTripModel, type TripModel } from './useTripModel';

const TYPE_NAME: Record<StayType, string> = { hostel: 'Hostel', guesthouse: 'Guesthouse', boutique: 'Boutique stay', hotel: 'Hotel', villa: 'Villa', other: 'Stay' };

const dayLabel = (n: number | null) => (n === null ? '' : `Day ${n}`);

/**
 * The print-only document. It reads the same plan and the same transport and fact helpers as the screen,
 * so the saved file cannot say something the app does not.
 */
export function Itinerary({ plan, items, legs, heading, stays = [], provisional = false, model }: {
  plan: Plan; items: Item[]; legs: Leg[]; heading: string; stays?: ChosenStay[]; provisional?: boolean;
  /** Dates, nights, bookings and flights; without it the days print undated and the Bookings list has no status. */
  model?: TripModel;
}) {
  const chosen = items.filter(i => plan.chosen.includes(i.id));
  const book = bookOf(plan, chosen);
  const tips = tipsOf(plan, chosen);
  const m = model?.plan === plan ? model : undefined;
  const views = m?.views ?? plan.days.map((_, i) => dayView({ plan, start: null, blocks: [], stays: {}, bookingsByDay: {}, travellers: {}, custom: [], paceHours: 0 }, i + 1));
  const howTo = new Map(book.map(({ item }) => [`book:${item.id}`, item.book]));
  // With a model the list is the model's, in day order, stays included, and the how-to text lives only here. Without one
  // the days list no bookings, so each activity keeps its own how-to text and this list is just names and days.
  const rows = m
    ? Object.entries(m.bookingsByDay).flatMap(([day, list]) => list.map(b => ({ id: b.id, name: b.label, day: Number(day), text: bookingText(b), how: howTo.get(b.id) })))
    : book.map(({ item, day }) => ({ id: item.id, name: item.name, day, text: null, how: undefined }));
  const flights = views.flatMap(v => v.flights);
  const blocks = m?.blocks ?? [];
  // A night block per row when the calendar works; else the chosen stays alone.
  const sleep = blocks.length > 0
    ? blocks.map(b => ({ key: `${b.fromDay}`, area: b.area, nights: b.nights, dates: b.checkIn && b.checkOut ? `${dateLabel(b.checkIn)} to ${dateLabel(b.checkOut)}, ` : '', stay: m?.staysByArea[b.area] }))
    : stays.map(s => ({ key: s.area, area: s.area, nights: s.nights, dates: '', stay: s }));
  return (
    <div className="it-print" data-testid="itinerary">
      <header className="it-top">
        <div className="it-titles">
          <h1 className="it-title">Sri Lanka itinerary</h1>
          <p className="it-kind">{heading}</p>
          <p className="it-meta">{plan.days.length} days, about {plan.travelHours.toFixed(1)} h driving</p>
          <p className="it-meta">Route: {plan.route.map(hubName).join(', ')}</p>
          {provisional && <p className="it-meta">Provisional: the group has not locked this plan yet.</p>}
        </div>
        <div className="it-map"><RouteMap route={plan.route} /></div>
      </header>

      {views.map(v => <TripDay key={v.n} view={v} items={items} legs={legs} rainSlack={plan.days[v.n - 1].rainSlack} compact />)}

      {(rows.length > 0 || flights.length > 0) && (
        <section className="it-block" aria-label="Bookings">
          <h2 className="it-dayhead">Bookings</h2>
          <ul className="it-list">
            {rows.map(r => (
              <li key={r.id} className="it-act">
                <span className="it-name">{r.name}</span>{' '}<span className="it-dur">{dayLabel(r.day)}</span>
                {r.text && <span className="it-sub">{r.text}</span>}
                {r.how && <span className="it-sub">{r.how}</span>}
              </li>
            ))}
          </ul>
          {flights.length > 0 && (
            <>
              <h3 className="it-subhead">Flights</h3>
              <ul className="it-list" aria-label="Flights">{flights.map(f => <li key={`${f.name}${f.kind}`} className="it-act">{flightText(f)}</li>)}</ul>
            </>
          )}
        </section>
      )}

      {tips.length > 0 && (
        <section className="it-block" aria-label="Heads up">
          <h2 className="it-dayhead">Heads up</h2>
          <ul className="it-list">
            {tips.map(({ item, day }) => <li key={item.id} className="it-act"><span className="it-name">{item.name}</span>{' '}<span className="it-dur">{dayLabel(day)}</span><span className="it-sub">{item.warn}</span></li>)}
          </ul>
        </section>
      )}

      {sleep.length > 0 && (
        <section className="it-block" aria-label="Where you sleep">
          <h2 className="it-dayhead">Where you sleep</h2>
          <ul className="it-list" aria-label="Nights">
            {sleep.map(({ key, area, nights, dates, stay: s }) => (
              <li key={key} className="it-act">
                <span className="it-name">{area}: {s?.title ?? 'No stay chosen yet'}</span>{' '}
                <span className="it-dur">{dates}{nights} {nights === 1 ? 'night' : 'nights'}</span>
                {s?.itineraryNights !== undefined && <span className="it-sub">{STAY_COPY.nightsNote(s.itineraryNights)}</span>}
                {s && (s.stayType || s.priceGbp !== undefined) && (
                  <span className="it-sub">{[s.stayType && TYPE_NAME[s.stayType], s.priceGbp !== undefined && `about £${s.priceGbp} a night`].filter(Boolean).join(', ')}</span>
                )}
                {s?.link && <span className="it-sub it-url">{s.link}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The model is built only once someone asks to print, so the app holds no second copy of the plan until then. */
function ModelItinerary({ group, ...rest }: { group: GroupResult } & Omit<Parameters<typeof Itinerary>[0], 'model'>) {
  return <Itinerary {...rest} model={useTripModel(group)} />;
}

/**
 * The button. The document mounts on the first tap and stays, hidden on screen, so the app carries no second copy
 * of the plan until someone asks for one. The tab title becomes the default file name for the save dialog.
 */
export function SaveItinerary({ plan, kind, provisional = false, group }: { plan: Plan; kind: 'Group' | 'My'; provisional?: boolean; group?: GroupResult }) {
  const { state, items, legs, me } = useApp();
  const [printing, setPrinting] = useState(false);
  const heading = `${kind} itinerary`;
  const save = () => {
    flushSync(() => setPrinting(true));
    const was = document.title;
    document.title = `Sri Lanka ${heading.toLowerCase()}`;
    window.addEventListener('afterprint', () => { document.title = was; }, { once: true });
    window.print();
  };
  return (
    <>
      <button type="button" className="it-save" onClick={save}>Save itinerary as PDF</button>
      {printing && createPortal(
        group
          ? <ModelItinerary group={group} plan={plan} items={items} legs={legs} heading={heading} provisional={provisional} stays={chosenStays(state, me, plan)} />
          : <Itinerary plan={plan} items={items} legs={legs} heading={heading} provisional={provisional} stays={chosenStays(state, me, plan)} />,
        document.body,
      )}
    </>
  );
}
