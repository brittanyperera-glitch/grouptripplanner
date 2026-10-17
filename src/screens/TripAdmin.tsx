import { useState } from 'react';
import Avatar from '../components/Avatar';
import { IconCheck, IconLeft } from '../components/Icons';
import { routePlan } from '../lib/openItems';
import { adminChecklist, adminOutstanding, doneBy, FIELD_MAX, toggleDone, visibleEntry, withDetails } from '../lib/tripadmin';
import type { AdminDef } from '../lib/tripadmin';
import { useApp } from '../state';
import type { GroupResult, Player } from '../types';
import { useGroupResult } from '../workers/usePlan';
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
};

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
export default function TripAdmin({ onBack }: { onBack: () => void }) {
  const { state, me, store, items, legs } = useApp();
  const { data: group, loading } = useGroupResult(state, items, legs);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ price: '', note: '' });
  if (!me) return null;
  // The route is unknown until the worker answers; rendering then would flash the empty text.
  const pending = loading && group === null;

  const list = adminChecklist(state, me, routePlan(group, state));
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

  const row = (d: AdminDef) => {
    const mineDone = entry(d.id)?.done === true;
    const done = doneBy(state, d.id).length > 0;
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
