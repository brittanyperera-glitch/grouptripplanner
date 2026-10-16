import { describe, expect, it } from 'vitest';
import { hidesTabs, pickScreen, type Overlay } from './overlay';

const OVERLAYS: (Overlay | null)[] = [null, 'items', 'quiz', 'awards', 'profile', 'bingo'];
const BOOLS = [false, true];

describe('pickScreen', () => {
  it('walks every combination and picks exactly one screen by the stated precedence', () => {
    for (const shown of ['tabs', 'rate', 'days']) for (const overlay of OVERLAYS) for (const awardsUnseen of BOOLS) for (const walkEligible of BOOLS) {
      const got = pickScreen({ shown, overlay, awardsUnseen, walkEligible });
      const want = overlay === 'profile' ? 'profile'
        : shown !== 'tabs' ? 'base'
        : overlay ? overlay
        : awardsUnseen ? 'awards'
        : walkEligible ? 'walkthrough' : 'base';
      expect(got, JSON.stringify({ shown, overlay, awardsUnseen, walkEligible })).toBe(want);
    }
  });

  it('the walkthrough never shows over an open overlay or unseen awards', () => {
    for (const overlay of OVERLAYS.filter(Boolean) as Overlay[]) expect(pickScreen({ shown: 'tabs', overlay, awardsUnseen: false, walkEligible: true })).toBe(overlay);
    expect(pickScreen({ shown: 'tabs', overlay: null, awardsUnseen: true, walkEligible: true })).toBe('awards');
  });

  it('a page the member opened beats awards that open on their own', () => {
    expect(pickScreen({ shown: 'tabs', overlay: 'items', awardsUnseen: true, walkEligible: false })).toBe('items');
  });

  it('only the tab bar under awards stays', () => {
    expect(['base', 'awards', 'items', 'quiz', 'bingo', 'profile', 'walkthrough'].filter(s => !hidesTabs(s as never))).toEqual(['base', 'awards']);
  });
});
