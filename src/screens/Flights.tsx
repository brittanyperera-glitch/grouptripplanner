import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar';
import SpyScreen from '../components/spy/SpyScreen';
import SubBack from '../components/SubBack';
import { arrivalFlags, flightsDark, leaveByEach } from '../lib/arrivals';
import { WEEKDAY_DAY_MONTH } from '../lib/dates';
import { gameOn } from '../lib/missions';
import { routePlan } from '../lib/openItems';
import { releaseFor } from '../lib/release';
import { useApp } from '../state';
import { isGuest, PEOPLE } from '../types';
import type { Day, GroupResult, Person, Traveller } from '../types';
import { useGroupResult } from '../workers/usePlan';
import { useSaveStatus } from './saveStatus';
import { useTripModel } from './useTripModel';
import './Flights.css';

const COPY = {
  title: 'Flights',
  // The To do card and this screen share the name Flights, so the game heading matches the plain one.
  spyTitle: 'Flights',
  sub: 'Everyone sees everyone\'s flights. You can only change your own. Times are Sri Lanka local.',
  arrival: 'Arrival',
  departure: 'Departure',
  date: 'date',
  time: 'time',
  flight: 'flight',
  none: 'Not entered',
  dark: 'Waiting on flights',
  darkNote: 'No flights yet',
  leaveBy: 'Leave by',
  back: 'Back',
  save: 'Save',
  half: 'Fill in both the date and the time, or clear both.',
};

type Travellers = Partial<Record<Person, Traveller>>;
type Patch = Pick<Traveller, 'arriveLocal' | 'arriveFlight' | 'departLocal' | 'departFlight'>;
/** `lastDay` makes the early-departure flag and each leave-by count the drive to the airport; `appError` is the app's save error, whose clearing marks a queued save as landed. */
export interface FlightsProps {
  me: Person; travellers: Travellers; startDate: string | null; lastDayStart?: string | null; days: number | null; onSave(patch: Patch): Promise<boolean>;
  lastDay?: Day; appError?: string | null; onBack?(): void; spy?: boolean;
  /** The shell's Back: when given it renders the shared Back with `backLabel` instead of this screen's own. */
  back?(): void; backLabel?: string;
}

