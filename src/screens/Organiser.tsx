import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { IconLeft } from '../components/Icons';
import SpyScreen from '../components/spy/SpyScreen';
import { addDays } from '../lib/calendar';
import { DAY_MONTH, WEEKDAY_DAY_MONTH } from '../lib/dates';
import { missionFiles, spyActive } from '../lib/missions';
import { isAdmin } from '../lib/override';
import { MAX_DAYS, MIN_DAYS } from '../lib/group';
import { releaseFor } from '../lib/release';
import { nightsNote, stayCtx } from '../lib/stayflow';
import { effectiveRelease, releaseState } from '../lib/tripPlan';
import { useApp } from '../state';
import { PACE_LABEL as PACES } from '../store/choices';
import { readAdminKey } from '../store/tripKey';
import { AREAS, PEOPLE } from '../types';
import type { Area, BookingDates, DayBooking, DayEdit, GroupResult, Pace, Person, ReleasePlan } from '../types';
import { useGroupResult } from '../workers/usePlan';
import { SAVE_COPY, useSaveStatus } from './saveStatus';
import { useTripModel } from './useTripModel';
import './Organiser.css';

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
  noRoute: 'No route is set yet.',
  loading: 'Loading',
};

const ok = (v: string) => v === '' || addDays(v, 0) !== null;
const day = (iso: string) => DAY_MONTH.format(new Date(`${iso}T00:00:00Z`));
// Log lines written before this screen showed dates the friendly way still hold the raw date.
const noISO = (t: string) => t.replace(/\d{4}-\d{2}-\d{2}/g, m => (ok(m) ? day(m) : m));
const tidy = (d: BookingDates): BookingDates => ({ ...(d.opensOn ? { opensOn: d.opensOn } : {}), ...(d.bookBy ? { bookBy: d.bookBy } : {}) });

/** Each control keeps its own save result. A refused save never queued, so it stays silent until the next one: "will retry" would be false. */
function useSave() {
  const { error, needsAdminKey } = useApp();
  const s = useSaveStatus(error);
  const refused = useRef(false);
  if (needsAdminKey) refused.current = true;
  return { message: refused.current ? '' : s.message, run: (p: Promise<boolean>) => { refused.current = needsAdminKey; s.run(p); } };
}
const Result = ({ message }: { message: string }) => <p className="og-msg" role="status">{message}</p>;
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

