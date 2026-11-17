import { useState } from 'react';
import Avatar from '../components/Avatar';
import { IconCheck, IconLeft } from '../components/Icons';
import { routePlan } from '../lib/openItems';
import { releaseFor } from '../lib/release';
import { adminChecklist, adminOutstanding, doneBy, FIELD_MAX, toggleDone, visibleEntry, withDetails } from '../lib/tripadmin';
import type { AdminDef } from '../lib/tripadmin';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { DayBooking, GroupResult, Person, Player } from '../types';
import { useGroupResult } from '../workers/usePlan';
import { useTripModel } from './useTripModel';
import './TripAdmin.css';

const COPY = {
  title: 'Trip admin',
  back: 'Back',
  sub: 'Tick what you have sorted. The group sees who is done. Prices and notes are shown only to you in the app.',
  groupEmpty: 'Group bookings appear once the route is set and each stay is decided.',
  nobody: 'Nobody yet',
  details: 'Details',
  save: 'Save',
  price: 'Price',
  note: 'Note',
  private: 'Not secret: anyone with the trip password can read this.',
  loading: 'Loading',
  claim: "I'll book this",
  calendar: 'Add to calendar',
};

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDate = (d: string) => DATE.format(new Date(`${d}T00:00:00Z`));
/** Chip text for a booking; no status is shown for a bookable thing with nothing to count from yet. */
function chipText(b: DayBooking): string {
  switch (b.status) {
    case 'done': return 'Done';
    case 'overdue': return 'Overdue';
    case 'not-open': return b.opensOn ? `Opens ${shortDate(b.opensOn)}` : 'Not open yet';
    case 'open': return b.bookBy ? `Book by ${shortDate(b.bookBy)}` : 'Open';
    default: return 'No date yet';
  }
}
/** Earliest date the booking needs action; undated bookings sort last. */
const when = (b: DayBooking | undefined) => b?.bookBy ?? b?.opensOn ?? '9999';

