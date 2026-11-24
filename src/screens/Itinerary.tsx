import './Itinerary.css';
import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import RouteMap, { hubName } from '../components/Map';
import { dayView } from '../lib/dayView';
import { chosenStays, type ChosenStay } from '../lib/chosenStays';
import { STAY_COPY } from '../lib/stayflow';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Leg, Plan, StayType } from '../types';
import { bookOf, tipsOf } from './BookCard';
import { bookingText } from './bookingText';
import TripDay, { dateLabel, dayCover, flightText } from './TripDay';
import { useTripModel, type TripModel } from './useTripModel';

const TYPE_NAME: Record<StayType, string> = { hostel: 'Hostel', guesthouse: 'Guesthouse', boutique: 'Boutique stay', hotel: 'Hotel', villa: 'Villa', other: 'Stay' };

const dayLabel = (n: number | null) => (n === null ? '' : `Day ${n}`);
const photoSrc = (i: Item | undefined) => (i?.photo ? `/img/${i.photo}.jpg` : null);
/** A picture that fails to load leaves a blank band in the file, so it goes. */
const dropBroken = (e: { currentTarget: HTMLImageElement }) => { e.currentTarget.hidden = true; };

/**
 * The print-only document. It reads the same plan and the same transport and fact helpers as the screen,
 * so the saved file cannot say something the app does not.
 */