function Gate({ onOk }: { onOk?: () => void }) {
  const { setAdminKey } = useApp();
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<'idle' | 'checking' | 'wrong' | 'offline'>('idle');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (!key || phase === 'checking') return;
    setPhase('checking');
    try {
      if (await setAdminKey(key)) onOk?.(); else setPhase('wrong');
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

function StartDate({ value }: { value: string | null }) {
  const { saveTripSettings } = useApp();
  const { message, run } = useSave();
  const [v, setV] = useState(value ?? '');
  return (
    <form className="og-form" onSubmit={e => { e.preventDefault(); run(saveTripSettings({ startDate: v || null }, v ? `Start date set to ${v}` : 'Start date cleared')); }}>
      <input className="field" type="date" aria-label="Start date" value={v} onChange={e => setV(e.target.value)} />
      <div className="og-act">
        <button type="submit" className="cta" disabled={v === (value ?? '') || !ok(v)}>Save date</button>
        <Result message={message} />
      </div>
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

function RouteEditor({ base }: { base: ReleasePlan }) {
  const { state, items, legs, saveTripSettings, needsAdminKey } = useApp();
  const { message, run } = useSave();
  const [draft, setDraft] = useState(base);
  const baseKey = JSON.stringify(base);
  // The route this candidate started from. A saved route comes back as the new base and the candidate follows it,
  // unless it holds unsaved edits: those stay, with a warning, rather than vanish when another device saves.
  const [from, setFrom] = useState(baseKey);
  // A save the server refuses reverts the shown base to what it was; the route just sent is an unsaved edit again, not a stale copy.
  const sent = useRef('');
  useEffect(() => {
    const k = JSON.stringify(draft);
    if (k !== from && k !== baseKey) return;
    setFrom(baseKey);
    if (k !== baseKey && !(needsAdminKey && k === sent.current)) setDraft(base);
  }, [baseKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The same call the app makes for the released plan, with the candidate in place of it.
  const { data: group, loading } = useGroupResult(state, items, legs, draft);
  const [pick, setPick] = useState('');
  const [stop, setStop] = useState({ title: '', area: 'Colombo' as Area, hours: '1', day: '1', note: '' });

  const name = (id: string) => items.find(i => i.id === id)?.name ?? id;
  const set = (p: Partial<ReleasePlan>) => setDraft(d => ({ ...d, ...p }));
  const edits = draft.dayEdits;
  const setEdit = (id: string, e: DayEdit | null) => set({ dayEdits: [...edits.filter(x => x.id !== id), ...(e ? [e] : [])] });
  const dirty = JSON.stringify(draft) !== baseKey;
  const moved = dirty && from !== baseKey;
  const discard = () => { setDraft(base); setFrom(baseKey); };
  const final = group?.final ?? null;

  const remove = (id: string) => set({ items: draft.items.filter(i => i !== id), ruledOut: [...new Set([...draft.ruledOut, id])], dayEdits: edits.filter(e => e.id !== id) });
  const add = () => { if (pick) { set({ items: [...draft.items, pick], ruledOut: draft.ruledOut.filter(i => i !== pick) }); setPick(''); } };
  const hours = Number(stop.hours);
  // Lowering Days must not leave the select showing day 1 while the held day is gone.
  const stopDay = Math.min(Number(stop.day), draft.days);
  const stopOk = stop.title.trim() !== '' && hours > 0 && hours <= MAX_STOP_HOURS && stopDay >= 1;
  const addStop = (e: FormEvent) => {
    e.preventDefault();
    if (!stopOk) return;
    const n = Math.max(0, ...edits.filter(x => x.kind === 'custom').map(x => Number(x.id.slice(2)) || 0)) + 1;
    const note = stop.note.trim();
    set({ dayEdits: [...edits, { kind: 'custom', id: `c:${n}`, day: stopDay, title: stop.title.trim(), area: stop.area, hours, ...(note ? { note } : {}) }] });
    setStop(s => ({ ...s, title: '', note: '' }));
  };

  const isOut = (id: string) => base.ruledOut.includes(id) || draft.ruledOut.includes(id);
  const candidates = items.filter(i => !draft.items.includes(i.id)).sort((a, b) => Number(isOut(a.id)) - Number(isOut(b.id)));
  // A saved move whose target day was cut by lowering Days: the select would otherwise show a day it cannot hold.
  const lostDay = (id: string) => { const m = edits.find(x => x.kind === 'move' && x.id === id); return m?.day && m.day > draft.days ? m.day : 0; };
  const dayOptions = Array.from({ length: draft.days }, (_, k) => k + 1);
  // A stored plan outside the usual range still shows its own count.
  const dayChoices = Array.from({ length: MAX_DAYS - MIN_DAYS + 1 }, (_, k) => MIN_DAYS + k);
  if (!dayChoices.includes(draft.days)) dayChoices.push(draft.days);

  return (
    <div className="og-route">
      <div className="og-pair">
        <label className="og-field">
          <span className="og-fl">Days</span>
          <select className="field" value={draft.days} onChange={e => set({ days: Number(e.target.value) })}>
            {dayChoices.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
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
                          {lostDay(e.itemId!) && <option value={lostDay(e.itemId!)}>Day {lostDay(e.itemId!)} no longer exists</option>}
                        </select>
                        {lostDay(e.itemId!) && <button type="button" className="og-btn" aria-label={`Remove move of ${e.label}`} onClick={() => setEdit(e.itemId!, null)}>Remove move</button>}
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
            <select className="field" value={stopDay} onChange={e => setStop(s => ({ ...s, day: e.target.value }))}>{dayOptions.map(n => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <label className="og-field"><span className="og-fl">Stop hours</span>
            <input className="field" type="number" min={0.25} max={MAX_STOP_HOURS} step={0.25} value={stop.hours} onChange={e => setStop(s => ({ ...s, hours: e.target.value }))} />
          </label>
        </div>
        <label className="og-field"><span className="og-fl">Stop note</span><input className="field" maxLength={NOTE_MAX} value={stop.note} onChange={e => setStop(s => ({ ...s, note: e.target.value }))} /></label>
        <button type="submit" className="cta alt" disabled={!stopOk}>Add stop</button>
      </form>

      {moved && <p className="og-msg" role="status">This route was saved from another device after you started. Saving replaces it.</p>}
      <div className="og-actions">
        <button type="button" className="cta" disabled={!dirty || loading || draft.items.length === 0}
          onClick={() => { sent.current = JSON.stringify(draft); run(saveTripSettings({ plan: draft }, describeChange(base, draft, name))); }}>Save route</button>
        {dirty && <button type="button" className="cta alt" onClick={discard}>Discard changes</button>}
        <Result message={message} />
      </div>
    </div>
  );
}

/** `b` carries the dates in use (the catalogue's, or the organiser's own), the same ones Trip admin shows. */
function BookingRow({ b }: { b: DayBooking }) {
  const { id, label } = b;
  const { state, claimBooking, saveTripSettings } = useApp();
  const { message, run } = useSave();
  const stored = state.tripSettings?.bookingDates ?? {};
  const inUse = tidy({ opensOn: b.opensOn ?? '', bookBy: b.bookBy ?? '' });
  const [d, setD] = useState<BookingDates>(inUse);
  const valid = ok(d.opensOn ?? '') && ok(d.bookBy ?? '');
  const clean = tidy(d);
  const save = () => {
    const { [id]: _drop, ...rest } = stored;
    void _drop;
    run(saveTripSettings({ bookingDates: Object.keys(clean).length ? { ...rest, [id]: clean } : rest }, `Booking dates for ${label}`));
  };
  const dates = [b.opensOn && `Opens ${day(b.opensOn)}`, b.bookBy && `Book by ${day(b.bookBy)}`].filter(Boolean).join(', ') || 'No date yet';
  return (
    <li className="og-book">
      <p className="og-rowname">{label}</p>
      <p className="og-msg">{dates}</p>
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
      <div className="og-act">
        <button type="button" className="cta alt" disabled={!valid || JSON.stringify(clean) === JSON.stringify(inUse)} onClick={save}>Save dates</button>
        <Result message={message} />
      </div>
    </li>
  );
}

function Panel({ onBack }: { onBack?: () => void }) {
  const { state, me, items, legs, needsAdminKey } = useApp();
  const settings = state.tripSettings ?? null;
  const loading = state.tripSettings === undefined;
  const base = useMemo(() => effectiveRelease(releaseState(state.tripSettings), releaseFor(me), null), [state.tripSettings, me]);
  const { data: current } = useGroupResult(state, items, legs, base);

  const plan = current?.final ?? null;
  const ctx = me && plan ? stayCtx(state, me, plan) : null;
  const nights = ctx ? ctx.areas.flatMap(a => { const n = nightsNote(ctx, a); return n ? [{ area: a, note: n }] : []; }) : [];
  // Same inputs HQ will read, so the counts here are its counts. The bookings come from the model, with the dates in use.
  const model = useTripModel({ ...current, final: plan } as GroupResult);
  const input = { state, plan, model };
  const files = missionFiles(input);
  const file = (id: string) => files.find(x => x.id === id)!;
  const left = (id: string) => file(id).total - file(id).done;
  const dark = new Intl.ListFormat('en-GB').format(file('touchdown').missing ?? []);
  const intel = [
    { id: 'Bookings', n: left('supply'), text: `${left('supply')} to secure` },
    { id: 'Stays', n: left('stays'), text: `${left('stays')} to decide` },
    { id: 'Flights', n: left('touchdown'), text: `${left('touchdown')} to add${dark && `, ${dark}`}` },
  ];
  const log = [...(settings?.overrides ?? [])].reverse();
  const top = (
    <>
      <p className="sub">{COPY.sub}</p>
      {needsAdminKey && <Gate />}
      {needsAdminKey && <p className="og-msg" role="status">{SAVE_COPY.failed}</p>}
    </>
  );

  const sections = (
    <>
      <Section title="Start date" line={settings?.startDate ? WEEKDAY_DAY_MONTH.format(new Date(`${settings.startDate}T00:00:00Z`)) : 'Not set'}><StartDate value={settings?.startDate ?? null} /></Section>
      <Section title="Route" line={base ? `${base.days} days, ${PACES[base.pace]}, ${base.items.length} places` : loading ? COPY.loading : COPY.noRoute}>
        {base ? <RouteEditor base={base} /> : <p className="og-msg">{loading ? COPY.loading : COPY.noRoute}</p>}
      </Section>
      <Section title="Overrides log" line={log.length ? `${log.length} ${log.length === 1 ? 'change' : 'changes'}` : 'No changes yet'}>
        {log.length === 0 ? <p className="og-msg">Nothing changed yet.</p> : (
          <ul className="og-rows">{log.map((o, k) => <li key={`${o.at}:${k}`} className="og-log"><time dateTime={o.at}>{when(o.at)}</time> <span>{noISO(o.what)}</span></li>)}</ul>
        )}
      </Section>
      <Section title="Missing intel" line={plan ? `${intel.reduce((n, i) => n + i.n, 0)} open` : COPY.loading}>
        <ul className="og-rows" aria-label="Missing intel">{intel.map(i => <li key={i.id} className="og-log"><strong>{i.id}:</strong> {i.text}</li>)}</ul>
      </Section>
      <Section title="Nights note" line={nights.length ? `${nights.length} to check` : 'Nights match the plan'}>
        {nights.length === 0 ? <p className="og-msg">Stay nights match the itinerary.</p> : (
          <ul className="og-rows">{nights.map(n => <li key={n.area} className="og-log"><strong>{n.area}</strong> <span>{n.note}</span></li>)}</ul>
        )}
      </Section>
      <Section title="Bookings" line={model.bookings.length ? `${left('supply')} to secure` : 'None yet'}>
        {model.bookings.length === 0 ? <p className="og-msg">Bookings appear once the route is set.</p> : (
          <ul className="og-rows">{model.bookings.map(b => <BookingRow key={`${b.id}:${b.opensOn}:${b.bookBy}`} b={b} />)}</ul>
        )}
      </Section>
    </>
  );

  // The spy look only while a mission file is open; otherwise the app's own look.
  if (spyActive(input)) {
    return (
      <SpyScreen code="Command" title={COPY.title} back={onBack && { label: COPY.back, onClick: onBack }}>
        <section className="og og-spy" aria-label={COPY.title}>{top}{sections}</section>
      </SpyScreen>
    );
  }
  return (
    <section className="body og" aria-label={COPY.title}>
      {onBack && <div className="og-bar"><button type="button" className="og-back" aria-label={COPY.back} onClick={onBack}><IconLeft size={20} /></button></div>}
      <h2 className="big display small og-h">{COPY.title}</h2>
      {top}{sections}
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
