import './MyTrip.css';
import './TripDay.css';
import { IconPin } from '../components/Icons';
import { Cover } from '../components/PhotoCard';
import TransportLine, { hm, transportOf, transportText } from '../components/TransportLine';
import type { SideQuest } from '../lib/sideQuests';
import type { Area, DayBooking, DayView, Item, Leg } from '../types';
import type { DayTip } from './BookCard';
import { bookingParts, bookingText } from './bookingText';
import { andList, entryText, hrs, hrsShort, ICON, LONG_DRIVE_HOURS, MIN_ROUND_TRIP } from './dayParts';

const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** 'Wed 9 Dec' from 'YYYY-MM-DD'; read as UTC so no timezone can move the day. */
export function dateLabel(date: string): string {
  const p = Object.fromEntries(DATE.formatToParts(new Date(`${date}T00:00:00Z`)).map(x => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}`;
}

export const flightText = (f: DayView['flights'][number]) => `${f.name} ${f.kind === 'arrive' ? 'arrives' : 'leaves'} ${f.time.slice(11)}${f.flight ? ` · ${f.flight}` : ''}`;
const tonightText = (t: NonNullable<DayView['tonight']>) => `${t.checkIn ? 'Tonight, check in' : 'Tonight'}: ${t.title ? `${t.title}, ${t.area}` : `No stay chosen yet in ${t.area}`}`;

export interface TripDayProps {
  view: DayView;
  quests?: SideQuest[]; tips?: DayTip[]; skippedBy?: (id: string) => string[];
  onPlace?(itemId: string): void; onStay?(area: Area): void;
  /** The print layout: the saved itinerary's own list markup, no photo strip and no buttons. */
  compact?: boolean;
  /** Only for the photo strip and the print facts. */
  items?: Item[]; legs?: Leg[];
  /** The day's journey note, from useJourneyNotes. */
  note?: string;
  /** DayView has no rain flag; the plan's day does. */
  rainSlack?: boolean;
}

function Bookings({ list }: { list: DayBooking[] }) {
  return (
    <ul className="td-list" aria-label="Day bookings">
      {list.map(b => {
        const p = bookingParts(b);
        return (
          <li key={b.id}>
            <span className="td-name">{b.label}</span>
            <span className={`td-chip td-${b.status}`}>{p.status}</span>
            {p.owner && <span className="td-owner">{p.owner}{p.note && <small> {p.note}</small>}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Print({ view, items = [], legs = [], quests = [], tips = [], skippedBy, note, rainSlack }: TripDayProps) {
  const byId = new Map(items.map(i => [i.id, i]));
  const listed = new Set(view.bookings.map(b => b.id));
  return (
    <section className="it-day" aria-label={`Day ${view.n}`}>
      <h2 className="it-dayhead">{`Day ${view.n}${view.date ? ` · ${dateLabel(view.date)}` : ''}`}{view.area && <span className="it-area">{view.area}</span>}</h2>
      <ul className="it-list">
        {view.entries.map((e, i) => {
          const move = transportOf(e, legs);
          const item = e.kind === 'activity' && e.itemId ? byId.get(e.itemId) : undefined;
          if (move) return <li key={i} className="it-move">{transportText(move)}</li>;
          if (e.kind === 'free') return <li key={i} className="it-move">{e.label}</li>;
          const skipped = e.itemId && skippedBy ? skippedBy(e.itemId) : [];
          return (
            <li key={i} className="it-act">
              <span className="it-name">{e.label}</span>{' '}
              <span className="it-dur">{hm(e.onSite ?? e.hours)}</span>
              {item && (item.when || item.fee) && (
                <span className="it-sub">{[item.when && `Best time: ${item.when}`, item.fee && `Cost: ${item.fee}`].filter(Boolean).join('. ')}</span>
              )}
              {item?.book && !listed.has(`book:${item.id}`) && <span className="it-sub"><b>Book:</b> {item.book}</span>}
              {item?.warn && <span className="it-sub"><b>Heads up:</b> {item.warn}</span>}
              {item?.britt && <span className="it-sub"><b>Britt says:</b> {item.britt}</span>}
              {skipped.length > 0 && <span className="it-sub">Skipped by {andList(skipped)}</span>}
            </li>
          );
        })}
        {view.custom.map(c => <li key={c.id} className="it-act"><span className="it-name">{c.title ?? c.id}</span>{c.hours ? <>{' '}<span className="it-dur">{hm(c.hours)}</span></> : null}{c.note && <span className="it-sub">{c.note}</span>}</li>)}
        {note && <li className="it-move">{note}</li>}
        {quests.filter(q => q.day === view.n).map(q => <li key={q.itemId} className="it-move">Side quest: {q.what}</li>)}
        {tips.filter(t => t.day === view.n).map(t => <li key={t.name} className="it-move">{t.name}: {t.text}</li>)}
        {rainSlack && <li className="it-move">Spare for rain</li>}
        {view.tonight && <li className="it-move">{tonightText(view.tonight)}</li>}
        {view.bookings.map(b => <li key={b.id} className="it-move">Book: {b.label}, {bookingText(b)}</li>)}
        {view.flights.map(f => <li key={`${f.name}${f.kind}`} className="it-move">{flightText(f)}</li>)}
      </ul>
    </section>
  );
}

/** One day from the trip model. The print layout is live; the photo-strip card is not rendered by any screen yet (DayRows still draws Trip view). */
export default function TripDay(props: TripDayProps) {
  if (props.compact) return <Print {...props} />;
  const { view, items = [], legs = [], quests = [], tips = [], skippedBy, onPlace, onStay, note, rainSlack } = props;
  const byId = new Map(items.map(i => [i.id, i]));
  const first = view.entries.map(e => (e.itemId ? byId.get(e.itemId) : undefined)).find(Boolean);
  const driving = view.entries.filter(e => e.kind === 'drive').reduce((s, e) => s + e.hours, 0);
  const head = (
    <span className="day-head td-head">
      <span className="td-day">{`Day ${view.n}${view.date ? ` · ${dateLabel(view.date)}` : ''}`}</span>
      {view.area && <span className="day-area">{view.area}</span>}
    </span>
  );
  return (
    <section className="day" aria-label={`Day ${view.n}`}>
      {first
        ? <Cover item={first} className="strip scene" named={false} credit><span className="scrim" />{head}</Cover>
        : <div className="strip scene plain">{head}</div>}
      <span className="timeline">
        {view.entries.map((e, i) => {
          const Icon = ICON[e.kind];
          const move = transportOf(e, legs);
          const skipped = e.kind === 'activity' && e.itemId && skippedBy ? skippedBy(e.itemId) : [];
          const text = (
            <>
              {move ? <TransportLine t={move} /> : entryText(e)}
              {e.kind === 'activity' && (e.roundTrip ?? 0) >= MIN_ROUND_TRIP && <small>plus about {hrs(e.roundTrip ?? 0)} h there and back</small>}
              {skipped.length > 0 && <small>Skipped by {andList(skipped)}</small>}
            </>
          );
          const placeId = e.kind === 'activity' ? e.itemId : undefined;
          return (
            <span key={i} className={`entry ${e.kind}`}>
              <span className="dot" aria-hidden="true"><Icon size={13} /></span>
              <span className="entry-txt">
                {placeId && onPlace ? <button type="button" className="it-row" onClick={() => onPlace(placeId)}><span className="it-row-txt">{text}</span></button> : text}
              </span>
            </span>
          );
        })}
        {view.custom.map(c => (
          <span key={c.id} className="entry activity">
            <span className="dot" aria-hidden="true"><IconPin size={13} /></span>
            <span className="entry-txt">{c.hours ? `${c.title ?? c.id}, ${hrsShort(c.hours)} h` : (c.title ?? c.id)}{c.note && <small>{c.note}</small>}</span>
          </span>
        ))}
        {note && <small className="jf-note">{note}</small>}
        {quests.filter(q => q.day === view.n).map(q => <small key={q.itemId} className="day-quest">Side quest: {q.what}</small>)}
        {tips.filter(t => t.day === view.n).map(t => <small key={t.name} className="day-quest">{t.name}: {t.text}</small>)}
        {(driving >= LONG_DRIVE_HOURS || rainSlack || view.overBudget) && (
          <span className="day-notes">
            {driving >= LONG_DRIVE_HOURS && <small className="note warn">Long driving day</small>}
            {rainSlack && <small className="note">Spare for rain</small>}
            {view.overBudget && <small className="note warn">Over by {hrs(-view.spare)} h</small>}
          </span>
        )}
        {view.tonight && (onStay
          ? <button type="button" className="td-tonight" onClick={() => onStay(view.tonight!.area)}>{tonightText(view.tonight)}</button>
          : <span className="td-tonight">{tonightText(view.tonight)}</span>)}
        {view.bookings.length > 0 && <Bookings list={view.bookings} />}
        {view.flights.length > 0 && <ul className="td-list" aria-label="Day flights">{view.flights.map(f => <li key={`${f.name}${f.kind}`}>{flightText(f)}</li>)}</ul>}
      </span>
    </section>
  );
}
