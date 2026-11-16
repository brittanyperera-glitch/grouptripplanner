import { useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { IconLeft } from '../components/Icons';
import { addDays } from '../lib/calendar';
import { isAdmin } from '../lib/override';
import { releaseFor } from '../lib/release';
import { nightsNote, stayCtx } from '../lib/stayflow';
import { adminChecklist } from '../lib/tripadmin';
import { effectiveRelease, releaseState } from '../lib/tripPlan';
import { useApp } from '../state';
import { readAdminKey } from '../store/tripKey';
import { AREAS, PEOPLE } from '../types';
import type { Area, BookingDates, DayEdit, Pace, Person, ReleasePlan } from '../types';
import { useGroupResult } from '../workers/usePlan';
import './Organiser.css';

// Days.tsx holds the same bounds privately, outside this screen's files.
const MIN_DAYS = 5, MAX_DAYS = 21;
const PACES: Record<Pace, string> = { 0: 'Pack it in', 1: 'Balanced', 2: 'Slow' };
const TITLE_MAX = 60, NOTE_MAX = 200, MAX_STOP_HOURS = 12;

const COPY = {
  title: 'Organiser',
  back: 'Back',
  sub: 'Only you see this. Changes reach everyone once saved.',
  pwLabel: 'Organiser password',
  unlock: 'Unlock',
  wrong: "That's not it",
  offline: "Couldn't reach the server. Try again",
  checking: 'Checking',
  saved: 'Saved',
  failed: "Couldn't save",
  noRoute: 'No route is set yet.',
};

const ok = (v: string) => v === '' || addDays(v, 0) !== null;
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' });
};

function Section({ title, line, children }: { title: string; line: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="og-sec">
      <button type="button" className="og-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <span className="og-title">{title}</span>{' '}<span className="og-line">{line}</span>
      </button>
      {open && <div id={id} className="og-body">{children}</div>}
    </section>
  );
}

function Gate({ onOk }: { onOk: () => void }) {
  const { setAdminKey } = useApp();
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<'idle' | 'checking' | 'wrong' | 'offline'>('idle');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (!key || phase === 'checking') return;
    setPhase('checking');
    try {
      if (await setAdminKey(key)) onOk(); else setPhase('wrong');
    } catch { setPhase('offline'); }
  };
  return (
    <form className="og-gate" onSubmit={submit}>
      <label className="og-field">
        <span className="og-fl">{COPY.pwLabel}</span>
        <input className="field" type="password" autoComplete="off" value={value} onChange={e => { setValue(e.target.value); if (phase !== 'checking') setPhase('idle'); }} aria-invalid={phase === 'wrong'} />
      </label>
      <p className="og-msg" role="alert">{phase === 'wrong' ? COPY.wrong : phase === 'offline' ? COPY.offline : ''}</p>
      <button type="submit" className="cta" disabled={!value.trim() || phase === 'checking'}>{phase === 'checking' ? COPY.checking : COPY.unlock}</button>
    </form>
  );
}

type Run = (p: Promise<void>) => void;

function StartDate({ value, run }: { value: string | null; run: Run }) {
  const { saveTripSettings } = useApp();
  const [v, setV] = useState(value ?? '');
  return (
    <form className="og-form" onSubmit={e => { e.preventDefault(); run(saveTripSettings({ startDate: v || null }, v ? `Start date set to ${v}` : 'Start date cleared')); }}>
      <label className="og-field">
        <span className="og-fl">Start date</span>
        <input className="field" type="date" value={v} onChange={e => setV(e.target.value)} />
      </label>
      <button type="submit" className="cta" disabled={v === (value ?? '') || !ok(v)}>Save date</button>
    </form>
  );
}

