import { isGuest, PEOPLE } from '../types';
import { genreForkId } from './votes';
import type { GroupResult, Knockout, Person, Player, Vote } from '../types';

const heard = (k: Knockout, p: Person) => k.votes.a.includes(p) || k.votes.b.includes(p);

/** A guest is not in the group tallies, so read their own raw votes (a same-type question needs every place ticked). */
function guestVoted(k: Knockout, votes: Vote[], me: Player): boolean {
  const has = (forkId: string) => votes.some(v => v.name === me && v.forkId === forkId);
  return k.genre ? k.a.every(id => has(genreForkId(k.genre!.id, id))) : has(k.forkId);
}

/** How many knockouts are open, how many of them still need my vote, and which of the five have one outstanding. */
export function outstanding(group: GroupResult, votes: Vote[], me: Player | null): { open: number; mine: number; others: Person[] } {
  const ks = group.knockouts;
  const mine = me === null ? 0 : ks.filter(k => !(isGuest(me) ? guestVoted(k, votes, me) : heard(k, me as Person))).length;
  const others = PEOPLE.filter(p => p !== me && ks.some(k => !heard(k, p)));
  return { open: ks.length, mine, others };
}
