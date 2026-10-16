import { describe, expect, it } from 'vitest';
import { liveItems } from '../state';
import { emptyRanking, PEOPLE } from '../types';
import type { AppState, Response, Suggestion } from '../types';
import { ideaKey, toRate } from './openItems';

const sug = (id: string): Suggestion => ({ id, name: 'Alex', title: 'Cafe', area: 'Colombo', note: '', status: 'live', createdAt: 'x' });
const resp = (rated: string[]): Response => ({ name: 'Alex', days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated, submitted: true, updatedAt: 'x' });
const state = (rated: string[]): AppState => ({ responses: { Alex: resp(rated) }, suggestions: [sug('1')], votes: [] });

describe('liveItems late rule', () => {
  it('a live suggestion nobody has rated is late; once a member rated it, it is not', () => {
    expect(liveItems(state([])).find(i => i.id === 's:1')?.late).toBe(true);
    expect(liveItems(state(['s:1'])).find(i => i.id === 's:1')?.late).toBeFalsy();
    expect(PEOPLE).toContain('Alex');
  });
});

describe('toRate', () => {
  it('never offers late items, using the real catalogue (scuba)', () => {
    const items = liveItems(state([]));
    expect(items.find(i => i.id === 'scuba')?.late).toBe(true);
    const ids = toRate(items, []).map(i => i.id);
    expect(ids).not.toContain('scuba');
    expect(ids).not.toContain('s:1');
    expect(ids.length).toBe(items.filter(i => !i.late).length);
    expect(toRate(items, [ids[0]]).map(i => i.id)).not.toContain(ids[0]);
  });
  it('shares one idea key', () => {
    expect(ideaKey({ title: ' Cafe ', area: 'Colombo' })).toBe('cafe|Colombo');
  });
});