const sameEdit = (a: DayEdit, b: DayEdit) => JSON.stringify(a) === JSON.stringify(b);
/** One short log line for the difference between the saved route and the candidate. */
function describeChange(base: ReleasePlan, next: ReleasePlan, name: (id: string) => string): string {
  const out: string[] = [];
  if (next.days !== base.days) out.push(`${next.days} days`);
  if (next.pace !== base.pace) out.push(`pace ${PACES[next.pace]}`);
  next.items.filter(i => !base.items.includes(i)).forEach(i => out.push(`added ${name(i)}`));
  base.items.filter(i => !next.items.includes(i)).forEach(i => out.push(`removed ${name(i)}`));
  next.dayEdits.filter(e => !base.dayEdits.some(b => sameEdit(b, e))).forEach(e => out.push(e.kind === 'custom' ? `added stop ${e.title} on day ${e.day}` : e.kind === 'move' ? `moved ${name(e.id)} to day ${e.day}` : `hid ${name(e.id)}`));
  base.dayEdits.filter(e => !next.dayEdits.some(n => sameEdit(n, e)) && (e.kind === 'custom' || next.items.includes(e.id))).forEach(e => out.push(e.kind === 'custom' ? `removed stop ${e.title}` : `undid edit of ${name(e.id)}`));
  return `Route: ${out.join(', ') || 'edited'}`;
}

