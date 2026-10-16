import type { Player, Vote } from '../types';

// Fork ids are stored in votes and the choice log: never change what these produce.
export const REGION_FORK = 'region:north';
export const NORTH_AREAS = new Set<string>(['North', 'East coast']);
export const genreForkId = (gid: string, id: string) => `genre:${gid}:${id}`;
/** `done` keep votes already resolved in this genre: 0 is the first question, 1 is `#2`. */
export const genreRoundForkId = (gid: string, done: number) => (done ? `genre:${gid}#${done + 1}` : `genre:${gid}`);

type Side = 'a' | 'b';

/** Each person's last vote on a fork. `voters` null counts everyone who voted, guests included. */
export function latestVotes(votes: readonly Vote[], forkId: string, voters: readonly Player[] | null): Map<Player, Side> {
  const latest = new Map<Player, Side>();
  for (const v of votes) if (v.forkId === forkId && (voters === null || voters.includes(v.name))) latest.set(v.name, v.choice);
  return latest;
}

/** Who is on each side, in `voters` order. */
export function tallySides<P extends Player>(votes: readonly Vote[], forkId: string, voters: readonly P[]): { a: P[]; b: P[] } {
  const latest = latestVotes(votes, forkId, voters);
  return { a: voters.filter(p => latest.get(p) === 'a'), b: voters.filter(p => latest.get(p) === 'b') };
}

export const myChoice = (votes: readonly Vote[], forkId: string, me: Player): Side | undefined =>
  votes.filter(v => v.forkId === forkId && v.name === me).at(-1)?.choice;

/** One vote per person per fork: drops the earlier one and appends. */
export const replaceMyVote = (votes: readonly Vote[], next: Vote): Vote[] =>
  [...votes.filter(x => !(x.forkId === next.forkId && x.name === next.name)), next];
