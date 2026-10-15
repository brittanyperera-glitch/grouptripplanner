import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import copyData from '../content/copy.json';
import { MOTION } from '../components/motion';
import HowTo, { type HowToCopy } from './HowTo';
import { FLING } from './useSwipe';

const sound = vi.hoisted(() => ({ thud: vi.fn(), jingle: vi.fn(), unlock: vi.fn() }));
vi.mock('../components/sound', async orig => ({ ...(await orig<typeof import('../components/sound')>()), ...sound }));

beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PE extends MouseEvent {
      pointerId: number; pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'touch'; }
    }
    (window as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
  }
});

const copy = copyData.howto as HowToCopy;
const TIERS = ['skip', 'meh', 'keen', 'must'] as const;
const KEY = { skip: 'ArrowLeft', meh: 'ArrowDown', keen: 'ArrowUp', must: 'ArrowRight' } as const;
const D = FLING + 40;
const DIR: Record<(typeof TIERS)[number], [number, number]> = { skip: [-D, 0], meh: [0, D], keen: [0, -D], must: [D, 0] };
const plain = (say: string) => say.replace(/[{}]/g, '');
const braced = (say: string) => say.match(/\{(.+)\}/)![1];

/** 'full' = motion on (?quips=1 forces it under test), 'reduced' = prefers-reduced-motion, 'still' = today's webdriver behaviour. */
function setMode(m: 'full' | 'reduced' | 'still') {
  window.history.replaceState({}, '', m === 'full' ? '/?quips=1' : '/');
  if (m === 'still') delete (window as { matchMedia?: unknown }).matchMedia;
  else window.matchMedia = ((q: string) => ({ matches: m === 'reduced' && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}
// The word is the grab target: it carries the hw-card class.
const pill = () => document.querySelector('.hw-pill.hw-card') as HTMLElement;
const swipe = (dx: number, dy: number) => {
  const el = pill();
  fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: 100 + dx / 2, clientY: 100 + dy / 2, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 });
};
const count = () => document.querySelector('.hw-count')?.textContent;
// Small steps, each flushed: the typewriter and the effects re-arm their timers only after React renders.
const settle = (ms: number) => { for (let t = 0; t < ms; t += 20) act(() => { vi.advanceTimersByTime(20); }); };
/** Full motion types the intro and then the first sentence out; this runs both to their end. */
const finishIntro = () => settle(12_000);
const sentence = () => document.querySelector('.hw-sentence:not(.hw-leave)')?.textContent;

const animate = vi.fn();
const cancel = vi.fn();
beforeEach(() => {
  sound.thud.mockClear(); sound.jingle.mockClear(); animate.mockClear(); cancel.mockClear();
  animate.mockImplementation(() => ({ cancel }));
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
});
afterEach(() => {
  vi.useRealTimers();
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (window.navigator as { vibrate?: unknown }).vibrate;
  window.history.replaceState({}, '', '/');
});

describe('HowTo practice sentences and progress', () => {
  it('shows one sentence per vote from copy.json, with the vote word inline and a small line under it', () => {
    setMode('still');
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    for (const t of TIERS) {
      expect(sentence()).toBe(plain(copy.practice[t].say));
      expect(document.querySelector('.hw-word')?.textContent).toBe(braced(copy.practice[t].say));
      expect(pill().contains(document.querySelector('.hw-word'))).toBe(true);
      expect(document.querySelector('.hw-step')?.textContent).toBe(copy.practice[t].line);
      fireEvent.keyDown(window, { key: KEY[t] });
    }
  });

  it('the progress count advances one per correct vote and fills a slot in that vote\'s tier', () => {
    setMode('still');
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    expect(count()).toBe(`${copy.progress} 1/4`);
    expect(document.querySelectorAll('.hw-slot')).toHaveLength(4);
    expect(document.querySelectorAll('.hw-slot.filled')).toHaveLength(0);
    TIERS.forEach((t, i) => {
      fireEvent.keyDown(window, { key: 'ArrowUp' === KEY[t] ? 'ArrowRight' : 'ArrowUp' });
      expect(count()).toBe(`${copy.progress} ${i + 1}/4`);
      fireEvent.keyDown(window, { key: KEY[t] });
      if (i < 3) expect(count()).toBe(`${copy.progress} ${i + 2}/4`);
      // The last vote leaves the practice view, so its slot is checked on the first three.
      if (i < 3) expect([...document.querySelectorAll('.hw-slot.filled')].map(e => e.className.split(' ').pop())).toEqual(TIERS.slice(0, i + 1));
    });
  });
});

describe('HowTo word motion and fly-off', () => {
  it('the word moves in its own direction on a loop until the first touch, then stops', () => {
    setMode('full');
    vi.useFakeTimers();
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    expect(pill()).toBeNull();
    finishIntro();
    expect(pill().dataset.moving).toBe('true');
    // Skip shakes left: every keyframe is a leftward (or zero) x move.
    const kf = animate.mock.calls[0][0] as { transform: string }[];
    expect(kf.some(f => /translateX\(-14px\)/.test(f.transform))).toBe(true);
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: MOTION.slow * 2 });
    const first = animate.mock.calls.length;
    settle(MOTION.slow * 4);
    expect(animate.mock.calls.length).toBeGreaterThan(first);

    fireEvent.pointerDown(pill(), { clientX: 100, clientY: 100, pointerId: 1 });
    expect(pill().dataset.moving).toBe('false');
    expect(cancel).toHaveBeenCalled();
    fireEvent.pointerCancel(pill(), { pointerId: 1 });
    const stopped = animate.mock.calls.length;
    settle(MOTION.slow * 12);
    expect(animate.mock.calls.length).toBe(stopped);
    expect(pill().dataset.moving).toBe('false');
  });

  it('each next screen moves its own way: Meh nods down', () => {
    setMode('full');
    vi.useFakeTimers();
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    finishIntro();
    swipe(...DIR.skip);
    settle(MOTION.slow + 1500);
    expect(document.querySelector('.hw-word')?.textContent).toBe('Meh');
    expect(pill().dataset.moving).toBe('true');
    const kf = animate.mock.calls.at(-1)![0] as { transform: string }[];
    expect(kf.some(f => /translateY\(12px\)/.test(f.transform))).toBe(true);
  });

  it('a button or key press also ends the motion', () => {
    setMode('full');
    vi.useFakeTimers();
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    finishIntro();
    expect(pill().dataset.moving).toBe('true');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(pill().dataset.moving).toBe('false');
  });

  it('a correct swipe flies the word off as a stamp with a burst, the sentence leaves, the thud plays, then they are removed', () => {
    setMode('full');
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(window.navigator, 'vibrate', { value: vibrate, configurable: true });
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    finishIntro();
    swipe(...DIR.skip);
    const fly = document.querySelector('.ghost.fly-skip');
    expect(fly).not.toBeNull();
    expect(fly!.querySelector('.stamp.skip')?.textContent).toBe('Skip');
    expect(document.querySelector('.hw-leave')?.textContent).toBe(plain(copy.practice.skip.say));
    expect(document.querySelectorAll('.hw-burst span').length).toBeGreaterThan(6);
    // Only the live screen has a .hw-word, so the flying copy never doubles it up.
    expect(document.querySelectorAll('.hw-word')).toHaveLength(1);
    expect(sound.thud).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(15);
    expect(count()).toBe(`${copy.progress} 2/4`);
    settle(MOTION.slow + 20);
    expect(document.querySelector('.ghost')).toBeNull();
    expect(document.querySelector('.hw-leave')).toBeNull();
    expect(document.querySelector('.hw-burst')).toBeNull();
  });

  it('a wrong way wobbles the word and keeps the nudge line', () => {
    setMode('full');
    vi.useFakeTimers();
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    finishIntro();
    swipe(...DIR.must);
    expect(document.querySelector('.hw-pill.nudged')).not.toBeNull();
    expect(document.querySelector('.ghost')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(copy.nudge);
    expect(count()).toBe(`${copy.progress} 1/4`);
  });

  it('after the fourth vote the finale plays the jingle with Brittany and the tuk-tuk, then the ranking lines', () => {
    setMode('full');
    vi.useFakeTimers();
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    finishIntro();
    for (const t of TIERS) { swipe(...DIR[t]); settle(MOTION.slow + 1500); }
    expect(screen.getByText(copy.natural)).toBeTruthy();
    expect(document.querySelector('[data-person="Brittany"]')).not.toBeNull();
    expect(document.querySelector('.hw-tuk [data-tuktuk]')).not.toBeNull();
    expect(sound.jingle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: copy.go })).toBeNull();
    settle(MOTION.slow * 5 + MOTION.base + 20);
    expect(screen.queryByText(copy.natural)).toBeNull();
    expect(screen.getByRole('button', { name: copy.go })).toBeTruthy();
  });
});

