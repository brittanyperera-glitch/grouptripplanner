export type Overlay = 'items' | 'quiz' | 'awards' | 'profile' | 'bingo';
export type Screen = Overlay | 'walkthrough' | 'base';

interface Pick {
  shown: string;
  overlay: Overlay | null;
  /** Unseen awards open on their own, but never over a page the member opened. */
  awardsUnseen: boolean;
  /** Everything the walkthrough needs except "nothing else is open", which is decided here. */
  walkEligible: boolean;
}

/** The one screen on top. content, screenKey and the tab bar all read this, so two overlays can never disagree. */
export function pickScreen({ shown, overlay, awardsUnseen, walkEligible }: Pick): Screen {
  // The pre-tabs profile card is the only overlay that exists off the tabs; the rest need them.
  if (overlay === 'profile') return 'profile';
  if (shown !== 'tabs') return 'base';
  if (overlay) return overlay;
  if (awardsUnseen) return 'awards';
  return walkEligible ? 'walkthrough' : 'base';
}

/** Screens that cover the tab bar. Awards is a dialog over the tabs, so the bar stays. */
export const hidesTabs = (s: Screen) => s !== 'base' && s !== 'awards';
