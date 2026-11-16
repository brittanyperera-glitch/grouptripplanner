import { useState } from 'react';
import Avatar from '../components/Avatar';
import { arrivalFlags } from '../lib/arrivals';
import { releaseFor } from '../lib/release';
import { useApp } from '../state';
import { isGuest, PEOPLE } from '../types';
import type { Person, Traveller } from '../types';
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
};

type Travellers = Partial<Record<Person, Traveller>>;
type Patch = Pick<Traveller, 'arriveLocal' | 'arriveFlight' | 'departLocal' | 'departFlight'>;
export interface FlightsProps { me: Person; travellers: Travellers; startDate: string | null; days: number; onSave(patch: Patch): Promise<void> }

const split = (t: string | null | undefined) => ({ date: t?.slice(0, 10) ?? '', time: t?.slice(11, 16) ?? '' });
// A date or a time alone is not a moment: it is stored as unset rather than guessed.
const join = (date: string, time: string) => (date && time ? `${date}T${time}` : null);
const show = (t: string | null | undefined, flight: string | null | undefined) => (t || flight ? [t?.replace('T', ' '), flight].filter(Boolean).join(' · ') : COPY.none);

function MyRow({ mine, onSave }: { mine: Traveller | undefined; onSave: FlightsProps['onSave'] }) {
  const [f, setF] = useState(() => ({ a: split(mine?.arriveLocal), aF: mine?.arriveFlight ?? '', d: split(mine?.departLocal), dF: mine?.departFlight ?? '' }));
  const [done, setDone] = useState(false);
  const field = (label: string, type: string, value: string, set: (v: string) => void) => (
    <label className="fx-field">
      <span className="fx-fl">{label}</span>
      <input className="field" type={type} aria-label={label} value={value} onChange={e => { setDone(false); set(e.target.value); }} />
    </label>
  );
  const submit = () => {
    const flight = (s: string) => s.trim() || null;
    void onSave({ arriveLocal: join(f.a.date, f.a.time), arriveFlight: flight(f.aF), departLocal: join(f.d.date, f.d.time), departFlight: flight(f.dF) }).then(() => setDone(true));
  };
  return (
    <form className="fx-form" onSubmit={e => { e.preventDefault(); submit(); }}>
      {([['Arrival', 'a', 'aF'], ['Departure', 'd', 'dF']] as const).map(([name, k, kF]) => (
        <fieldset key={k} className="fx-set">
          <legend className="fx-fl">{name === 'Arrival' ? COPY.arrival : COPY.departure}</legend>
          {field(`${name} ${COPY.date}`, 'date', f[k].date, v => setF(s => ({ ...s, [k]: { ...s[k], date: v } })))}
          {field(`${name} ${COPY.time}`, 'time', f[k].time, v => setF(s => ({ ...s, [k]: { ...s[k], time: v } })))}
          {field(`${name} ${COPY.flight}`, 'text', f[kF], v => setF(s => ({ ...s, [kF]: v })))}
        </fieldset>
      ))}
      <button type="submit" className="cta">{COPY.save}</button>
      {done && <span className="fx-saved" role="status">{COPY.saved}</span>}
    </form>
  );
}

/** Everyone's flights, only my own row editable. The flags come from arrivalFlags so they match what Trip admin and the plan say. */
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
              {p === me ? <MyRow key={t?.updatedAt} mine={t} onSave={onSave} /> : (
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
  const { me, state, saveTraveller } = useApp();
  if (!me || isGuest(me)) return null;
  const days = state.tripSettings?.plan?.days ?? releaseFor(me)?.days ?? 9;
  return <Flights me={me} travellers={state.travellers ?? {}} startDate={state.tripSettings?.startDate ?? null} days={days} onSave={patch => saveTraveller(me, patch)} />;
}
