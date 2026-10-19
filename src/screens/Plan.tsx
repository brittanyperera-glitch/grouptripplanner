import type { ReactNode } from 'react';
import RouteMap from '../components/Map';
import { useOpenAdmin } from '../components/AdminNav';
import { useOpenStays } from '../components/StaysNav';
import { useApp } from '../state';
import { isReopened } from '../lib/openItems';
import { tierOf } from '../lib/ranking';
import { sideQuests } from '../lib/sideQuests';
import { PEOPLE } from '../types';
import type { GroupResult } from '../types';
import { tipsOf } from './BookCard';
import { SaveItinerary } from './Itinerary';
import { TripAdminLink } from './TripAdmin';
import { DayRows } from './MyTrip';

export default function Plan({ group, reveal }: { group: GroupResult; reveal?: ReactNode }) {
  const { state, items, legs, me } = useApp();
  const openAdmin = useOpenAdmin();
  const openStays = useOpenStays();
  // S1: while only late votes are open, show the plan they are asked against, never the pre-vote base.
  const plan = group.final ?? group.held ?? group.base;
  if (!plan) return null;
  const reopened = isReopened(group, state);
  const pending = group.knockouts.map(k => items.find(i => i.id === k.a[0])?.name ?? k.a[0]).join(', ');
  const chosen = items.filter(i => plan.chosen.includes(i.id));
  const tips = tipsOf(plan, chosen).flatMap(t => (t.day === null ? [] : [{ day: t.day, name: t.item.name, text: t.item.warn as string }]));
  return (
    <section className="body" aria-label="The trip">
      <div className="kicker">Group plan</div>
      <div className="big display">The trip</div>
      <div className="sub">
        {reopened ? `Locked plan. New vote open: ${pending}`
          : !group.final ? 'Provisional until the knockouts are done'
          : group.locked ? `${plan.days.length} days, about ${plan.travelHours.toFixed(1)} h driving`
            : `Provisional until all five finalize their lists (${group.finalized.length} of 5 done)`}
      </div>
      {reveal}
      {openStays && <button type="button" className="cta" onClick={openStays}>Next: find somewhere to stay</button>}
      <TripAdminLink group={group} onOpen={openAdmin ?? (() => {})} />
      <RouteMap route={plan.route} />
      <SaveItinerary plan={plan} kind="Group" provisional={!(reopened || (group.final && group.locked))} />
      <DayRows plan={plan} items={items} legs={legs} quests={sideQuests(plan, me, state, items)} tips={tips} skippedBy={id => PEOPLE.filter(p => { const r = state.responses[p]; return !!r && tierOf(r.ranking, id) === 'skip'; })} />
    </section>
  );
}
