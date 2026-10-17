import catalogue from '../data/catalogue.json';
import { AREAS } from '../types';
import type { AdminEntry, AppState, Area, Item, Plan, Player } from '../types';
import { outcome, stayCtx } from './stayflow';

export interface AdminDef {
  id: string; label: string; hint: string;
  /** What is being booked, so the page can show its price and booking note. */
  info?: string;
}
export interface AdminDue { id: string; label: string }

const BOOKABLE = (catalogue as unknown as { items: Item[] }).items.filter(i => i.book);
/** Catalogue places that carry a booking note. Group item ids are `book:<item id>`. */
export const BOOK_IDS: string[] = BOOKABLE.map(i => `book:${i.id}`);
export const stayItemId = (area: Area) => `stay:${area}`;
/** Every item id that can ever appear, in a stable order: bookable places, one stay per area. */
export const ADMIN_IDS: string[] = [...BOOK_IDS, ...AREAS.map(stayItemId)];

/** The group bookings that apply to this trip: places only if the plan holds them; a stay only once decided. */
export function adminChecklist(state: AppState, me: Player, plan: Plan | null): AdminDef[] {
  const out: AdminDef[] = [];
  if (!plan) return out;
  for (const i of BOOKABLE) {
    if (plan.chosen.includes(i.id)) {
      out.push({ id: `book:${i.id}`, label: i.name, hint: i.book ?? '', info: i.fee });
    }
  }
  const ctx = stayCtx(state, me, plan);
  for (const area of ctx.areas) {
    const o = outcome(ctx, area);
    if (o.kind !== 'decided') continue;
    const s = ctx.suggestions.find(x => x.id === o.id);
    out.push({
      id: stayItemId(area), label: `Stay in ${area}`, hint: s ? `Book ${s.title}.` : 'Book the chosen stay.',
      info: s?.priceGbp !== undefined ? `about £${s.priceGbp} a night` : undefined,
    });
  }
  return out;
}

const entryOf = (state: AppState, who: Player, id: string): AdminEntry | undefined => state.tripAdmin?.[who]?.items[id];
/** Everyone who has marked this item done. */
export const doneBy = (state: AppState, id: string): Player[] =>
  (Object.keys(state.tripAdmin ?? {}) as Player[]).filter(p => entryOf(state, p, id)?.done);

/** The bookings nobody has ticked yet. Needs the locked plan: without one there is nothing to book. */
export function adminOutstanding(me: Player, state: AppState, plan: Plan | null = null): AdminDue[] {
  return adminChecklist(state, me, plan)
    .filter(d => doneBy(state, d.id).length === 0)
    .map(({ id, label }) => ({ id, label }));
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

export const FIELD_MAX = { price: 30, note: 200 } as const;
/** The patch for ticking or unticking one item; details already entered are kept. */
export function toggleDone(prev: AdminEntry | undefined, done: boolean, now: string): AdminEntry {
  const { doneAt: _at, ...rest } = prev ?? { done: false };
  return done ? { ...rest, done: true, doneAt: now } : { ...rest, done: false };
}
/** The patch for saving the details of one item: trimmed, capped, and empty fields dropped. A booking reference from before it was removed is dropped too. */
export function withDetails(prev: AdminEntry | undefined, f: { price: string; note: string }): AdminEntry {
  const { price: _p, ref: _r, note: _n, ...rest } = prev ?? { done: false };
  const out: AdminEntry = { ...rest };
  for (const k of ['price', 'note'] as const) {
    const v = f[k].trim().slice(0, FIELD_MAX[k]);
    if (v) out[k] = v;
  }
  return out;
}
