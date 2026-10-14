import RouteMap from '../components/Map';
import { useApp } from '../state';
import type { DayEntry, Plan } from '../types';

const hrs = (h: number) => h.toFixed(1);

function entryText(e: DayEntry): string {
  if (e.kind === 'drive') return `${e.label.replace(/^Drive from .+? to /, 'Drive to ')}, about ${hrs(e.hours)} h`;
  return e.hours > 0 ? `${e.label}, ${hrs(e.hours)} h` : e.label;
}

export function DayRows({ plan }: { plan: Plan }) {
  return (
    <div role="list" aria-label="Days">
      {plan.days.map(d => (
        <div key={d.n} className="day" role="listitem">
          <span className="d">Day {d.n}</span>
          <span>
            {d.entries.map((e, i) => <span key={i} className="entry">{entryText(e)}</span>)}
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
