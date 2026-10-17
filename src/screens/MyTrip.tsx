import './MyTrip.css';
import { IconCar, IconDown, IconPin, IconSun, IconTrain, IconWarn } from '../components/Icons';
import { useEffect, useId, useState } from 'react';
import ItemSheet from '../components/ItemSheet';
import RouteMap from '../components/Map';
import { motion } from '../components/motion';
import { Cover } from '../components/PhotoCard';
import type { SideQuest } from '../lib/sideQuests';
import { useApp } from '../state';
import type { DayEntry, Item, Leg, Plan } from '../types';
import { unlock } from '../components/sound';
import TransportLine, { transportOf } from '../components/TransportLine';
import type { DayTip } from './BookCard';
import { useJourneyNotes } from './GroupAnswers';
import { factPills } from './Rate';
import { Reveal } from './Reveal';
import { SaveItinerary } from './Itinerary';

// A day with this many driving hours or more gets a "Long driving day" note.
const LONG_DRIVE_HOURS = 5;
const MIN_ROUND_TRIP = 0.25;

const hrs = (h: number) => h.toFixed(1);
const hrsShort = (h: number) => (Number.isInteger(h) ? String(h) : hrs(h));

function entryText(e: DayEntry): string {
  if (e.kind === 'activity') return `${e.label}, ${hrsShort(e.onSite ?? e.hours)} h`;
  return e.hours > 0 ? `${e.label}, ${hrsShort(e.hours)} h` : e.label;
}

const ICON = { drive: IconCar, train: IconTrain, free: IconSun, activity: IconPin } as const;

const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs.join(''));

// What a tapped activity shows in place: the same facts as the full-screen sheet, which one button away has the rest.
function EntryFacts({ id, item, onFull }: { id: string; item: Item; onFull(): void }) {
  return (
    <span className="it-panel" id={id}>
      <span className="pills">{factPills(item).map(([icon, text]) => <span key={text} className="pill">{icon}<span>{text}</span></span>)}</span>
      {item.about && <span className="it-line">{item.about}</span>}
      {item.book && <span className="it-line"><b>Book:</b> {item.book}</span>}
      {item.warn && <span className="fact-warn"><IconWarn size={16} /><span><b>Heads up:</b> {item.warn}</span></span>}
      {item.britt && <span className="it-line"><b>Britt says:</b> {item.britt}</span>}
      <button type="button" className="it-full" onClick={onFull}>Full details</button>
    </span>
  );
}

