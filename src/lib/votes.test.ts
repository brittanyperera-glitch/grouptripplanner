import { describe, expect, it } from 'vitest';
import { PEOPLE, type Vote } from '../types';
import { genreForkId, genreRoundForkId, latestVotes, myChoice, REGION_FORK, replaceMyVote, tallySides } from './votes';

const v = (forkId: string, name: Vote['name'], choice: 'a' | 'b'): Vote => ({ forkId, name, choice });

describe('fork ids stay byte-identical to what is stored', () => {
  it('builds the stored strings', () => {
    expect(REGION_FORK).toBe('region:north');
    expect(genreForkId('beach', 'galle')).toBe('genre:beach:galle');
    expect(genreRoundForkId('beach', 0)).toBe('genre:beach');
    expect(genreRoundForkId('beach', 1)).toBe('genre:beach#2');
  });
});

describe('latestVotes', () => {
  const votes = [v('f', 'Alex', 'a'), v('g', 'Alex', 'b'), v('f', 'Alex', 'b'), v('f', 'Tuktuk', 'a')];
  it('keeps each person\'s last vote on the fork', () => {
    expect([...latestVotes(votes, 'f', null)]).toEqual([['Alex', 'b'], ['Tuktuk', 'a']]);
  });
  it('counts only the voters it is given', () => {
    expect([...latestVotes(votes, 'f', PEOPLE)]).toEqual([['Alex', 'b']]);
  });
});

describe('tallySides', () => {
  it('lists voters per side in voter order', () => {
    const votes = [v('f', 'Saulie', 'a'), v('f', 'Alex', 'a'), v('f', 'Antek', 'b')];
    expect(tallySides(votes, 'f', PEOPLE)).toEqual({ a: ['Alex', 'Saulie'], b: ['Antek'] });
  });
});

describe('myChoice and replaceMyVote', () => {
  it('reads my latest choice, undefined when none', () => {
    expect(myChoice([v('f', 'Alex', 'a'), v('f', 'Alex', 'b')], 'f', 'Alex')).toBe('b');
    expect(myChoice([], 'f', 'Alex')).toBeUndefined();
  });
  it('replaces only my vote on that fork', () => {
    const out = replaceMyVote([v('f', 'Alex', 'a'), v('f', 'Antek', 'a'), v('g', 'Alex', 'a')], v('f', 'Alex', 'b'));
    expect(out).toEqual([v('f', 'Antek', 'a'), v('g', 'Alex', 'a'), v('f', 'Alex', 'b')]);
  });
});
