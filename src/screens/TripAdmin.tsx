import { useRef, useState } from 'react';
import Avatar from '../components/Avatar';
import { IconCheck, IconLeft } from '../components/Icons';
import SpyScreen from '../components/spy/SpyScreen';
import Stamp from '../components/spy/Stamp';
import { spyActive } from '../lib/missions';
import { routePlan } from '../lib/openItems';
import { releaseFor } from '../lib/release';
import { isAdmin } from '../lib/override';
import { outcome, STAY_COPY, stayCtx } from '../lib/stayflow';
import { adminChecklist, adminOutstanding, doneBy, FIELD_MAX, stayItemId, toggleDone, visibleEntry, withDetails } from '../lib/tripadmin';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { DayBooking, GroupResult, Person, Player } from '../types';
import { useGroupResult } from '../workers/usePlan';
import { deadlineTag } from './bookingText';
import { useSaveStatus } from './saveStatus';
import { useTripModel } from './useTripModel';
import './TripAdmin.css';

const COPY = {
  title: 'Trip admin',
  code: 'Operation Homecoming · Supply runs',
  back: 'Back',
  sub: 'Claim a booking, then mark it secured. The group sees who is on it.',
  groupEmpty: 'Group bookings appear once the route is set and each stay is decided.',
  nobody: 'Nobody yet',
  details: 'Details',
  save: 'Save',
  note: 'Note',
  private: 'Only you see this here; not secret: anyone with the trip password can read it.',
  loading: 'Loading',
  claim: "I'll book this",
  calendar: 'Add to calendar',
  stillWaiting: 'Waiting on replacement stays',
};

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
  return (
    <ul className="ta-who" aria-label={`Done by ${people.join(', ')}`}>
      {people.map(p => <li key={`${id}:${p}`} title={p}><Avatar name={p} size={22} /></li>)}
    </ul>
  );
}

export interface SupplyRow {
  id: string; label: string; hint: string; booking?: DayBooking;
  /** A stay with no decided option yet: shown so the area is not missing, with nothing to claim or tick. */
  waiting?: string;
  done: Player[]; mine: boolean; note: string; saved: string;
}
export interface SupplyProps {
  spy: boolean; pending: boolean; rows: SupplyRow[]; left: number; me: Person | null; hasCalendar: boolean;
  onBack(): void; onCalendar(): void;
  onTick(id: string, done: boolean): void; onClaim(id: string, owner: Person | null): void; onNote(id: string, note: string): void;
}

/** The booking checklist as props in, markup out: Supply runs while the missions are live, the plain postcard list after. */
export function SupplyBoard(p: SupplyProps) {
  const { spy, me } = p;
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // A stamp is the quiet mark in the postcard look.
  const mark = (text: string, quiet = false) => (spy ? <Stamp text={text} tone={quiet ? 'quiet' : 'accent'} /> : <span className="ta-mark">{text}</span>);
  const claimable = (r: SupplyRow) => me !== null && !r.waiting && !!r.booking && !r.booking.owner && r.done.length === 0;
  // One bright thing per screen: only the most urgent claim carries the accent.
  const primary = p.rows.find(claimable)?.id;
  const btn = (id: string) => (spy ? `ta-claim spy-btn${id === primary ? ' spy-btn-solid' : ''}` : 'ta-claim');

  const status = (r: SupplyRow) => {
    const owner = r.booking?.owner ?? null;
    if (r.done.length > 0) return <>{mark('Secured')}{' '}<span className="ta-by">by {r.done.join(', ')}</span><Who people={r.done} id={r.id} /></>;
    if (owner === null) return <><span className="ta-none">{COPY.nobody}</span>{me && claimable(r) && <button type="button" className={btn(r.id)} onClick={() => p.onClaim(r.id, me)}>{COPY.claim}</button>}</>;
    const who = <><Avatar name={owner} size={22} />{mark(owner, true)}{' '}<span className="ta-by">{owner === me ? 'is booking, tap to undo' : 'is booking'}</span></>;
    return owner === me
      ? <button type="button" className="ta-owner" title={owner} aria-label={`Unclaim: ${r.label}`} onClick={() => p.onClaim(r.id, null)}>{who}</button>
      : <span className="ta-owner" title={owner}>{who}</span>;
  };

  const row = (r: SupplyRow) => {
    if (r.waiting) {
      return (
        <li key={r.id} className="ta-row ta-wait" data-done="false">
          <div className="ta-main"><p className="ta-label">{r.label}</p><p className="ta-hint">{r.waiting}</p></div>
        </li>
      );
    }
    return (
      <li key={r.id} className="ta-row" data-done={r.done.length > 0}>
        <button type="button" role="checkbox" aria-checked={r.mine} aria-label={r.label} className="ta-box" onClick={() => p.onTick(r.id, !r.mine)}>
          {r.mine && <IconCheck size={18} />}
        </button>
        <div className="ta-main">
          <p className="ta-label">{r.label}</p>
          <p className="ta-hint">{r.hint}</p>
          <div className="ta-status">
            {r.booking && r.done.length === 0 && <span className="ta-chip" data-status={r.booking.status}>{deadlineTag(r.booking)}</span>}
            {status(r)}
            {r.saved && <span className="ta-saved" aria-live="polite">{r.saved}</span>}
          </div>
          {open === r.id && (
            <form className="ta-form" onSubmit={e => { e.preventDefault(); p.onNote(r.id, note); setOpen(null); }}>
              <label className="ta-field">
                <span className="ta-fl">{COPY.note}</span>
                <input className="field" maxLength={FIELD_MAX.note} value={note} onChange={e => setNote(e.target.value)} />
              </label>
              <p className="ta-priv">{COPY.private}</p>
              <button type="submit" className={spy ? 'spy-btn' : 'cta'}>{COPY.save}</button>
            </form>
          )}
        </div>
        <button type="button" className="ta-more" aria-expanded={open === r.id} aria-label={`${COPY.details}: ${r.label}`} onClick={() => { setNote(r.note); setOpen(open === r.id ? null : r.id); }}>{COPY.details}</button>
      </li>
    );
  };

  const body = (
    <>
      {p.hasCalendar && <button type="button" className="ta-cal" onClick={p.onCalendar}>{COPY.calendar}</button>}
      {p.pending && <p className="empty" role="status">{COPY.loading}</p>}
      {!p.pending && p.rows.length > 0 && <p className="ta-count" role="status">{p.left > 0 ? `${p.left} still to do` : p.rows.some(r => r.waiting) ? COPY.stillWaiting : 'All done'}</p>}
      {p.pending ? null : p.rows.length === 0 ? <p className="empty">{COPY.groupEmpty}</p> : <ul className="ta-list">{p.rows.map(row)}</ul>}
    </>
  );
  if (spy) {
    return (
      <SpyScreen code={COPY.code} title={COPY.title} back={{ label: COPY.back, onClick: p.onBack }}>
        <div className="ta ta-spy"><p className="ta-sub">{COPY.sub}</p>{body}</div>
      </SpyScreen>
    );
  }
  return (
    <section className="body ta" aria-label={COPY.title}>
      <div className="ta-bar">
        <button type="button" className="ta-back" aria-label={COPY.back} onClick={p.onBack}><IconLeft size={20} /></button>
      </div>
      <h2 className="big display small ta-h">{COPY.title}</h2>
      <p className="sub">{COPY.sub}</p>
      {body}
    </section>
  );
}

