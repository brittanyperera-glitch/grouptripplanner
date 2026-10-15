import { flushSync } from 'react-dom';

export type Motion = 'full' | 'reduced' | 'still';

/** The motion scale in ms: --dur-fast, --dur, --dur-slow in styles.css (src/motion-scale.test.ts keeps them equal). */
export const MOTION = { fast: 160, base: 280, slow: 480 } as const;
export type Nav = 'fwd' | 'back' | 'tab';

// Tests and e2e run under webdriver (or jsdom, which has no matchMedia): motion is off there so nothing
// waits on an animation. ?quips=1 turns it back on for screenshots.
export function motion(): Motion {
  if (typeof window === 'undefined') return 'still';
  const forced = new URLSearchParams(window.location.search).get('quips') === '1';
  if (navigator.webdriver && !forced) return 'still';
  if (!window.matchMedia) return 'still';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
}

type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

let last: Nav = 'fwd';
export const lastNav = () => last;

/** Runs a navigation inside a view transition when the browser has them and motion is on. */
export function navigate(dir: Nav, update: () => void) {
  last = dir;
  const doc = document as VTDoc;
  if (motion() !== 'full' || !doc.startViewTransition) { update(); return; }
  const root = document.documentElement;
  root.dataset.nav = dir;
  const vt = doc.startViewTransition(() => flushSync(update));
  void vt.finished.finally(() => { if (root.dataset.nav === dir) delete root.dataset.nav; });
}

/** Haptic tick on a swipe: longer pattern on Must. No-op without navigator.vibrate (iOS Safari) or when motion is off. */
export function buzz(tier: 'must' | 'keen' | 'meh' | 'skip') {
  if (motion() !== 'full' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(tier === 'must' ? [30, 40, 60] : 15);
}

/** True when the CSS fallback should animate a freshly mounted screen. */
export const cssEnter = () => motion() === 'full' && !(document as VTDoc).startViewTransition;
