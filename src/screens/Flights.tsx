import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar';
import { arrivalFlags } from '../lib/arrivals';
import { releaseFor } from '../lib/release';
import { useApp } from '../state';
import { isGuest, PEOPLE } from '../types';
import type { Person, Traveller } from '../types';
import { useGroupResult } from '../workers/usePlan';
import './Flights.css';

const COPY = {
  title: 'Flights',
  sub: 'Everyone sees everyone\'s flights. You can only change your own. Times are Sri Lanka local.',
  arrival: 'Arrival',
  departure: 'Departure',
  date: 'date',
  time: 'time',
  flight: 'flight',
  none: 'Not entered',
  save: 'Save',
  saved: 'Saved',
  unsaved: "Not saved yet, will retry when you're online",
  half: 'Fill in both the date and the time, or clear both.',
};

type Travellers = Partial<Record<Person, Traveller>>;
type Patch = Pick<Traveller, 'arriveLocal' | 'arriveFlight' | 'departLocal' | 'departFlight'>;
export interface FlightsProps { me: Person; travellers: Travellers; startDate: string | null; days: number | null; onSave(patch: Patch): Promise<boolean> }

// supabase/schema.sql checks char_length(flight) <= 12 on both flight columns.
const FLIGHT_MAX = 12;
const split = (t: string | null | undefined) => ({ date: t?.slice(0, 10) ?? '', time: t?.slice(11, 16) ?? '' });
// A date or a time alone is not a moment: it is stored as unset rather than guessed.
const join = (date: string, time: string) => (date && time ? `${date}T${time}` : null);
const half = (p: { date: string; time: string }) => !!p.date !== !!p.time;
const show = (t: string | null | undefined, flight: string | null | undefined) => (t || flight ? [t?.replace('T', ' '), flight].filter(Boolean).join(' · ') : COPY.none);

const formOf = (t: Traveller | undefined) => ({ a: split(t?.arriveLocal), aF: t?.arriveFlight ?? '', d: split(t?.departLocal), dF: t?.departFlight ?? '' });

function MyRow({ mine, onSave }: { mine: Traveller | undefined; onSave: FlightsProps['onSave'] }) {
  const [f, setF] = useState(() => formOf(mine));
  const [status, setStatus] = useState<'saved' | 'unsaved' | null>(null);
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
  const field = (label: string, type: string, value: string, set: (v: string) => void) => (
    <label className="fx-field">
      <span className="fx-fl">{label}</span>
      <input className="field fx-in" type={type} aria-label={label} maxLength={type === 'text' ? FLIGHT_MAX : undefined} value={value} onChange={e => { setStatus(null); setBad(false); set(e.target.value); }} />
    </label>
  );
  const submit = () => {
    // Saving a half pair would store null and silently erase the moment already on file.
    if (half(f.a) || half(f.d)) { setBad(true); return; }
    // Cut by code point, as the column counts them; maxLength does not stop a value set by autofill.
    const flight = (s: string) => [...s.trim()].slice(0, FLIGHT_MAX).join('').trim() || null;
    void onSave({ arriveLocal: join(f.a.date, f.a.time), arriveFlight: flight(f.aF), departLocal: join(f.d.date, f.d.time), departFlight: flight(f.dF) }).then(ok => setStatus(ok ? 'saved' : 'unsaved'));
  };
  return (
    <form className="fx-form" onSubmit={e => { e.preventDefault(); submit(); }}>
      {([[COPY.arrival, 'a', 'aF'], [COPY.departure, 'd', 'dF']] as const).map(([name, k, kF]) => (
        <fieldset key={k} className="fx-set">
          <legend className="fx-fl">{name}</legend>
          {field(`${name} ${COPY.date}`, 'date', f[k].date, v => setF(s => ({ ...s, [k]: { ...s[k], date: v } })))}
          {field(`${name} ${COPY.time}`, 'time', f[k].time, v => setF(s => ({ ...s, [k]: { ...s[k], time: v } })))}
          {field(`${name} ${COPY.flight}`, 'text', f[kF], v => setF(s => ({ ...s, [kF]: v })))}
        </fieldset>
      ))}
      <button type="submit" className="cta fx-save">{COPY.save}</button>
      {bad && <span className="fx-bad" role="alert">{COPY.half}</span>}
      {status && <span className="fx-saved" role="status">{status === 'saved' ? COPY.saved : COPY.unsaved}</span>}
    </form>
  );
}

/** Everyone's flights, only my own row editable. Only this screen shows the arrival and departure flags; `days` is the trip length the plan uses (group.days). */
export function Flights({ me, travellers, startDate, days, onSave }: FlightsProps) {
  const flags = arrivalFlags(travellers, startDate, days).filter(x => x.kind !== 'missing');
  return (
    <section className="body fx" aria-label={COPY.title}>
      <h2 className="big display small fx-h">{COPY.title}</h2>
      <p className="sub">{COPY.sub}</p>
      <ul className="fx-list" aria-label={COPY.title}>
        {PEOPLE.map(p => {
          const t = travellers[p];
          return (
            <li key={p} className="fx-row" aria-label={p}>
              <div className="fx-who"><Avatar name={p} size={28} /><span className="fx-name">{p}</span></div>
              {flags.filter(x => x.name === p).map(x => <p key={x.kind} className="fx-flag">{x.text}</p>)}
              {p === me ? <MyRow mine={t} onSave={onSave} /> : (
                <>
                  <p className="fx-line"><span className="fx-fl">{COPY.arrival}</span> {show(t?.arriveLocal, t?.arriveFlight)}</p>
                  <p className="fx-line"><span className="fx-fl">{COPY.departure}</span> {show(t?.departLocal, t?.departFlight)}</p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function FlightsScreen() {
  const { me, state, items, legs, saveTraveller } = useApp();
  // Until the plan has run, days is null and the 'leaves before last day' flag stays off rather than guess.
  const { data: group } = useGroupResult(state, items, legs, state.tripSettings?.plan ?? releaseFor(me));
  if (!me || isGuest(me)) return null;
  const days = group?.days ?? null;
  return <Flights me={me} travellers={state.travellers ?? {}} startDate={state.tripSettings?.startDate ?? null} days={days} onSave={patch => saveTraveller(me, patch)} />;
}