// supabase/schema.sql checks char_length(flight) <= 12 on both flight columns.
const FLIGHT_MAX = 12;
const split = (t: string | null | undefined) => ({ date: t?.slice(0, 10) ?? '', time: t?.slice(11, 16) ?? '' });
// A date or a time alone is not a moment: it is stored as unset rather than guessed.
const join = (date: string, time: string) => (date && time ? `${date}T${time}` : null);
const half = (p: { date: string; time: string }) => !!p.date !== !!p.time;
// 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm' as "Tue 8 Dec" or "Tue 8 Dec 06:40"; anything that is not a real date stays as it was.
// Date rolls 31 Feb over to 3 Mar without complaint, so a real date is one that survives the round trip.
const ISO = /(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/g;
const when = (s: string) => s.replace(ISO, (all, d: string, t?: string) => {
  const at = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== d ? all : `${WEEKDAY_DAY_MONTH.format(at)}${t ? ` ${t}` : ''}`;
});
const show = (t: string | null | undefined, flight: string | null | undefined) => (t || flight ? [t && when(t), flight].filter(Boolean).join(' · ') : COPY.none);

const formOf = (t: Traveller | undefined) => ({ a: split(t?.arriveLocal), aF: t?.arriveFlight ?? '', d: split(t?.departLocal), dF: t?.departFlight ?? '' });

function MyRow({ mine, onSave, appError }: { mine: Traveller | undefined; onSave: FlightsProps['onSave']; appError: string | null }) {
  const [f, setF] = useState(() => formOf(mine));
  const save = useSaveStatus(appError);
  const [bad, setBad] = useState(false);
  // The stored row can arrive after mount, or change on another device. The form follows it only while it still
  // holds what it last took from the row (or already matches the new row), so typing in progress is never overwritten.
  const stored = JSON.stringify(formOf(mine));
  const [synced, setSynced] = useState(stored);
  useEffect(() => {
    if (stored === synced) return;
    const now = JSON.stringify(f);
    if (now === synced || now === stored) { setF(JSON.parse(stored)); setSynced(stored); }
  }, [stored]); // eslint-disable-line react-hooks/exhaustive-deps
  // The visible label is short because the legend names the leg; the accessible name keeps the leg so the fields stay distinct.
  const field = (shown: string, label: string, type: string, value: string, set: (v: string) => void) => (
    <label className="fx-field">
      <span className="fx-fl">{shown}</span>
      <input className="field fx-in" type={type} aria-label={label} maxLength={type === 'text' ? FLIGHT_MAX : undefined} value={value} onChange={e => { save.clear(); setBad(false); set(e.target.value); }} />
    </label>
  );
  const submit = () => {
    // Saving a half pair would store null and silently erase the moment already on file.
    if (half(f.a) || half(f.d)) { setBad(true); return; }
    // Cut by code point, as the column counts them; maxLength does not stop a value set by autofill.
    const flight = (s: string) => [...s.trim()].slice(0, FLIGHT_MAX).join('').trim() || null;
    save.run(onSave({ arriveLocal: join(f.a.date, f.a.time), arriveFlight: flight(f.aF), departLocal: join(f.d.date, f.d.time), departFlight: flight(f.dF) }));
  };
  return (
    <form className="fx-form" onSubmit={e => { e.preventDefault(); submit(); }}>
      {([[COPY.arrival, 'a', 'aF'], [COPY.departure, 'd', 'dF']] as const).map(([name, k, kF]) => (
        <fieldset key={k} className="fx-set">
          <legend className="fx-fl">{name}</legend>
          {field(COPY.date, `${name} ${COPY.date}`, 'date', f[k].date, v => setF(s => ({ ...s, [k]: { ...s[k], date: v } })))}
          {field(COPY.time, `${name} ${COPY.time}`, 'time', f[k].time, v => setF(s => ({ ...s, [k]: { ...s[k], time: v } })))}
          {field(COPY.flight, `${name} ${COPY.flight}`, 'text', f[kF], v => setF(s => ({ ...s, [kF]: v })))}
        </fieldset>
      ))}
      <button type="submit" className="cta fx-save">{COPY.save}</button>
      {bad && <span className="fx-bad" role="alert">{COPY.half}</span>}
      {save.status && <span className={save.status === 'saved' ? 'fx-saved' : 'fx-bad'} role="status">{save.message}</span>}
    </form>
  );
}

/** Everyone's flights, only my own row editable. Only this screen shows the arrival and departure flags; `days` is the trip length the plan uses (group.days). */
export function Flights({ me, travellers, startDate, lastDayStart, days, onSave, lastDay, appError = null, onBack, spy = false, back, backLabel = COPY.back }: FlightsProps) {
  const shared = back && <SubBack label={backLabel} onClick={back} />;
  const flags = arrivalFlags(travellers, startDate, days, lastDay, lastDayStart).filter(x => x.kind !== 'missing');
  const leave = lastDay ? leaveByEach(travellers, lastDay) : {};
  const list = (
    <ul className="fx-list" aria-label={COPY.title}>
      {PEOPLE.map(p => {
        const t = travellers[p];
        // Dark here means a missing arrival or a missing departure. Someone who gave nothing at all has no lines to show.
        const dark = flightsDark(t);
        const empty = !t?.arriveLocal && !t?.departLocal && !t?.arriveFlight && !t?.departFlight;
        const bare = p !== me && empty;
        return (
          <li key={p} className={dark && p !== me ? 'fx-row fx-dark' : 'fx-row'} aria-label={p}>
            <div className="fx-who"><Avatar name={p} size={28} /><span className="fx-name">{p}</span>{dark && !bare && <span className="fx-tag">{COPY.dark}</span>}</div>
            {flags.filter(x => x.name === p).map(x => <p key={x.kind} className="fx-flag">{when(x.text)}</p>)}
            {p === me ? <MyRow mine={t} onSave={onSave} appError={appError} /> : bare ? <p className="fx-line fx-tag">{COPY.darkNote}</p> : (
              <>
                <p className="fx-line"><span className="fx-fl">{COPY.arrival}</span> {show(t?.arriveLocal, t?.arriveFlight)}</p>
                <p className="fx-line"><span className="fx-fl">{COPY.departure}</span> {show(t?.departLocal, t?.departFlight)}</p>
              </>
            )}
            {leave[p] && <p className="fx-line"><span className="fx-fl">{COPY.leaveBy}</span> {when(leave[p]!)}</p>}
          </li>
        );
      })}
    </ul>
  );
  if (spy) return <SpyScreen code="Operation Homecoming · Flights" title={COPY.spyTitle} back={!back && onBack ? { label: COPY.back, onClick: onBack } : undefined}><section className="fx fx-spy" aria-label={COPY.spyTitle}>{shared}<p className="sub">{COPY.sub}</p>{list}</section></SpyScreen>;
  return (
    <section className="body fx" aria-label={COPY.title}>
      {shared}
      {!back && onBack && <button type="button" className="fx-back" onClick={onBack}>{`‹ ${COPY.back}`}</button>}
      <h2 className="big display small fx-h">{COPY.title}</h2>
      <p className="sub">{COPY.sub}</p>
      {list}
    </section>
  );
}

export default function FlightsScreen({ onBack, back, backLabel }: { onBack?: () => void; back?: () => void; backLabel?: string }) {
  const { me, state, items, legs, saveTraveller, error } = useApp();
  // Until the plan has run, days is null and the 'leaves before last day' flag stays off rather than guess.
  const { data: group } = useGroupResult(state, items, legs, state.tripSettings?.plan ?? releaseFor(me));
  const plan = routePlan(group, state);
  const model = useTripModel({ ...group, final: plan } as GroupResult);
  if (!me || isGuest(me)) return null;
  const days = group?.days ?? null;
  // Spy look only once the plan is known: before that the model is empty and would read as a mission still open.
  const spy = group !== null && gameOn({ state, plan, model });
  return <Flights me={me} travellers={state.travellers ?? {}} startDate={state.tripSettings?.startDate ?? null} lastDayStart={state.tripSettings?.lastDayStart ?? null} days={days} lastDay={plan?.days.at(-1)} appError={error} onBack={onBack} back={back} backLabel={backLabel} spy={spy} onSave={patch => saveTraveller(me, patch)} />;
}
