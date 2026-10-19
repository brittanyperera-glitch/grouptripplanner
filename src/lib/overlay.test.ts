import { describe, expect, it } from 'vitest';
import { hidesTabs, pickScreen, type Overlay } from './overlay';

const OVERLAYS: (Overlay | null)[] = [null, 'items', 'quiz', 'awards', 'profile', 'bingo'];
const BOOLS = [false, true];

describe('pickScreen', () => {
  it('walks every combination and picks exactly one screen by the stated precedence', () => {
    for (const shown of ['tabs', 'rate', 'days']) for (const overlay of OVERLAYS) for (const awardsUnseen of BOOLS) for (const revealUnseen of BOOLS) for (const walkEligible of BOOLS) {
      const got = pickScreen({ shown, overlay, awardsUnseen, revealUnseen, walkEligible });
      const want = overlay === 'profile' ? 'profile'
        : shown !== 'tabs' ? 'base'
        : revealUnseen ? 'reveal'
        : overlay ? overlay
        : awardsUnseen ? 'awards'
        : walkEligible ? 'walkthrough' : 'base';
      expect(got, JSON.stringify({ shown, overlay, awardsUnseen, revealUnseen, walkEligible })).toBe(want);
    }
  });

  it('the walkthrough never shows over an open overlay or unseen awards', () => {
    for (const overlay of OVERLAYS.filter(Boolean) as Overlay[]) expect(pickScreen({ shown: 'tabs', overlay, awardsUnseen: false, revealUnseen: false, walkEligible: true })).toBe(overlay);
    expect(pickScreen({ shown: 'tabs', overlay: null, awardsUnseen: true, revealUnseen: false, walkEligible: true })).toBe('awards');
  });

  it('a page the member opened beats awards that open on their own', () => {
    expect(pickScreen({ shown: 'tabs', overlay: 'items', awardsUnseen: true, revealUnseen: false, walkEligible: false })).toBe('items');
  });

  it('the unseen route reveal comes before awards and the walkthrough', () => {
    expect(pickScreen({ shown: 'tabs', overlay: null, awardsUnseen: true, revealUnseen: true, walkEligible: true })).toBe('reveal');
  });

  it('only the tab bar under awards stays', () => {
    expect(['base', 'awards', 'reveal', 'items', 'quiz', 'bingo', 'profile', 'walkthrough'].filter(s => !hidesTabs(s as never))).toEqual(['base', 'awards']);
  });
});