// One card per day. The header strip is the day's first activity photo when we have one.
// skippedBy is for the group plan only (D7): a Skip is a strong minus, not a veto, so it is named.
export function DayRows({ plan, items = [], legs = [], skippedBy, quests = [], tips = [], journey = true }: { plan: Plan; items?: Item[]; legs?: Leg[]; skippedBy?: (id: string) => string[]; quests?: SideQuest[]; tips?: DayTip[]; journey?: boolean }) {
  const notes = useJourneyNotes(plan, legs, journey);
  const byId = new Map(items.map(i => [i.id, i]));
  const uid = useId();
  // One row open at a time, keyed by day and position.
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Item | null>(null);
  return (
    <div role="list" aria-label="Days" className="days">
      {plan.days.map(d => {
        const first = d.entries.map(e => (e.itemId ? byId.get(e.itemId) : undefined)).find(Boolean);
        const driving = d.entries.filter(e => e.kind === 'drive').reduce((s, e) => s + e.hours, 0);
        const head = (
          <span className="day-head">
            <span className="d">Day {d.n}</span>
            {d.area && <span className="day-area">{d.area}</span>}
          </span>
        );
        return (
          <div key={d.n} className="day" role="listitem">
            {first
              ? <Cover item={first} className="strip scene" named={false} credit><span className="scrim" />{head}</Cover>
              : <div className="strip scene plain">{head}</div>}
            <span className="timeline">
              {d.entries.map((e, i) => {
                const Icon = ICON[e.kind];
                const move = transportOf(e, legs);
                const skipped = e.kind === 'activity' && e.itemId && skippedBy ? skippedBy(e.itemId) : [];
                const item = e.kind === 'activity' && e.itemId ? byId.get(e.itemId) : undefined;
                const key = `${d.n}-${i}`, panel = `${uid}${key}`, isOpen = open === key;
                const text = (
                  <>
                    {move ? <TransportLine t={move} /> : entryText(e)}
                    {e.kind === 'activity' && (e.roundTrip ?? 0) >= MIN_ROUND_TRIP && (
                      <small>plus about {hrs(e.roundTrip ?? 0)} h there and back</small>
                    )}
                    {skipped.length > 0 && <small>Skipped by {andList(skipped)}</small>}
                  </>
                );
                return (
                  <span key={i} className={`entry ${e.kind}`}>
                    <span className="dot" aria-hidden="true"><Icon size={13} /></span>
                    <span className="entry-txt">
                      {item ? (
                        <button type="button" className="it-row" aria-expanded={isOpen} aria-controls={isOpen ? panel : undefined} onClick={() => setOpen(isOpen ? null : key)}>
                          <span className="it-row-txt">{text}</span>
                          <span className="it-chev" aria-hidden="true"><IconDown size={16} /></span>
                        </button>
                      ) : text}
                      {item && isOpen && <EntryFacts id={panel} item={item} onFull={() => setSheet(item)} />}
                    </span>
                  </span>
                );
              })}
              {notes.has(d.n) && <small className="jf-note">{notes.get(d.n)}</small>}
              {quests.filter(q => q.day === d.n).map(q => <small key={q.itemId} className="day-quest">Side quest: {q.what}</small>)}
              {tips.filter(t => t.day === d.n).map(t => <small key={t.name} className="day-quest">{t.name}: {t.text}</small>)}
              {(driving >= LONG_DRIVE_HOURS || d.rainSlack) && (
                <span className="day-notes">
                  {driving >= LONG_DRIVE_HOURS && <small className="note warn">Long driving day</small>}
                  {d.rainSlack && <small className="note">Spare for rain</small>}
                </span>
              )}
            </span>
          </div>
        );
      })}
      {sheet && <ItemSheet items={[sheet]} title={sheet.name} onClose={() => setSheet(null)} />}
    </div>
  );
}

// Set once My trip has played its reveal by itself; a tp: key, so ?fresh resets it.
export const REVEAL_SEEN_KEY = 'tp:reveal-mine';
const seen = () => { try { return localStorage.getItem(REVEAL_SEEN_KEY) !== null; } catch { return true; } };

export default function MyTrip({ plan, days }: { plan: Plan & { mustFit: number | null }; days: number }) {
  const { items, legs, me } = useApp();
  const name = (id: string) => items.find(i => i.id === id)?.name ?? id;
  // The first visit with motion on plays the reveal; the map's own drive waits until it closes.
  const [revealing, setRevealing] = useState(() => motion() === 'full' && !!me && !seen());
  useEffect(() => {
    if (revealing) try { localStorage.setItem(REVEAL_SEEN_KEY, '1'); } catch { /* storage unavailable: it may play again next visit */ }
  }, [revealing]);
  return (
    <section className="body" aria-label="My trip">
      <div className="kicker">My trip</div>
      <div className="big display">Your best {days} days</div>
      {!plan.fits && (
        <div className="sub warn">
          {plan.mustFit === null ? "Your Musts don't fit even in 21 days" : `Your Musts fit in ${plan.mustFit} days, not ${days}`}
          {plan.missingMusts.length > 0 && `. Left out: ${plan.missingMusts.map(name).join(', ')}`}
        </div>
      )}
      <RouteMap route={plan.route} drive={!revealing} />
      {me && <button type="button" className="cta mytrip-reveal" onClick={() => { unlock(); setRevealing(true); }}>Play my route reveal</button>}
      {revealing && me && <Reveal plan={plan} who={me} onClose={() => setRevealing(false)} />}
      <SaveItinerary plan={plan} kind="My" />
      <DayRows plan={plan} items={items} legs={legs} journey={false} />
    </section>
  );
}
