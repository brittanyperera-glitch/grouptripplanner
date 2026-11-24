import { describe, expect, it } from 'vitest';
import { normaliseSub, normaliseTab, releasedTabs } from './tabs';
import type { ReleasedTab } from './tabs';

const ALL: ReleasedTab[] = ['Route', 'To do', 'Guide', 'Me'];

describe('releasedTabs', () => {
  it('is Route, To do, Guide, Me before the trip, whatever crewOwes says', () => {
    for (const crewOwes of [true, false, null]) expect(releasedTabs({ tripStarted: false, crewOwes })).toEqual(ALL);
  });

  it('keeps To do on the trip while the crew owes something or the plan has not loaded', () => {
    expect(releasedTabs({ tripStarted: true, crewOwes: true })).toEqual(ALL);
    expect(releasedTabs({ tripStarted: true, crewOwes: null })).toEqual(ALL);
  });

  it('drops To do on the trip once nobody owes anything', () => {
    expect(releasedTabs({ tripStarted: true, crewOwes: false })).toEqual(['Route', 'Guide', 'Me']);
  });
});

describe('normaliseTab', () => {
  it.each([
    ['My trip', 'Route'], ['Picks', 'Route'], ['Suggest', 'Route'], ['Stays', 'To do'],
    ['Group', 'Me'], ['Profile', 'Me'], ['Guide', 'Guide'],
  ])('maps the old id %s to %s', (raw, want) => {
    expect(normaliseTab(raw, ALL)).toBe(want);
  });

  it('keeps a new id as it is', () => {
    for (const t of ALL) expect(normaliseTab(t, ALL)).toBe(t);
  });

  it('sends an unknown id, and a tab that is not shown, to Route', () => {
    expect(normaliseTab('Nonsense', ALL)).toBe('Route');
    expect(normaliseTab('Stays', ['Route', 'Guide', 'Me'])).toBe('Route');
    expect(normaliseTab('To do', ['Route', 'Guide', 'Me'])).toBe('Route');
  });
});

describe('normaliseSub', () => {
  it('maps command to organiser and flights to flights', () => {
    expect(normaliseSub('command')).toBe('organiser');
    expect(normaliseSub('flights')).toBe('flights');
  });

  it('keeps a sub-screen id and gives null for anything else', () => {
    expect(normaliseSub('crew-stats')).toBe('crew-stats');
    expect(normaliseSub('stays')).toBe('stays');
    expect(normaliseSub('touchdown')).toBeNull();
    expect(normaliseSub('')).toBeNull();
  });
});
