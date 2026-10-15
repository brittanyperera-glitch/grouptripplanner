import { fireEvent, render } from '@testing-library/react';
import { act } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Copy } from '../state';
import type { Item, Tier } from '../types';
import Rate, { FLING } from './Rate';

// jsdom has no PointerEvent; a MouseEvent carrying pointerId is enough for React's handlers.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PE extends MouseEvent {
      pointerId: number; pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'touch'; }
    }
    (window as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
  }
});

const item: Item = { id: 'a', name: 'Alpha Rock', area: 'Cultural Triangle', about: 'About', hours: 3, slot: 'morning', fee: 'free', sideTrip: 0 };
const copy = { welcome: '', quips: { name: {}, days: {}, pace: {}, tier: {} }, items: {} } as Copy;

function setup() {
  const onTier = vi.fn<(t: Tier) => void>();
  render(<Rate item={item} n={1} total={3} copy={copy} onTier={onTier} />);
  const card = document.querySelector('.card:not(.ghost)') as HTMLElement;
  const drag = (dx: number, dy: number) => {
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 100 + dx / 2, clientY: 100 + dy / 2, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 });
    return card;
  };
  const release = (dx: number, dy: number) => fireEvent.pointerUp(card, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 });
  return { onTier, card, drag, release };
}

describe('swipe rating', () => {
  it.each([
    ['right', FLING + 40, 10, 'must'],
    ['up', 5, -(FLING + 40), 'keen'],
    ['down', -5, FLING + 40, 'meh'],
    ['left', -(FLING + 40), -10, 'skip'],
  ] as const)('a drag %s past the threshold rates the card %s', (_dir, dx, dy, tier) => {
    const { onTier, drag, release } = setup();
    drag(dx, dy);
    release(dx, dy);
    expect(onTier).toHaveBeenCalledTimes(1);
    expect(onTier).toHaveBeenCalledWith(tier);
  });

  it('follows the finger while dragging and shows the tier label', () => {
    const { card, drag } = setup();
    drag(80, 0);
    expect(card.style.transform).toContain('translate(80px, 0px)');
    const must = card.querySelector('.stamp.must') as HTMLElement;
    expect(Number(must.style.opacity)).toBeGreaterThan(0.5);
  });

  it('a short drag snaps back and rates nothing', () => {
    const { onTier, card, drag, release } = setup();
    drag(30, 0);
    release(30, 0);
    expect(onTier).not.toHaveBeenCalled();
    expect(card.style.transform).toBe('');
  });

  it('arrow keys rate too', () => {
    const { onTier } = setup();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(onTier).toHaveBeenCalledWith('keen');
  });
});

const setMotion = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: !on && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};

describe('swipe haptics', () => {
  afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; delete (navigator as { vibrate?: unknown }).vibrate; localStorage.clear(); vi.useRealTimers(); });

  it('vibrates on a swipe, with the longer pattern on Must', () => {
    setMotion(true);
    localStorage.setItem('tp:swipe-demo', '1');
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { drag, release } = setup();
    drag(FLING + 40, 0); release(FLING + 40, 0);
    expect(vibrate).toHaveBeenCalledWith([30, 40, 60]);
    const b = document.querySelectorAll('.card:not(.ghost)');
    expect(b.length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(vibrate).toHaveBeenLastCalledWith(15);
  });
});

describe('first card demo', () => {
  afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; localStorage.clear(); vi.useRealTimers(); });
  const stampOn = () => ['must', 'keen', 'skip', 'meh'].filter(t => Number((document.querySelector(`.card:not(.ghost) .stamp.${t}`) as HTMLElement).style.opacity) > 0.5);

  it('nudges right, up, left, down once, then settles and remembers it', () => {
    vi.useFakeTimers();
    setMotion(true);
    render(<Rate item={item} n={1} total={3} copy={copy} onTier={() => {}} />);
    const seen: string[][] = [stampOn()];
    for (let i = 0; i < 4; i++) { act(() => { vi.advanceTimersByTime(700); }); seen.push(stampOn()); }
    expect(seen).toEqual([['must'], ['keen'], ['skip'], ['meh'], []]);
    expect(localStorage.getItem('tp:swipe-demo')).toBe('1');
    document.body.innerHTML = '';
    render(<Rate item={item} n={1} total={3} copy={copy} onTier={() => {}} />);
    expect(stampOn()).toEqual([]);
  });

  it('does not play on a later card, or with motion off', () => {
    setMotion(true);
    render(<Rate item={item} n={2} total={3} copy={copy} onTier={() => {}} />);
    expect(stampOn()).toEqual([]);
    expect(localStorage.getItem('tp:swipe-demo')).toBeNull();
    document.body.innerHTML = '';
    setMotion(false);
    render(<Rate item={item} n={1} total={3} copy={copy} onTier={() => {}} />);
    expect(stampOn()).toEqual([]);
    expect(localStorage.getItem('tp:swipe-demo')).toBeNull();
  });
});
