import { fireEvent, render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
