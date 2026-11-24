import './RouteTab.css';
import type { Open, Task } from '../lib/todo';
import { useApp } from '../state';
import type { GroupResult } from '../types';
import { PlanSave } from './Plan';
import { TodayScreen } from './Today';
import { dateLabel } from './TripDay';
import { TripViewBody } from './TripView';
import { useTripModel } from './useTripModel';

const COPY = { next: 'Next', reveal: 'Play route reveal' };

/** The Route tab: the next thing you owe (only when there is one), the countdown before the trip, the map and day strip, then small links. On a trip day the strip and today's card come before the map. `today` is for tests. */
export default function RouteTab({ group, next, onOpen, reveal, today }: { group: GroupResult; next: Task | null; onOpen(o: Open): void; reveal?(): void; today?: string }) {
  const { items, legs } = useApp();
  const model = useTripModel(group, today);
  const todayDay = model.views.findIndex(v => v.date === model.today) + 1 || undefined;
  const before = !!model.plan && !todayDay && (!model.start || model.today < model.start);
  const doors = { onBooking: (id: string) => onOpen({ sub: 'bookings', target: id }), onFlights: () => onOpen({ sub: 'flights' }) };
  return (
    <section className="body rt" aria-label="Route">
      {next && <button type="button" className="rt-next" onClick={() => onOpen(next.open)}>{COPY.next}: {next.label}</button>}
      {before && model.plan && (
        <p className="rt-count">{model.start ? `Trip starts ${dateLabel(model.start)} · ` : ''}{model.plan.days.length} days, about {model.plan.travelHours.toFixed(1)} h driving</p>
      )}
      <TripViewBody
        key={todayDay ?? 0} model={model} items={items} legs={legs} todayDay={todayDay} {...doors}
        todayCard={todayDay ? <TodayScreen group={group} today={today} {...doors} /> : undefined}
      />
      <div className="rt-links">
        {reveal && <button type="button" className="rt-link" onClick={reveal}>{COPY.reveal}</button>}
        <PlanSave group={group} />
      </div>
    </section>
  );
}
