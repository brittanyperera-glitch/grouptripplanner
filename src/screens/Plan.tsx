import { useState } from 'react';
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
import type { GroupResult } from '../types';
import { tipsOf } from './BookCard';
import { SaveItinerary } from './Itinerary';
import MissionHQ from './MissionHQ';
import { TripAdminLink } from './TripAdmin';
import { DayRows } from './MyTrip';
import TripView from './TripView';

/** `spy` is the HQ's spyActive; Replay would show unfinished missions as done, so it is offered only when it is false. */
export default function Plan({ group, reveal, spy = true }: { group: GroupResult; reveal?: ReactNode; spy?: boolean }) {
  const { state, items, legs, me } = useApp();
  const [replay, setReplay] = useState(false);
  const openAdmin = useOpenAdmin();
  const openStays = useOpenStays();
  // S1: while only late votes are open, show the plan they are asked against, never the pre-vote base.
  const plan = group.final ?? group.held ?? group.base;
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
      {openStays && <button type="button" className="cta" onClick={openStays}>Next: find somewhere to stay</button>}
      <TripAdminLink group={group} onOpen={openAdmin ?? (() => {})} />
    </>
  );
  const save = <SaveItinerary plan={plan} kind="Group" group={group} provisional={!(reopened || (group.final && group.locked))} />;
  if (releaseFor(me)) {
    if (replay) return <MissionHQ group={group} replay onGo={() => undefined} onOpen={() => undefined} onExit={() => setReplay(false)} />;
    return <><section className="body" aria-label="The trip">{head}{save}</section><TripView group={group} onReplay={spy ? undefined : () => setReplay(true)} /></>;
  }
  return (
    <section className="body" aria-label="The trip">
      {head}
      <RouteMap route={plan.route} />
      {save}
      <DayRows plan={plan} items={items} legs={legs} quests={sideQuests(plan, me, state, items)} tips={tips} skippedBy={id => PEOPLE.filter(p => { const r = state.responses[p]; return !!r && tierOf(r.ranking, id) === 'skip'; })} />
    </section>
  );
}
