import { describe, expect, it } from 'vitest';
import { fitLine } from './group';

describe('fitLine', () => {
  it('says the day, area and travel change when travel grows', () => {
    expect(fitLine({ day: 4, hub: 'South coast', travelBefore: 18.2, travelAfter: 19.21 })).toBe('If added: day 4 in South coast, travel 18.2 h to 19.2 h.');
  });
  it('says no extra travel instead of "18.2 h to 18.2 h"', () => {
    expect(fitLine({ day: 4, hub: 'South coast', travelBefore: 18.2, travelAfter: 18.24 })).toBe('If added: day 4 in South coast, no extra travel.');
  });
  it('leaves the day out when the place has no day', () => {
    expect(fitLine({ day: null, hub: null, travelBefore: 18.2, travelAfter: 18.2 })).toBe('If added: no extra travel.');
  });
});
