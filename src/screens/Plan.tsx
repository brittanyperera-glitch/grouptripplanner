import { IconBook, IconWarn } from '../components/Icons';
import RouteMap from '../components/Map';
import { useApp } from '../state';
import { tierOf } from '../lib/ranking';
import { PEOPLE } from '../types';
import type { GroupResult } from '../types';
import { DayRows } from './MyTrip';

export default function Plan({ group }: { group: GroupResult }) {
  const { state, items, legs } = useApp();
  const plan = group.final ?? group.base;
  if (!plan) return null;
  const chosen = items.filter(i => plan.chosen.includes(i.id));
  const book = chosen.filter(i => i.book);
  const warn = chosen.filter(i => i.warn);
  return (
    <section className="body" aria-label="The trip">
      <div className="kicker">Group plan</div>
      <div className="big display">The trip</div>
      <div className="sub">
        {!group.final ? 'Provisional until the knockouts are done'
          : group.locked ? `${plan.days.length} days, about ${plan.travelHours.toFixed(1)} h driving`
            : `Provisional until all five finalize their lists (${group.finalized.length} of 5 done)`}
      </div>
      <RouteMap route={plan.route} />
      <DayRows plan={plan} items={items} legs={legs} skippedBy={id => PEOPLE.filter(p => { const r = state.responses[p]; return !!r && tierOf(r.ranking, id) === 'skip'; })} />
      {book.length > 0 && (
        <div className="card-list">
          <div className="tierhead"><IconBook size={16} />Book before you go</div>
          {book.map(i => <div key={i.id} className="row2"><span>{i.name}</span><span>{i.book}</span></div>)}
        </div>
      )}
      {warn.length > 0 && (
        <div className="card-list">
          <div className="tierhead"><IconWarn size={16} />Good to know</div>
          {warn.map(i => <div key={i.id} className="row2"><span>{i.name}</span><span>{i.warn}</span></div>)}
        </div>
      )}
    </section>
  );
}
