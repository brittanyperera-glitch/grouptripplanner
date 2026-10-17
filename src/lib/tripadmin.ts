import catalogue from '../data/catalogue.json';
import { AREAS } from '../types';
import type { AdminEntry, AppState, Area, Item, Plan, Player } from '../types';
import { outcome, stayCtx } from './stayflow';

export type AdminScope = 'person' | 'group';
export interface AdminDef {
  id: string; scope: AdminScope; label: string; hint: string;
  /** Group items only: what is being booked, so the page can show its price and booking note. */
  info?: string;
}
export interface AdminDue { id: string; scope: AdminScope; label: string }

const PERSON: AdminDef[] = [
  { id: 'flights', scope: 'person', label: 'Flights in and out', hint: 'Booked both ways. Add the booking reference.' },
  { id: 'eta', scope: 'person', label: 'Sri Lanka ETA', hint: 'Electronic travel authorisation. Check whether your passport needs one before you fly.' },
  { id: 'insurance', scope: 'person', label: 'Travel insurance', hint: 'Bought, and it covers the activities you plan to do.' },
  { id: 'health', scope: 'person', label: 'Vaccines and meds check', hint: 'Checked with a clinic or pharmacist, and any meds packed.' },
  { id: 'phone', scope: 'person', label: 'Phone or eSIM', hint: 'Sorted data for the trip, so you can reach the group.' },
  { id: 'money', scope: 'person', label: 'Money plan', hint: 'How you will pay: card, cash, and a spare.' },
];
export const PERSON_IDS: string[] = PERSON.map(d => d.id);

const BOOKABLE = (catalogue as unknown as { items: Item[] }).items.filter(i => i.book);
/** Catalogue places that carry a booking note. Group item ids are `book:<item id>`. */
export const BOOK_IDS: string[] = BOOKABLE.map(i => `book:${i.id}`);
export const stayItemId = (area: Area) => `stay:${area}`;
/** Every item id that can ever appear, in a stable order: person items, bookable places, one stay per area. */
export const ADMIN_IDS: string[] = [...PERSON_IDS, ...BOOK_IDS, ...AREAS.map(stayItemId)];

/** The items that apply to this trip: person items always; places only if the plan holds them; a stay only once decided. */
export function adminChecklist(state: AppState, me: Player, plan: Plan | null): AdminDef[] {
  const out: AdminDef[] = [...PERSON];
  if (!plan) return out;
  for (const i of BOOKABLE) {
    if (plan.chosen.includes(i.id)) {
      out.push({ id: `book:${i.id}`, scope: 'group', label: i.name, hint: i.book ?? '', info: i.fee });
    }
  }
  const ctx = stayCtx(state, me, plan);
  for (const area of ctx.areas) {
    const o = outcome(ctx, area);
    if (o.kind !== 'decided') continue;
    const s = ctx.suggestions.find(x => x.id === o.id);
    out.push({
      id: stayItemId(area), scope: 'group', label: `Stay in ${area}`, hint: s ? `Book ${s.title}.` : 'Book the chosen stay.',
      info: s?.priceGbp !== undefined ? `about £${s.priceGbp} a night` : undefined,
    });
  }
  return out;
}

const entryOf = (state: AppState, who: Player, id: string): AdminEntry | undefined => state.tripAdmin?.[who]?.items[id];
/** Everyone who has marked this item done. */
export const doneBy = (state: AppState, id: string): Player[] =>
  (Object.keys(state.tripAdmin ?? {}) as Player[]).filter(p => entryOf(state, p, id)?.done);

/**
 * What `me` still owes: each person item they have not ticked, and each group item nobody has ticked yet.
 * Pass the locked plan to include group items; without one only person items count.
 */
export function adminOutstanding(me: Player, state: AppState, plan: Plan | null = null): AdminDue[] {
  return adminChecklist(state, me, plan)
    .filter(d => (d.scope === 'person' ? !entryOf(state, me, d.id)?.done : doneBy(state, d.id).length === 0))
    .map(({ id, scope, label }) => ({ id, scope, label }));
}

/**
 * What the viewer may see of someone's entry. Others get only whether it is done and when; price, reference and note
 * are hidden. This is the UI contract only: the table is readable by anyone holding the one shared trip password.
 */
export function visibleEntry(viewer: Player | null, owner: Player, entry: AdminEntry | undefined): AdminEntry | undefined {
  if (!entry) return undefined;
  if (viewer === owner) return entry;
  return entry.doneAt === undefined ? { done: entry.done } : { done: entry.done, doneAt: entry.doneAt };
}

export const FIELD_MAX = { price: 30, ref: 60, note: 200 } as const;
/** The patch for ticking or unticking one item; details already entered are kept. */
export function toggleDone(prev: AdminEntry | undefined, done: boolean, now: string): AdminEntry {
  const { doneAt: _at, ...rest } = prev ?? { done: false };
  return done ? { ...rest, done: true, doneAt: now } : { ...rest, done: false };
}
/** The patch for saving the details of one item: trimmed, capped, and empty fields dropped. */
export function withDetails(prev: AdminEntry | undefined, f: { price: string; ref: string; note: string }): AdminEntry {
  const { price: _p, ref: _r, note: _n, ...rest } = prev ?? { done: false };
  const out: AdminEntry = { ...rest };
  for (const k of ['price', 'ref', 'note'] as const) {
    const v = f[k].trim().slice(0, FIELD_MAX[k]);
    if (v) out[k] = v;
  }
  return out;
}