async function saveIcs(text: string) {
  const file = new File([text], 'homecoming.ics', { type: 'text/calendar' });
  const a = document.createElement('a');
  if (!('download' in a) && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Sri Lanka, Dec 2026' }); } catch { /* cancelled */ }
    return;
  }
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Who({ people, id }: { people: Player[]; id: string }) {
  if (people.length === 0) return <span className="ta-none">{COPY.nobody}</span>;
  return (
    <ul className="ta-who" aria-label={`Done by ${people.join(', ')}`}>
      {people.map(p => <li key={`${id}:${p}`} title={p}><Avatar name={p} size={22} /></li>)}
    </ul>
  );
}

/**
 * The booking checklist: places and stays the group needs to book. Everyone sees who ticked what; price, reference and note
 * are shown only to the person who entered them. That is the UI only: the table is readable by anyone with the shared trip password.
 */
export default function TripAdmin({ onBack, today }: { onBack: () => void; today?: string }) {
  const { state, me, store, items, legs, claimBooking } = useApp();
  const { data: group, loading } = useGroupResult(state, items, legs, releaseFor(me));
  // A route reopened by a late vote still has its bookings, so the model reads the same plan as the checklist.
  const model = useTripModel({ ...group, final: routePlan(group, state) } as GroupResult, today);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ price: '', note: '' });
  if (!me) return null;
  // The route is unknown until the worker answers; rendering then would flash the empty text.
  const pending = loading && group === null;

  const booking = new Map(model.bookings.map(b => [b.id, b]));
  const list = adminChecklist(state, me, routePlan(group, state)).sort((a, b) => when(booking.get(a.id)).localeCompare(when(booking.get(b.id))));
  const entry = (id: string) => visibleEntry(me, me, state.tripAdmin?.[me]?.items[id]);
  const left = list.filter(d => doneBy(state, d.id).length === 0).length;

  const tick = (d: AdminDef, done: boolean) => {
    void store.saveTripAdmin(me, { [d.id]: toggleDone(entry(d.id), done, new Date().toISOString()) });
  };
  const edit = (d: AdminDef) => {
    if (open === d.id) { setOpen(null); return; }
    const e = entry(d.id);
    setForm({ price: e?.price ?? '', note: e?.note ?? '' });
    setOpen(d.id);
  };
  const save = (d: AdminDef) => {
    void store.saveTripAdmin(me, { [d.id]: withDetails(entry(d.id), form) });
    setOpen(null);
  };

  const claimUi = (d: AdminDef, b: DayBooking) => {
    const mine = me as Person;
    if (!PEOPLE.includes(mine)) return null;
    if (!b.owner) return <button type="button" className="ta-claim" onClick={() => void claimBooking(d.id, mine)}>{COPY.claim}</button>;
    if (b.owner !== mine) return <span className="ta-owner" title={b.owner}><Avatar name={b.owner} size={22} /></span>;
    return <button type="button" className="ta-owner" title={b.owner} aria-label={`Unclaim: ${d.label}`} onClick={() => void claimBooking(d.id, null)}><Avatar name={b.owner} size={22} /></button>;
  };

  const row = (d: AdminDef) => {
    // The same fallen-freshness rule as doneBy: a tick from before the stay fell is not mine any more.
    const mineDone = doneBy(state, d.id).includes(me);
    const done = doneBy(state, d.id).length > 0;
    const b = booking.get(d.id);
    const mineEntry = entry(d.id);
    const saved = [mineEntry?.price].filter(Boolean).join(', ');
    return (
      <li key={d.id} className="ta-row" data-done={done}>
        <button type="button" role="checkbox" aria-checked={mineDone} aria-label={d.label} className="ta-box" onClick={() => tick(d, !mineDone)}>
          {mineDone && <IconCheck size={18} />}
        </button>
        <div className="ta-main">
          <p className="ta-label">{d.label}</p>
          <p className="ta-hint">{d.info ? `${d.hint} ${d.info}` : d.hint}</p>
          <div className="ta-status">
            {b && <span className="ta-chip" data-status={b.status}>{chipText(b)}</span>}
            {b && claimUi(d, b)}
            <Who people={doneBy(state, d.id)} id={d.id} />
            {saved && <span className="ta-saved">{saved}</span>}
          </div>
          {open === d.id && (
            <form className="ta-form" onSubmit={e => { e.preventDefault(); save(d); }}>
              {(['price', 'note'] as const).map(k => (
                <label key={k} className="ta-field">
                  <span className="ta-fl">{COPY[k]}</span>
                  <input className="field" maxLength={FIELD_MAX[k]} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </label>
              ))}
              <p className="ta-priv">{COPY.private}</p>
              <button type="submit" className="cta">{COPY.save}</button>
            </form>
          )}
        </div>
        <button type="button" className="ta-more" aria-expanded={open === d.id} aria-label={`${COPY.details}: ${d.label}`} onClick={() => edit(d)}>{COPY.details}</button>
      </li>
    );
  };

  return (
    <section className="body ta" aria-label={COPY.title}>
      <div className="ta-bar">
        <button type="button" className="ta-back" aria-label={COPY.back} onClick={onBack}><IconLeft size={20} /></button>
      </div>
      <h2 className="big display small ta-h">{COPY.title}</h2>
      <p className="sub">{COPY.sub}</p>
      {model.start && <button type="button" className="ta-cal" onClick={() => void saveIcs(model.icsText())}>{COPY.calendar}</button>}
      {pending && <p className="empty" role="status">{COPY.loading}</p>}
      {!pending && list.length > 0 && <p className="ta-count" role="status">{left === 0 ? 'All done' : `${left} still to do`}</p>}
      {pending ? null : list.length === 0 ? <p className="empty">{COPY.groupEmpty}</p> : <ul className="ta-list">{list.map(row)}</ul>}
    </section>
  );
}

/**
 * The one entry point on Group trip and My trip: how many items are left for me, and a tap to open the page.
 * Counts from the same route as the page (routePlan); My trip has no group yet and passes null.
 */
export function TripAdminLink({ group, onOpen }: { group: GroupResult | null; onOpen: () => void }) {
  const { state, me } = useApp();
  if (!me) return null;
  const plan = routePlan(group, state);
  if (adminChecklist(state, me, plan).length === 0) return null;
  const n = adminOutstanding(me, state, plan).length;
  return (
    <button type="button" className="ta-link" onClick={onOpen}>
      <span className="ta-link-name">{COPY.title}</span>
      <span className="ta-link-n">{n === 0 ? 'All done' : `${n} to do`}</span>
    </button>
  );
}