/** The container: reads the app, works out the rows, and wires each control to its save. Everyone sees who ticked what; a note is shown only to whoever wrote it. */
export default function TripAdmin({ onBack, today }: { onBack: () => void; today?: string }) {
  const { state, me, store, items, legs, claimBooking, error } = useApp();
  const { data: group, loading } = useGroupResult(state, items, legs, releaseFor(me));
  // A route reopened by a late vote still has its bookings, so the model reads the same plan as the checklist.
  const plan = routePlan(group, state);
  const model = useTripModel({ ...group, final: plan } as GroupResult, today);
  const save = useSaveStatus(error);
  const [lastId, setLastId] = useState('');
  const errRef = useRef(error);
  errRef.current = error;
  if (!me) return null;

  const track = (id: string, p: Promise<boolean>) => { setLastId(id); save.run(p); };
  // The queue resolves a failed write too and raises the app error a moment later, so the error is read after a tick.
  const landed = (p: Promise<void>) => p.then(() => new Promise<boolean>(r => setTimeout(() => r(errRef.current === null), 0)));
  const entry = (id: string) => visibleEntry(me, me, state.tripAdmin?.[me]?.items[id]);
  const put = (id: string, e: NonNullable<ReturnType<typeof entry>>) => track(id, landed(store.saveTripAdmin(me, { [id]: e })));

  const booking = new Map(model.bookings.map(b => [b.id, b]));
  const defs = adminChecklist(state, me, plan).sort((a, b) => when(booking.get(a.id)).localeCompare(when(booking.get(b.id))));
  const ctx = plan ? stayCtx(state, me, plan) : null;
  const replacing = ctx ? ctx.areas.filter(a => outcome(ctx, a).kind === 'replacing') : [];
  const rows: SupplyRow[] = [
    ...defs.map(d => ({
      id: d.id, label: d.label, hint: d.hint, booking: booking.get(d.id), done: doneBy(state, d.id),
      // The same fallen-freshness rule as doneBy: a tick from before the stay fell is not mine any more.
      mine: doneBy(state, d.id).includes(me), note: entry(d.id)?.note ?? '', saved: lastId === d.id ? save.message : '',
    })),
    ...replacing.map(a => ({ id: stayItemId(a), label: `Stay in ${a}`, hint: '', waiting: STAY_COPY.replacing(isAdmin(me), a), done: [], mine: false, note: '', saved: '' })),
  ];
  return (
    <SupplyBoard
      spy={spyActive({ state, plan, model })} pending={loading && group === null} rows={rows}
      left={defs.filter(d => doneBy(state, d.id).length === 0).length}
      me={PEOPLE.includes(me as Person) ? (me as Person) : null} hasCalendar={!!model.start}
      onBack={onBack} onCalendar={() => void saveIcs(model.icsText())}
      onTick={(id, done) => put(id, toggleDone(entry(id), done, new Date().toISOString()))}
      onNote={(id, note) => put(id, withDetails(entry(id), { price: '', note }))}
      onClaim={(id, owner) => track(id, claimBooking(id, owner))}
    />
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