function RouteEditor({ base, run }: { base: ReleasePlan; run: Run }) {
  const { state, items, legs, saveTripSettings } = useApp();
  const [draft, setDraft] = useState(base);
  const baseKey = JSON.stringify(base);
  // A saved route comes back as the new base: the candidate starts again from it.
  useEffect(() => setDraft(base), [baseKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The same call the app makes for the released plan, with the candidate in place of it.
  const { data: group, loading } = useGroupResult(state, items, legs, draft);
  const [pick, setPick] = useState('');
  const [stop, setStop] = useState({ title: '', area: 'Colombo' as Area, hours: '1', day: '1', note: '', book: '' });

  const name = (id: string) => items.find(i => i.id === id)?.name ?? id;
  const set = (p: Partial<ReleasePlan>) => setDraft(d => ({ ...d, ...p }));
  const edits = draft.dayEdits;
  const setEdit = (id: string, e: DayEdit | null) => set({ dayEdits: [...edits.filter(x => x.id !== id), ...(e ? [e] : [])] });
  const dirty = JSON.stringify(draft) !== baseKey;
  const final = group?.final ?? null;

  const remove = (id: string) => set({ items: draft.items.filter(i => i !== id), ruledOut: [...new Set([...draft.ruledOut, id])], dayEdits: edits.filter(e => e.id !== id) });
  const add = () => { if (pick) { set({ items: [...draft.items, pick], ruledOut: draft.ruledOut.filter(i => i !== pick) }); setPick(''); } };
  const hours = Number(stop.hours);
  const stopOk = stop.title.trim() !== '' && hours > 0 && hours <= MAX_STOP_HOURS && Number(stop.day) >= 1 && Number(stop.day) <= draft.days;
  const addStop = (e: FormEvent) => {
    e.preventDefault();
    if (!stopOk) return;
    const n = Math.max(0, ...edits.filter(x => x.kind === 'custom').map(x => Number(x.id.slice(2)) || 0)) + 1;
    const note = stop.note.trim(), book = stop.book.trim();
    set({ dayEdits: [...edits, { kind: 'custom', id: `c:${n}`, day: Number(stop.day), title: stop.title.trim(), area: stop.area, hours, ...(note ? { note } : {}), ...(book ? { book } : {}) }] });
    setStop(s => ({ ...s, title: '', note: '', book: '' }));
  };

  const isOut = (id: string) => base.ruledOut.includes(id) || draft.ruledOut.includes(id);
  const candidates = items.filter(i => !draft.items.includes(i.id)).sort((a, b) => Number(isOut(a.id)) - Number(isOut(b.id)));
  const dayOptions = Array.from({ length: draft.days }, (_, k) => k + 1);

  return (
    <div className="og-route">
      <div className="og-pair">
        <label className="og-field">
          <span className="og-fl">Days</span>
          <input className="field" type="number" min={MIN_DAYS} max={MAX_DAYS} value={draft.days} onChange={e => set({ days: Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(Number(e.target.value)) || MIN_DAYS)) })} />
        </label>
        <label className="og-field">
          <span className="og-fl">Pace</span>
          <select className="field" value={draft.pace} onChange={e => set({ pace: Number(e.target.value) as Pace })}>
            {([0, 1, 2] as Pace[]).map(p => <option key={p} value={p}>{PACES[p]}</option>)}
          </select>
        </label>
      </div>

      <div className="og-preview" aria-label="Preview">
        {loading && !final && <p className="og-msg" role="status">Planning</p>}
        {!final && !loading && <p className="og-msg">Keep at least one place to see the plan.</p>}
        {final && (
          <>
            <p className="og-fit" role="status" data-bad={!final.fits || !!final.forceFailed}>
              {final.fits && !final.forceFailed ? `Every place fits in ${draft.days} days.` : 'Not everything fits. Remove a place or add a day.'}
            </p>
            {group?.warnings && group.warnings.length > 0 && (
              <ul className="og-warn" role="alert">{group.warnings.map(w => <li key={w}>{w}</li>)}</ul>
            )}
            <ol className="og-days">
              {final.days.map(d => (
                <li key={d.n} className="og-day" data-over={d.spare < 0}>
                  <p className="og-dayh">Day {d.n}{d.area ? `, ${d.area}` : ''}: {d.spare < 0 ? `over by ${-d.spare} h` : `${d.spare} h spare`}</p>
                  <ul className="og-rows">
                    {d.entries.filter(e => e.kind === 'activity' && e.itemId).map(e => (
                      <li key={e.itemId} className="og-row">
                        <span className="og-rowname">{e.label} <span className="og-hrs">{e.hours} h</span></span>
                        <select className="field og-sel" aria-label={`Move ${e.label} to day`} value={edits.find(x => x.kind === 'move' && x.id === e.itemId)?.day ?? ''}
                          onChange={ev => setEdit(e.itemId!, ev.target.value ? { kind: 'move', id: e.itemId!, day: Number(ev.target.value) } : null)}>
                          <option value="">Day {d.n}</option>
                          {dayOptions.filter(n => n !== d.n).map(n => <option key={n} value={n}>Day {n}</option>)}
                        </select>
                        <button type="button" className="og-btn" aria-label={`Hide ${e.label}`} onClick={() => setEdit(e.itemId!, { kind: 'hide', id: e.itemId! })}>Hide</button>
                        <button type="button" className="og-btn" aria-label={`Remove ${e.label}`} onClick={() => remove(e.itemId!)}>Remove</button>
                      </li>
                    ))}
                    {edits.filter(e => e.kind === 'custom' && e.day === d.n).map(e => (
                      <li key={e.id} className="og-row">
                        <span className="og-rowname">{e.title} <span className="og-hrs">{e.hours} h, your stop</span></span>
                        <button type="button" className="og-btn" aria-label={`Remove stop ${e.title}`} onClick={() => setEdit(e.id, null)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </>
        )}
        {edits.filter(e => e.kind === 'custom' && (e.day ?? 0) > draft.days).map(e => (
          <p key={e.id} className="og-msg">
            {e.title} is on day {e.day}. <button type="button" className="og-btn" aria-label={`Remove stop ${e.title}`} onClick={() => setEdit(e.id, null)}>Remove</button>
          </p>
        ))}
      </div>

      {edits.some(e => e.kind === 'hide') && (
        <ul className="og-rows" aria-label="Hidden places">
          {edits.filter(e => e.kind === 'hide').map(e => (
            <li key={e.id} className="og-row"><span className="og-rowname">{name(e.id)}, hidden</span><button type="button" className="og-btn" aria-label={`Show ${name(e.id)}`} onClick={() => setEdit(e.id, null)}>Show</button></li>
          ))}
        </ul>
      )}

      <div className="og-pair">
        <label className="og-field">
          <span className="og-fl">Add a place</span>
          <select className="field" value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">Choose</option>
            {candidates.map(i => <option key={i.id} value={i.id}>{i.name}{isOut(i.id) ? ' (ruled out)' : ''}</option>)}
          </select>
        </label>
        <button type="button" className="cta alt og-go" disabled={!pick} onClick={add}>Add place</button>
      </div>

      <form className="og-form" onSubmit={addStop}>
        <label className="og-field"><span className="og-fl">Stop title</span><input className="field" maxLength={TITLE_MAX} value={stop.title} onChange={e => setStop(s => ({ ...s, title: e.target.value }))} /></label>
        <div className="og-pair">
          <label className="og-field"><span className="og-fl">Stop area</span>
            <select className="field" value={stop.area} onChange={e => setStop(s => ({ ...s, area: e.target.value as Area }))}>{AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select>
          </label>
          <label className="og-field"><span className="og-fl">Stop day</span>
            <select className="field" value={stop.day} onChange={e => setStop(s => ({ ...s, day: e.target.value }))}>{dayOptions.map(n => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <label className="og-field"><span className="og-fl">Stop hours</span>
            <input className="field" type="number" min={0.25} max={MAX_STOP_HOURS} step={0.25} value={stop.hours} onChange={e => setStop(s => ({ ...s, hours: e.target.value }))} />
          </label>
        </div>
        <label className="og-field"><span className="og-fl">Stop note</span><input className="field" maxLength={NOTE_MAX} value={stop.note} onChange={e => setStop(s => ({ ...s, note: e.target.value }))} /></label>
        <label className="og-field"><span className="og-fl">Booking note (optional)</span><input className="field" maxLength={NOTE_MAX} value={stop.book} onChange={e => setStop(s => ({ ...s, book: e.target.value }))} /></label>
        <button type="submit" className="cta alt" disabled={!stopOk}>Add stop</button>
      </form>

      <div className="og-actions">
        <button type="button" className="cta" disabled={!dirty || loading || draft.items.length === 0}
          onClick={() => run(saveTripSettings({ plan: draft }, describeChange(base, draft, name)))}>Save route</button>
        {dirty && <button type="button" className="cta alt" onClick={() => setDraft(base)}>Discard changes</button>}
      </div>
    </div>
  );
}

function BookingRow({ id, label, run }: { id: string; label: string; run: Run }) {
  const { state, claimBooking, saveTripSettings } = useApp();
  const stored = state.tripSettings?.bookingDates ?? {};
  const [d, setD] = useState<BookingDates>(stored[id] ?? {});
  const valid = ok(d.opensOn ?? '') && ok(d.bookBy ?? '');
  const clean: BookingDates = { ...(d.opensOn ? { opensOn: d.opensOn } : {}), ...(d.bookBy ? { bookBy: d.bookBy } : {}) };
  const save = () => {
    const { [id]: _drop, ...rest } = stored;
    void _drop;
    run(saveTripSettings({ bookingDates: Object.keys(clean).length ? { ...rest, [id]: clean } : rest }, `Booking dates for ${label}`));
  };
  return (
    <li className="og-book">
      <p className="og-rowname">{label}</p>
      <label className="og-field">
        <span className="og-fl">Owner</span>
        <select className="field" aria-label={`Owner of ${label}`} value={state.bookingClaims?.[id]?.owner ?? ''}
          onChange={e => run(claimBooking(id, (e.target.value || null) as Person | null))}>
          <option value="">Nobody</option>
          {PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <div className="og-pair">
        <label className="og-field"><span className="og-fl">Opens on</span><input className="field" type="date" value={d.opensOn ?? ''} onChange={e => setD(x => ({ ...x, opensOn: e.target.value }))} /></label>
        <label className="og-field"><span className="og-fl">Book by</span><input className="field" type="date" value={d.bookBy ?? ''} onChange={e => setD(x => ({ ...x, bookBy: e.target.value }))} /></label>
      </div>
      <button type="button" className="cta alt" disabled={!valid || JSON.stringify(clean) === JSON.stringify(stored[id] ?? {})} onClick={save}>Save dates</button>
    </li>
  );
}

function Panel({ onBack }: { onBack?: () => void }) {
  const { state, me, items, legs, needsAdminKey } = useApp();
  const [msg, setMsg] = useState('');
  const run: Run = p => { setMsg(''); p.then(() => setMsg(COPY.saved), () => setMsg(COPY.failed)); };
  const settings = state.tripSettings ?? null;
  const base = useMemo(() => effectiveRelease(releaseState(state.tripSettings), releaseFor(me), null), [state.tripSettings, me]);
  const { data: current } = useGroupResult(state, items, legs, base);

  const plan = current?.final ?? null;
  const ctx = me && plan ? stayCtx(state, me, plan) : null;
  const nights = ctx ? ctx.areas.flatMap(a => { const n = nightsNote(ctx, a); return n ? [{ area: a, note: n }] : []; }) : [];
  const bookings = me && plan ? adminChecklist(state, me, plan) : [];
  const log = [...(settings?.overrides ?? [])].reverse();

  return (
    <section className="body og" aria-label={COPY.title}>
      {onBack && <div className="og-bar"><button type="button" className="og-back" aria-label={COPY.back} onClick={onBack}><IconLeft size={20} /></button></div>}
      <h2 className="big display small og-h">{COPY.title}</h2>
      <p className="sub">{COPY.sub}</p>
      {needsAdminKey && <Gate onOk={() => setMsg('')} />}
      <p className="og-msg" role="status">{msg}</p>

      <Section title="Start date" line={settings?.startDate ?? 'Not set'}><StartDate value={settings?.startDate ?? null} run={run} /></Section>
      <Section title="Route" line={base ? `${base.days} days, ${PACES[base.pace]}, ${base.items.length} places` : COPY.noRoute}>
        {base ? <RouteEditor base={base} run={run} /> : <p className="og-msg">{COPY.noRoute}</p>}
      </Section>
      <Section title="Overrides log" line={log.length ? `${log.length} ${log.length === 1 ? 'change' : 'changes'}` : 'No changes yet'}>
        {log.length === 0 ? <p className="og-msg">Nothing changed yet.</p> : (
          <ul className="og-rows">{log.map((o, k) => <li key={`${o.at}:${k}`} className="og-log"><time dateTime={o.at}>{when(o.at)}</time> <span>{o.what}</span></li>)}</ul>
        )}
      </Section>
      <Section title="Nights note" line={nights.length ? `${nights.length} to check` : 'Nights match the plan'}>
        {nights.length === 0 ? <p className="og-msg">Stay nights match the itinerary.</p> : (
          <ul className="og-rows">{nights.map(n => <li key={n.area} className="og-log"><strong>{n.area}</strong> <span>{n.note}</span></li>)}</ul>
        )}
      </Section>
      <Section title="Bookings" line={bookings.length ? `${bookings.length} to look after` : 'None yet'}>
        {bookings.length === 0 ? <p className="og-msg">Bookings appear once the route is set.</p> : (
          <ul className="og-rows">{bookings.map(b => <BookingRow key={b.id} id={b.id} label={b.label} run={run} />)}</ul>
        )}
      </Section>
    </section>
  );
}

/** Brittany's panel. A friend gets nothing, not even the password prompt. */
export default function Organiser({ onBack }: { onBack?: () => void }) {
  const { me } = useApp();
  const [verified, setVerified] = useState(false);
  if (!isAdmin(me)) return null;
  if (!verified && readAdminKey() === null) return <section className="body og"><h2 className="big display small og-h">{COPY.title}</h2><Gate onOk={() => setVerified(true)} /></section>;
  return <Panel onBack={onBack} />;
}
