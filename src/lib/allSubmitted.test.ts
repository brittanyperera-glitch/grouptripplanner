import { describe, expect, it } from 'vitest';
import { PEOPLE, type AppState, type Response } from '../types';
import { allSubmitted } from './group';

const r = (name: Response['name'], submitted: boolean): Response =>
  ({ name, days: 9, flex: false, pace: 1, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted, updatedAt: '' });
const rows = (done: (p: string) => boolean): AppState['responses'] => Object.fromEntries(PEOPLE.map(p => [p, r(p, done(p))]));

describe('allSubmitted', () => {
  it('needs all five', () => {
    expect(allSubmitted(rows(() => true))).toBe(true);
    expect(allSubmitted(rows(p => p !== 'Lazza'))).toBe(false);
    expect(allSubmitted({})).toBe(false);
  });
  it('can count one person\'s unsent draft instead of their stored row', () => {
    const open = rows(p => p !== 'Alex');
    expect(allSubmitted(open)).toBe(false);
    expect(allSubmitted(open, { name: 'Alex', submitted: true })).toBe(true);
    expect(allSubmitted(rows(() => true), { name: 'Alex', submitted: false })).toBe(false);
  });
});
