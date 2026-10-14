import RouteMap from '../components/Map';
import { useApp } from '../state';
import type { DayEntry, Plan } from '../types';

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

export function DayRows({ plan }: { plan: Plan }) {
  return (
    <div role="list" aria-label="Days">
      {plan.days.map(d => (
        <div key={d.n} className="day" role="listitem">
          <span className="d">Day {d.n}</span>
          <span>
            {d.entries.map((e, i) => (
              <span key={i} className="entry">
                {entryText(e)}
                {e.kind === 'activity' && (e.roundTrip ?? 0) >= MIN_ROUND_TRIP && (
                  <small>plus about {hrs(e.roundTrip ?? 0)} h there and back</small>
                )}
              </span>
            ))}
            {d.entries.filter(e => e.kind === 'drive').reduce((s, e) => s + e.hours, 0) >= LONG_DRIVE_HOURS && <small>Long driving day</small>}
            {d.rainSlack && <small>Spare for rain</small>}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function MyTrip({ plan, days }: { plan: Plan & { mustFit: number | null }; days: number }) {
  const { items } = useApp();
  const name = (id: string) => items.find(i => i.id === id)?.name ?? id;
  return (
    <section className="body" aria-label="My trip">
      <div className="big">Your best {days} days</div>
      {!plan.fits && (
        <div className="sub warn">
          {plan.mustFit === null ? "Your Musts don't fit even in 21 days" : `Your Musts fit in ${plan.mustFit} days, not ${days}`}
          {plan.missingMusts.length > 0 && `. Left out: ${plan.missingMusts.map(name).join(', ')}`}
        </div>
      )}
      <RouteMap route={plan.route} />
      <DayRows plan={plan} />
    </section>
  );
}
