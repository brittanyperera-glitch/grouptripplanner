export type Overlay = 'items' | 'quiz' | 'awards' | 'profile' | 'bingo' | 'admin';
export type Screen = Overlay | 'reveal' | 'finale' | 'walkthrough' | 'base';

interface Pick {
  shown: string;
  overlay: Overlay | null;
  /** Unseen awards open on their own, but never over a page the member opened. */
  awardsUnseen: boolean;
  /** The released route plays once on arrival, before anything else. */
  revealUnseen: boolean;
  /** Every mission is done and the finale has not been pressed: it plays once, after the reveal and never over a page the member opened. */
  finaleUnseen?: boolean;
  /** Everything the walkthrough needs except "nothing else is open", which is decided here. */
  walkEligible: boolean;
}

/** The one screen on top. content, screenKey and the tab bar all read this, so two overlays can never disagree. */
export function pickScreen({ shown, overlay, awardsUnseen, revealUnseen, finaleUnseen = false, walkEligible }: Pick): Screen {
  // The pre-tabs profile card is the only overlay that exists off the tabs; the rest need them.
  if (overlay === 'profile') return 'profile';
  if (shown !== 'tabs') return 'base';
  if (revealUnseen) return 'reveal';
  if (overlay) return overlay;
  if (finaleUnseen) return 'finale';
  if (awardsUnseen) return 'awards';
  return walkEligible ? 'walkthrough' : 'base';
}

/** Screens that cover the tab bar. Awards is a dialog over the tabs, so the bar stays. */
export const hidesTabs = (s: Screen) => s !== 'base' && s !== 'awards';