export function Itinerary({ plan, items, legs, heading, stays = [], provisional = false, travellers = [], model }: {
  plan: Plan; items: Item[]; legs: Leg[]; heading: string; stays?: ChosenStay[]; provisional?: boolean;
  /** Named on the cover: the five for the group's, the person for theirs. */
  travellers?: readonly string[];
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
    ? [
        ...Object.entries(m.bookingsByDay).flatMap(([day, list]) => list.map(b => ({ id: b.id, name: b.label, day: Number(day), text: bookingText(b), how: howTo.get(b.id) }))),
        // A chosen item no day carries has no day line to hold its how-to text, so it keeps a row here.
        ...book.filter(({ item }) => !m.bookings.some(b => b.id === `book:${item.id}`)).map(({ item, day }) => ({ id: item.id, name: item.name, day, text: null, how: item.book })),
      ]
    : book.map(({ item, day }) => ({ id: item.id, name: item.name, day, text: null, how: undefined }));
  const flights = views.flatMap(v => v.flights);
  const blocks = m?.blocks ?? [];
  // A night block per row when the calendar works; else the chosen stays alone.
  const sleep = blocks.length > 0
    ? blocks.map((b, i) => {
      const stay = m?.staysByArea[b.area];
      const dates = b.checkIn && b.checkOut ? `${dateLabel(b.checkIn)} to ${dateLabel(b.checkOut)}` : '';
      // A stay's nights are set once per area, so the set figure and its note go on the area's first block only.
      const first = blocks.findIndex(x => x.area === b.area) === i;
      const set = stay?.itineraryNights !== undefined;
      const count = set ? (first ? stay.nights : null) : b.nights;
      return { key: `${b.fromDay}`, area: b.area, dur: [dates, count !== null && `${count} ${count === 1 ? 'night' : 'nights'}`].filter(Boolean).join(', '), note: first ? stay?.itineraryNights : undefined, stay };
    })
    : stays.map(s => ({ key: s.area, area: s.area, dur: `${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`, note: s.itineraryNights, stay: s }));
  const firstDate = views[0]?.date, lastDate = views[views.length - 1]?.date;
  const range = firstDate && lastDate ? `${dateLabel(firstDate)} to ${dateLabel(lastDate)} ${lastDate.slice(0, 4)}` : null;
  const hero = photoSrc(views[0] && dayCover(views[0], items, plan.chosen));
  return (
    <div className="it-print" data-testid="itinerary">
      <section className="it-cover" aria-label="Cover">
        {hero && <img className="it-hero" src={hero} alt="" onError={dropBroken} />}
        <p className="it-kind">{heading}</p>
        <h1 className="it-title">Sri Lanka <small>itinerary</small></h1>
        {range && <p className="it-range">{range}</p>}
        <p className="it-meta">{plan.days.length} days · about {plan.travelHours.toFixed(1)} h driving</p>
        {travellers.length > 0 && <p className="it-meta"><span className="it-label">Travelling</span> {travellers.join(', ')}</p>}
        {provisional && <p className="it-meta">Provisional: the group has not locked this plan yet.</p>}
        <div className="it-routebox">
          <div className="it-map"><RouteMap route={plan.route} /></div>
          <ol className="it-route" aria-label="Route">{plan.route.map((h, i) => <li key={i}>{hubName(h)}</li>)}</ol>
        </div>
      </section>

      {views.map(v => {
        const src = photoSrc(dayCover(v, items, plan.chosen));
        return (
          <div key={v.n} className="it-daywrap">
            {src && <img className="it-photo" src={src} alt="" onError={dropBroken} />}
            <TripDay view={v} items={items} legs={legs} rainSlack={plan.days[v.n - 1].rainSlack} compact />
          </div>
        );
      })}

      {(rows.length > 0 || flights.length > 0) && (
        <section className="it-block" aria-label="Bookings">
          <h2 className="it-dayhead">Bookings</h2>
          <ul className="it-list">
            {rows.map(r => (
              <li key={r.id} className="it-act">
                <span className="it-lead"><span className="it-name">{r.name}</span>{' '}<span className="it-dur">{dayLabel(r.day)}</span></span>
                <span className="it-detail">
                  {r.text && <span className="it-sub">{r.text}</span>}
                  {r.how && <span className="it-sub">{r.how}</span>}
                </span>
              </li>
            ))}
          </ul>
          {flights.length > 0 && (
            <>
              <h3 className="it-subhead">Flights</h3>
              <ul className="it-list it-flights" aria-label="Flights">{flights.map(f => <li key={`${f.name}${f.kind}`} className="it-act">{flightText(f)}</li>)}</ul>
            </>
          )}
        </section>
      )}

      {tips.length > 0 && (
        <section className="it-block" aria-label="Heads up">
          <h2 className="it-dayhead">Heads up</h2>
          <ul className="it-list">
            {tips.map(({ item, day }) => (
              <li key={item.id} className="it-act">
                <span className="it-lead"><span className="it-name">{item.name}</span>{' '}<span className="it-dur">{dayLabel(day)}</span></span>
                <span className="it-detail"><span className="it-sub">{item.warn}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sleep.length > 0 && (
        <section className="it-block" aria-label="Where you sleep">
          <h2 className="it-dayhead">Where you sleep</h2>
          <ul className="it-list" aria-label="Nights">
            {sleep.map(({ key, area, dur, note, stay: s }) => (
              <li key={key} className="it-act">
                <span className="it-lead"><span className="it-name">{area}: {s?.title ?? 'No stay chosen yet'}</span></span>
                <span className="it-detail">
                  <span className="it-dur">{dur}</span>
                  {note !== undefined && <span className="it-sub">{STAY_COPY.nightsNote(note)}</span>}
                  {s && (s.stayType || s.priceGbp !== undefined) && (
                    <span className="it-sub">{[s.stayType && TYPE_NAME[s.stayType], s.priceGbp !== undefined && `about £${s.priceGbp} a night`].filter(Boolean).join(', ')}</span>
                  )}
                  {s?.link && <span className="it-sub it-url">{s.link}</span>}
                </span>
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

const PRINT_CAP_MS = 4000;
const unsettled = (done: WeakSet<Element>) => [...document.querySelectorAll<HTMLImageElement>('.it-print img')].filter(i => !i.complete && !done.has(i));

/**
 * The button. The document mounts on the first tap and stays, hidden on screen, so the app carries no second copy
 * of the plan until someone asks for one. The tab title becomes the default file name for the save dialog.
 * The print dialog waits for the pictures: one that is still loading prints as a blank band. A picture that never
 * settles must not hold the file back, so the wait ends after PRINT_CAP_MS.
 */
export function SaveItinerary({ plan, kind, provisional = false, group }: { plan: Plan; kind: 'Group' | 'My'; provisional?: boolean; group?: GroupResult }) {
  const { state, items, legs, me } = useApp();
  const [printing, setPrinting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const waiting = useRef<(() => void) | null>(null);
  useEffect(() => () => waiting.current?.(), []);
  const heading = `${kind} itinerary`;
  const travellers = kind === 'Group' ? PEOPLE : me ? [me] : [];
  const save = () => {
    if (waiting.current) return;
    flushSync(() => setPrinting(true));
    const was = document.title;
    const restore = () => { document.title = was; };
    document.title = `Sri Lanka ${heading.toLowerCase()}`;
    window.addEventListener('afterprint', restore, { once: true });
    const done = new WeakSet<Element>();
    if (unsettled(done).length === 0) { window.print(); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    setPreparing(true);
    // Leaving the screen mid-wait drops the document, and printing now would be a blank page.
    waiting.current = () => { cancelled = true; clearTimeout(timer); window.removeEventListener('afterprint', restore); restore(); };
    const loaded = async () => {
      for (let p = unsettled(done); p.length > 0; p = unsettled(done)) {
        await Promise.all(p.map(img => new Promise<void>(r => {
          const end = () => { done.add(img); r(); };
          img.addEventListener('load', end, { once: true });
          img.addEventListener('error', end, { once: true });
        })));
      }
    };
    const cap = new Promise<void>(r => { timer = setTimeout(r, PRINT_CAP_MS); });
    void Promise.race([loaded(), cap]).then(() => {
      if (cancelled) return;
      clearTimeout(timer);
      waiting.current = null;
      setPreparing(false);
      window.print();
    });
  };
  return (
    <>
      <button type="button" className="it-save" aria-busy={preparing} onClick={save}>Save itinerary as PDF</button>
      {preparing && <p className="it-wait" role="status">Preparing the pictures, then the print dialog opens.</p>}
      {printing && createPortal(
        group
          ? <ModelItinerary group={group} plan={plan} items={items} legs={legs} heading={heading} provisional={provisional} travellers={travellers} />
          : <Itinerary plan={plan} items={items} legs={legs} heading={heading} provisional={provisional} travellers={travellers} stays={chosenStays(state, me, plan)} />,
        document.body,
      )}
    </>
  );
}
