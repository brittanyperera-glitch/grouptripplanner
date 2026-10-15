import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs build helper without types
import { withGbp } from '../../scripts/gbp.mjs';

describe('pound values next to rupee prices', () => {
  it('adds an approximate pound value after each rupee amount or range', () => {
    expect(withGbp('about LKR 7,500+ pp')).toBe('about LKR 7,500+ (~£17) pp');
    expect(withGbp('LKR 1,000')).toBe('LKR 1,000 (~£2)');
    expect(withGbp('ferry about LKR 100, tuk-tuk tour LKR 1,500-2,500')).toBe('ferry about LKR 100 (under £1), tuk-tuk tour LKR 1,500-2,500 (~£3.50-5.50)');
    expect(withGbp('about LKR 650 permit plus guide')).toBe('about LKR 650 (~£1.50) permit plus guide');
  });

  it('leaves prices without rupees alone', () => {
    expect(withGbp('USD 35')).toBe('USD 35');
    expect(withGbp('free')).toBe('free');
  });
});
