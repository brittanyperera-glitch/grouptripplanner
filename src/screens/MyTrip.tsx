import { IconCar, IconPin, IconSun, IconTrain } from '../components/Icons';
import RouteMap from '../components/Map';
import { Cover } from '../components/PhotoCard';
import { useApp } from '../state';
import type { DayEntry, Item, Plan } from '../types';

// A day with this many driving hours or more gets a "Long driving day" note.
const LONG_DRIVE_HOURS = 5;
const MIN_ROUND_TRIP = 0.25;

const hrs = (h: number) => h.toFixed(1);
const hrsShort = (h: number) => (Number.isInteger(h) ? String(h) : hrs(h));

function entryText(e: DayEntry): string {
  if (e.kind === 'drive') return `${e.label.replace(/^Drive from .+? to /, 'Drive to ')}, about ${hrs(e.hours)} h`;
  if (e.kind === 'activity') return `${e.label}, ${hrsShort(e.onSite ?? e.hours)} h`;
  return e.hours > 0 ? `${e.label}, ${hrsShort(e.hours)} h` : e.label;
}

const ICON = { drive: IconCar, train: IconTrain, free: IconSun, activity: IconPin } as const;

// One card per day. The header strip is the day's first activity photo when we have one.
export function DayRows({ plan, items = [] }: { plan: Plan; items?: Item[] }) {
  const byId = new Map(items.map(i => [i.id, i]));
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
              ? <Cover item={first} className="strip scene" named={false}><span className="scrim" />{head}</Cover>
              : <div className="strip scene plain">{head}</div>}
            <span className="timeline">
              {d.entries.map((e, i) => {
                const Icon = ICON[e.kind];
                return (
                  <span key={i} className={`entry ${e.kind}`}>
                    <span className="dot" aria-hidden="true"><Icon size={13} /></span>
                    <span className="entry-txt">
                      {entryText(e)}
                      {e.kind === 'activity' && (e.roundTrip ?? 0) >= MIN_ROUND_TRIP && (
                        <small>plus about {hrs(e.roundTrip ?? 0)} h there and back</small>
                      )}
                    </span>
                  </span>
                );
              })}
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
    </div>
  );
}

export default function MyTrip({ plan, days }: { plan: Plan & { mustFit: number | null }; days: number }) {
  const { items } = useApp();
  const name = (id: string) => items.find(i => i.id === id)?.name ?? id;
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
      <RouteMap route={plan.route} />
      <DayRows plan={plan} items={items} />
    </section>
  );
}
