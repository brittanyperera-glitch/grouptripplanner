import { useEffect, useMemo, useState } from 'react';
import { nightBlocks } from '../lib/calendar';
import { chosenStays, type ChosenStay } from '../lib/chosenStays';
import { dayView } from '../lib/dayView';
import { bookingsByDay } from '../lib/deadlines';
import { tripIcs } from '../lib/ics';
import { flightsDark } from '../lib/arrivals';
import { ADMIN_IDS, claimIsFresh, doneBy, stayItemId } from '../lib/tripadmin';
import { useApp } from '../state';
import { AREAS, PACE_HOURS, PEOPLE } from '../types';
import type { Area, DayBooking, DayView, GroupResult, NightBlock, Person, Plan } from '../types';

export interface TripModel {
  plan: Plan | null; start: string | null; today: string;
  blocks: NightBlock[]; views: DayView[];
  staysByArea: Partial<Record<Area, ChosenStay>>;
  bookings: DayBooking[]; bookingsByDay: Record<number, DayBooking[]>;
  warnings: string[];
  /** Not final yet: no start date, an area with no decided stay, or a booking not done. */
  draft: boolean;
  missing: { flights: Person[]; stays: Area[]; bookings: number; startDate: boolean };
  icsText(): string;
}

/** Today in Sri Lanka as 'YYYY-MM-DD'; en-CA prints the date in that order. */
const colomboToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date());

/** Re-reads the Colombo date once a minute and when the tab returns, so statuses turn over at midnight in an open app. */
function useColomboToday(on: boolean): string {
  const [day, setDay] = useState(colomboToday);
  useEffect(() => {
    if (!on) return;
    const tick = () => setDay(colomboToday());
    const back = () => { if (document.visibilityState === 'visible') tick(); };
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', back);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', back); };
  }, [on]);
  return day;
}

type Live = Pick<ReturnType<typeof useApp>, 'state' | 'me' | 'items'>;

/**
 * The one place app state becomes dated, stay-aware day views; every screen that shows trip days reads it. `today` is for tests.
 */
export function useTripModel(group: GroupResult, today?: string): TripModel {
  const { state, me, items } = useApp();
  const clock = useColomboToday(today === undefined);
  const now = today ?? clock;
  // `items` is liveItems(state), rebuilt every render, so `state` stands for it.
  return useMemo(() => buildModel(group, { state, me, items }, now), [group.final, group.pace, group.warnings, state, me, now]);
}

function buildModel(group: GroupResult, { state, me, items }: Live, now: string): TripModel {
  const plan = group.final;
  const start = state.tripSettings?.startDate ?? null;
  const warnings = [...(group.warnings ?? [])];
  const empty = { plan, start, today: now, warnings, staysByArea: {}, bookingsByDay: {}, bookings: [], blocks: [], views: [] };
  if (!plan) return { ...empty, draft: true, missing: { flights: [...PEOPLE], stays: [], bookings: 0, startDate: start === null }, icsText: () => tripIcs([], []) };

  let blocks: NightBlock[] = [];
  // An organiser edit can leave a night with no area hub; the screens still render, without nights.
  try { blocks = nightBlocks(plan, start); } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    warnings.push(`The nights could not be worked out: ${e.message}`);
  }

  const staysByArea: TripModel['staysByArea'] = {};
  for (const s of chosenStays(state, me, plan)) staysByArea[s.area] = s;
  const fallen = state.stays?.admin.fallen ?? [];
  // A stay's booking belongs to its area's first block, the day of check-in; an area visited twice is still one stay.
  const stayItems = blocks.filter((b, i) => staysByArea[b.area] && blocks.findIndex(x => x.area === b.area) === i)
    .map(b => ({ id: stayItemId(b.area), label: `Stay in ${b.area}`, day: b.fromDay }));
  const owners: Record<string, Person | null> = {};
  for (const [id, claim] of Object.entries(state.bookingClaims ?? {})) {
    const area = AREAS.find(a => stayItemId(a) === id);
    owners[id] = area === undefined || claimIsFresh(claim, fallen, area) ? claim.owner : null;
  }
  const byDay = bookingsByDay({
    plan, start, today: now, items, stayItems, owners, overrides: state.tripSettings?.bookingDates ?? {},
    done: Object.fromEntries(ADMIN_IDS.map(id => [id, doneBy(state, id, fallen).length > 0])),
  });
  const bookings = Object.keys(byDay).map(Number).sort((a, b) => a - b).flatMap(d => byDay[d]);

  const input = {
    plan, start, blocks, bookingsByDay: byDay, travellers: state.travellers ?? {}, paceHours: PACE_HOURS[group.pace],
    stays: Object.fromEntries(Object.entries(staysByArea).map(([area, s]) => [area, { id: stayItemId(area as Area), title: s.title, link: s.link ?? null }])),
    custom: (state.tripSettings?.plan?.dayEdits ?? []).filter(e => e.kind === 'custom'),
  };
  const views = plan.days.map((_, i) => dayView(input, i + 1));

  const missing = {
    flights: PEOPLE.filter(p => flightsDark(state.travellers?.[p])),
    stays: [...new Set(blocks.map(b => b.area))].filter(a => !staysByArea[a]),
    bookings: bookings.filter(b => b.status !== 'done').length,
    startDate: start === null,
  };
  return {
    plan, start, today: now, blocks, views, staysByArea, bookings, bookingsByDay: byDay, warnings,
    draft: missing.startDate || missing.stays.length > 0 || missing.bookings > 0, missing,
    icsText: () => tripIcs(views.flatMap(v => (v.date ? [{ n: v.n, date: v.date, title: `Day ${v.n}${v.area ? ` · ${v.area}` : ''}` }] : [])), bookings),
  };
}
