import type { ReactNode } from 'react';
import RouteMap from '../components/Map';
import { useOpenAdmin } from '../components/AdminNav';
import { useOpenStays } from '../components/StaysNav';
import { useApp } from '../state';
import { isReopened } from '../lib/openItems';
import { releaseFor } from '../lib/release';
import { tierOf } from '../lib/ranking';
import { sideQuests } from '../lib/sideQuests';
import { PEOPLE } from '../types';
import type { GroupResult, Plan as PlanData } from '../types';
import { tipsOf } from './BookCard';
import { SaveItinerary } from './Itinerary';
import { TripAdminLink } from './TripAdmin';
import { DayRows } from './MyTrip';
import TripView from './TripView';

/** The plan the screens show: while only late votes are open, the plan they are asked against, never the pre-vote base (S1). */
export const shownPlan = (g: GroupResult): PlanData | null => g.final ?? g.held ?? g.base;

/** Save itinerary for the plan on show; provisional unless the plan is locked or re-opened. */
export function PlanSave({ group }: { group: GroupResult }) {
  const { state } = useApp();
  const plan = shownPlan(group);
  return plan ? <SaveItinerary plan={plan} kind="Group" group={group} provisional={!(isReopened(group, state) || (group.final && group.locked))} /> : null;
}

export default function Plan({ group, reveal }: { group: GroupResult; reveal?: ReactNode }) {
  const { state, items, legs, me } = useApp();
  const openAdmin = useOpenAdmin();
  const openStays = useOpenStays();
  const plan = shownPlan(group);
  if (!plan) return null;
  const reopened = isReopened(group, state);
  const pending = group.knockouts.map(k => items.find(i => i.id === k.a[0])?.name ?? k.a[0]).join(', ');
  const chosen = items.filter(i => plan.chosen.includes(i.id));
  const tips = tipsOf(plan, chosen).flatMap(t => (t.day === null ? [] : [{ day: t.day, name: t.item.name, text: t.item.warn as string }]));
  const head = (
    <>
      <div className="kicker">Group plan</div>
      <div className="big display">The trip</div>
      <div className="sub">
        {reopened ? `Locked plan. New vote open: ${pending}`
          : !group.final ? 'Provisional until the knockouts are done'
          : group.locked ? `${plan.days.length} days, about ${plan.travelHours.toFixed(1)} h driving`
            : `Provisional until all five finalize their lists (${group.finalized.length} of 5 done)`}
      </div>
      {reveal}
      {!releaseFor(me) && openStays && <button type="button" className="cta" onClick={openStays}>Next: find somewhere to stay</button>}
      <TripAdminLink group={group} onOpen={openAdmin ?? (() => {})} />
    </>
  );
  const save = <PlanSave group={group} />;
  if (releaseFor(me)) return <><section className="body" aria-label="The trip">{head}{save}</section><TripView group={group} /></>;
  return (
    <section className="body" aria-label="The trip">
      {head}
      <RouteMap route={plan.route} />
      {save}
      <DayRows plan={plan} items={items} legs={legs} quests={sideQuests(plan, me, state, items)} tips={tips} skippedBy={id => PEOPLE.filter(p => { const r = state.responses[p]; return !!r && tierOf(r.ranking, id) === 'skip'; })} />
    </section>
  );
}
