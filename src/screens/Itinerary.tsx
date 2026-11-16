import './Itinerary.css';
import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import RouteMap, { hubName } from '../components/Map';
import { dayView } from '../lib/dayView';
import { nightsNote, outcome, STAY_COPY, stayCtx } from '../lib/stayflow';
import { voteOpen } from '../lib/stays';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { AppState, Area, GroupResult, Item, Leg, Plan, Player, StayType } from '../types';
import { bookOf, tipsOf } from './BookCard';
import TripDay, { dateLabel, flightText, STATUS_LABEL } from './TripDay';
import { useTripModel, type TripModel } from './useTripModel';

export interface ChosenStay { area: Area; title: string; stayType?: StayType; priceGbp?: number; nights: number; itineraryNights?: number; link?: string }

const TYPE_NAME: Record<StayType, string> = { hostel: 'Hostel', guesthouse: 'Guesthouse', boutique: 'Boutique stay', hotel: 'Hotel', villa: 'Villa', other: 'Stay' };

/** One stay per destination, only where something is decided: a pin, or the result once everyone has locked in. */
export function chosenStays(state: AppState, me: Player | null, plan: Plan): ChosenStay[] {
  // stayCtx only needs `me` to know whether a guest is voting; the group trip has no guest when nobody is signed in.
  const ctx = stayCtx(state, me ?? PEOPLE[0], plan);
  const open = voteOpen(ctx.crewOf, ctx.participants);
  return ctx.areas.flatMap(area => {
    const o = outcome(ctx, area);
    const s = o.kind === 'decided' && (o.via === 'pin' || open) ? ctx.suggestions.find(x => x.id === o.id && x.kind === 'stay' && x.status === 'live') : undefined;
    return s ? [{ area, title: s.title, stayType: s.stayType, priceGbp: s.priceGbp, nights: ctx.nights[area] ?? 0, ...(nightsNote(ctx, area) ? { itineraryNights: ctx.derivedNights?.[area] } : {}), link: s.link }] : [];
  });
}

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
  const status = new Map((m?.bookings ?? []).map(b => [b.id, b]));
  const stayBookings = (m?.bookings ?? []).filter(b => b.id.startsWith('stay:'));
  const flights = views.flatMap(v => v.flights);
  const blocks = m?.blocks ?? [];
  const chip = (id: string) => { const b = status.get(id); return b ? `${STATUS_LABEL[b.status]}${b.owner ? `, ${b.owner} is booking` : ''}` : null; };
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

      {(book.length > 0 || stayBookings.length > 0 || flights.length > 0 || blocks.length > 0) && (
        <section className="it-block" aria-label="Bookings">
          <h2 className="it-dayhead">Bookings</h2>
          <ul className="it-list">
            {book.map(({ item, day }) => (
              <li key={item.id} className="it-act">
                <span className="it-name">{item.name}</span>{' '}<span className="it-dur">{dayLabel(day)}</span>
                {chip(`book:${item.id}`) && <span className="it-sub">{chip(`book:${item.id}`)}</span>}
                <span className="it-sub">{item.book}</span>
              </li>
            ))}
            {stayBookings.map(b => <li key={b.id} className="it-act"><span className="it-name">{b.label}</span> <span className="it-sub">{chip(b.id)}</span></li>)}
          </ul>
          {flights.length > 0 && (
            <>
              <h3 className="it-subhead">Flights</h3>
              <ul className="it-list" aria-label="Flights">{flights.map(f => <li key={`${f.name}${f.kind}`} className="it-act">{flightText(f)}</li>)}</ul>
            </>
          )}
          {blocks.length > 0 && (
            <>
              <h3 className="it-subhead">Nights</h3>
              <ul className="it-list" aria-label="Nights">
                {blocks.map(b => (
                  <li key={b.fromDay} className="it-act">
                    <span className="it-name">{b.area}</span>{' '}
                    <span className="it-dur">{`${b.checkIn && b.checkOut ? `${dateLabel(b.checkIn)} to ${dateLabel(b.checkOut)}, ` : ''}${b.nights} ${b.nights === 1 ? 'night' : 'nights'}`}</span>
                    <span className="it-sub">{m?.staysByArea[b.area]?.title ?? 'No stay chosen yet'}</span>
                  </li>
                ))}
              </ul>
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

      {stays.length > 0 && (
        <section className="it-block" aria-label="Where you are staying">
          <h2 className="it-dayhead">Where you are staying</h2>
          <ul className="it-list">
            {stays.map(s => (
              <li key={s.area} className="it-act">
                <span className="it-name">{s.area}: {s.title}</span>{' '}
                <span className="it-dur">{s.nights} {s.nights === 1 ? 'night' : 'nights'}</span>
                {s.itineraryNights !== undefined && <span className="it-sub">{STAY_COPY.nightsNote(s.itineraryNights)}</span>}
                {(s.stayType || s.priceGbp !== undefined) && (
                  <span className="it-sub">{[s.stayType && TYPE_NAME[s.stayType], s.priceGbp !== undefined && `about £${s.priceGbp} a night`].filter(Boolean).join(', ')}</span>
                )}
                {s.link && <span className="it-sub it-url">{s.link}</span>}
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
