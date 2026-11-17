import type { AppState, Area, Plan, Player, StayType } from '../types';
import { PEOPLE } from '../types';
import { nightsNote, outcome, stayCtx } from './stayflow';
import { voteOpen } from './stays';

export interface ChosenStay { area: Area; title: string; stayType?: StayType; priceGbp?: number; nights: number; itineraryNights?: number; link?: string }

/** One stay per destination, only where something is decided: a pin, or the result once everyone has locked in. */
export function chosenStays(state: AppState, me: Player | null, plan: Plan): ChosenStay[] {
  // stayCtx only needs `me` to know whether a guest is voting; the group trip has no guest when nobody is signed in.
  const ctx = stayCtx(state, me ?? PEOPLE[0], plan);
  const open = voteOpen(ctx.crewOf, ctx.participants);
  return ctx.areas.flatMap(area => {
    const o = outcome(ctx, area);
    const s = o.kind === 'decided' && (o.via === 'pin' || open) ? ctx.suggestions.find(x => x.id === o.id && x.kind === 'stay' && x.status === 'live') : undefined;
    return s ? [{ area, title: s.title, stayType: s.stayType, priceGbp: s.priceGbp, nights: ctx.nights[area] ?? 0, ...(nightsNote(ctx, area) ? { itineraryNights: ctx.derivedNights?.[area] } : {}), link: s.link }] : [];
  });
}
