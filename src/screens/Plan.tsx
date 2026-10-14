import RouteMap from '../components/Map';
import { useApp } from '../state';
import type { GroupResult } from '../types';
import { DayRows } from './MyTrip';

export default function Plan({ group }: { group: GroupResult }) {
  const { items } = useApp();
  const plan = group.final ?? group.base;
  if (!plan) return null;
  const chosen = items.filter(i => plan.chosen.includes(i.id));
  const book = chosen.filter(i => i.book);
  const warn = chosen.filter(i => i.warn);
  return (
    <section className="body" aria-label="The trip">
      <div className="big">The trip</div>
      <div className="sub">
        {group.final ? `${plan.days.length} days, about ${plan.travelHours.toFixed(1)} h driving` : 'Provisional until the knockouts are done'}
      </div>
      <RouteMap route={plan.route} />
      <DayRows plan={plan} />
      {book.length > 0 && (
        <div>
          <div className="tierhead">Book before you go</div>
          {book.map(i => <div key={i.id} className="row2"><span>{i.name}</span><span>{i.book}</span></div>)}
        </div>
      )}
      {warn.length > 0 && (
        <div>
          <div className="tierhead">Good to know</div>
          {warn.map(i => <div key={i.id} className="row2"><span>{i.name}</span><span>{i.warn}</span></div>)}
        </div>
      )}
    </section>
  );
}
