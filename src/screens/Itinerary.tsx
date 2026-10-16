import './Itinerary.css';
import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import RouteMap, { hubName } from '../components/Map';
import { hm, transportOf, transportText } from '../components/TransportLine';
import { outcome, stayCtx } from '../lib/stayflow';
import { voteOpen } from '../lib/stays';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { AppState, Area, Item, Leg, Plan, Player, StayType } from '../types';
import { bookOf, tipsOf } from './BookCard';

export interface ChosenStay { area: Area; title: string; stayType?: StayType; priceGbp?: number; nights: number; link?: string }

const TYPE_NAME: Record<StayType, string> = { hostel: 'Hostel', guesthouse: 'Guesthouse', boutique: 'Boutique stay', hotel: 'Hotel', villa: 'Villa', other: 'Stay' };

/** One stay per destination, only where something is decided: a pin, or the result once everyone has locked in. */
export function chosenStays(state: AppState, me: Player | null, plan: Plan): ChosenStay[] {
  // stayCtx only needs `me` to know whether a guest is voting; the group trip has no guest when nobody is signed in.
  const ctx = stayCtx(state, me ?? PEOPLE[0], plan);
  const open = voteOpen(ctx.crewOf, ctx.participants);
  return ctx.areas.flatMap(area => {
    const o = outcome(ctx, area);
    const s = o.kind === 'decided' && (o.via === 'pin' || open) ? ctx.suggestions.find(x => x.id === o.id && x.kind === 'stay' && x.status === 'live') : undefined;
    return s ? [{ area, title: s.title, stayType: s.stayType, priceGbp: s.priceGbp, nights: ctx.nights[area] ?? 0, link: s.link }] : [];
  });
}

const dayLabel = (n: number | null) => (n === null ? '' : `Day ${n}`);

/**
 * The print-only document. It reads the same plan and the same transport and fact helpers as the screen,
 * so the saved file cannot say something the app does not.
 */
export function Itinerary({ plan, items, legs, heading, stays = [], provisional = false }: {
  plan: Plan; items: Item[]; legs: Leg[]; heading: string; stays?: ChosenStay[]; provisional?: boolean;
}) {
  const byId = new Map(items.map(i => [i.id, i]));
  const chosen = items.filter(i => plan.chosen.includes(i.id));
  const book = bookOf(plan, chosen);
  const tips = tipsOf(plan, chosen);
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

      {plan.days.map(d => (
        <section key={d.n} className="it-day" aria-label={`Day ${d.n}`}>
          <h2 className="it-dayhead">Day {d.n}{d.area && <span className="it-area">{d.area}</span>}</h2>
          <ul className="it-list">
            {d.entries.map((e, i) => {
              const move = transportOf(e, legs);
              const item = e.kind === 'activity' && e.itemId ? byId.get(e.itemId) : undefined;
              if (move) return <li key={i} className="it-move">{transportText(move)}</li>;
              if (e.kind === 'free') return <li key={i} className="it-move">{e.label}</li>;
              return (
                <li key={i} className="it-act">
                  <span className="it-name">{e.label}</span>{' '}
                  <span className="it-dur">{hm(e.onSite ?? e.hours)}</span>
                  {item && (item.when || item.fee) && (
                    <span className="it-sub">{[item.when && `Best time: ${item.when}`, item.fee && `Cost: ${item.fee}`].filter(Boolean).join('. ')}</span>
                  )}
                  {item?.book && <span className="it-sub"><b>Book:</b> {item.book}</span>}
                  {item?.warn && <span className="it-sub"><b>Heads up:</b> {item.warn}</span>}
                  {item?.britt && <span className="it-sub"><b>Britt says:</b> {item.britt}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {book.length > 0 && (
        <section className="it-block" aria-label="Bookings">
          <h2 className="it-dayhead">Bookings</h2>
          <ul className="it-list">
            {book.map(({ item, day }) => <li key={item.id} className="it-act"><span className="it-name">{item.name}</span>{' '}<span className="it-dur">{dayLabel(day)}</span><span className="it-sub">{item.book}</span></li>)}
          </ul>
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

/**
 * The button. The document mounts on the first tap and stays, hidden on screen, so the app carries no second copy
 * of the plan until someone asks for one. The tab title becomes the default file name for the save dialog.
 */
export function SaveItinerary({ plan, kind, provisional = false }: { plan: Plan; kind: 'Group' | 'My'; provisional?: boolean }) {
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
        <Itinerary plan={plan} items={items} legs={legs} heading={heading} provisional={provisional} stays={chosenStays(state, me, plan)} />,
        document.body,
      )}
    </>
  );
}