describe('HowTo with reduced motion', () => {
  it('shows no word motion, no fly-off, no burst and no tuk-tuk drive, and ends on the static finale and ranking', () => {
    setMode('reduced');
    const vibrate = vi.fn();
    Object.defineProperty(window.navigator, 'vibrate', { value: vibrate, configurable: true });
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    expect(pill().dataset.moving).toBe('false');
    expect(document.querySelector('.hw-caret')).toBeNull();
    for (const t of TIERS) {
      swipe(...DIR[t]);
      expect(document.querySelector('.ghost')).toBeNull();
      expect(document.querySelector('.hw-leave')).toBeNull();
      expect(document.querySelector('.hw-burst')).toBeNull();
    }
    expect(animate).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    expect(screen.getByText(copy.natural)).toBeTruthy();
    expect(document.querySelector('.hw-tuk')).toBeNull();
    expect(sound.jingle).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: copy.go })).toBeTruthy();
  });
});

describe('HowTo typewriter caret', () => {
  it('blinks a caret on the line being typed, and drops it when everything is out', () => {
    setMode('full');
    vi.useFakeTimers();
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    expect(document.querySelectorAll('.hw-caret')).toHaveLength(1);
    finishIntro();
    expect(document.querySelector('.hw-caret')).toBeNull();
  });

  it('types each practice sentence in, caret following, with the word readable in full once typed', () => {
    setMode('full');
    vi.useFakeTimers();
    render(<HowTo copy={copy} onDone={vi.fn()} onSkip={vi.fn()} />);
    finishIntro();
    swipe(...DIR.skip);
    settle(MOTION.slow + 100);
    expect(document.querySelectorAll('.hw-sentence:not(.hw-leave) .hw-caret')).toHaveLength(1);
    settle(2000);
    expect(document.querySelectorAll('.hw-sentence:not(.hw-leave) .hw-caret')).toHaveLength(0);
    expect(sentence()).toBe(plain(copy.practice.meh.say));
  });
});
