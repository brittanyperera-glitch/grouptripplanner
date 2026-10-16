import { describe, expect, it } from 'vitest';
import { isExtraKey, isStretchKey, nightsKey, nightsOf, parseNights, stretchKey, stretchLevel, withoutNights } from './prefs';

describe('quiz pick keys', () => {
  it('builds the stored strings', () => {
    expect(nightsKey('hostel', 2)).toBe('nights:hostel:2');
    expect(stretchKey('plus20')).toBe('stretch:plus20');
  });
  it('parses what it builds', () => {
    expect(parseNights(nightsKey('boutique', 3))).toEqual({ type: 'boutique', n: 3 });
    expect(parseNights('stretch:same')).toBeNull();
    expect(parseNights('nights:hostel:x')).toBeNull();
    expect(stretchLevel(stretchKey('anything'))).toBe('anything');
    expect(stretchLevel('nights:hostel:2')).toBeUndefined();
    expect(isStretchKey('stretch:same')).toBe(true);
  });
  it('tells extra keys from options', () => {
    expect(isExtraKey('nights:hostel:1')).toBe(true);
    expect(isExtraKey('stretch:same')).toBe(true);
    expect(isExtraKey('hostel')).toBe(false);
  });
  it('reads and clears one type\'s nights', () => {
    const picks = { hostel: 'happy', [nightsKey('hostel', 2)]: 'happy', [nightsKey('hotel', 1)]: 'happy' } as const;
    expect(nightsOf(picks, 'hostel')).toBe(2);
    expect(nightsOf(picks, 'villa')).toBeUndefined();
    expect(Object.keys(withoutNights(picks, 'hostel'))).toEqual(['hostel', 'nights:hotel:1']);
  });
});
