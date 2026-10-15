import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import copyData from '../content/copy.json';
import HowTo, { type HowToCopy } from './HowTo';
import { FLING } from './useSwipe';

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
const setup = (c: HowToCopy = copy) => {
  const onDone = vi.fn();
  const onSkip = vi.fn();
  render(<HowTo copy={c} onDone={onDone} onSkip={onSkip} />);
  return { onDone, onSkip };
};
const swipe = (dx: number, dy: number) => {
  const card = document.querySelector('.hw-card') as HTMLElement;
  fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(card, { clientX: 100 + dx / 2, clientY: 100 + dy / 2, pointerId: 1 });
  fireEvent.pointerMove(card, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 });
  fireEvent.pointerUp(card, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 });
};
const D = FLING + 40;
const DIR: Record<string, [number, number]> = { skip: [-D, 0], meh: [0, D], keen: [0, -D], must: [D, 0] };
const word = () => document.querySelector('.hw-word')?.textContent;

describe('HowTo practice', () => {
  it('goes Skip, Meh, Keen, Must and each step advances only on its own direction', () => {
    setup();
    expect(word()).toBe('Skip');
    swipe(...DIR.must);
    expect(word()).toBe('Skip');
    expect(screen.getByRole('status').textContent).toBe(copy.nudge);
    swipe(...DIR.skip);
    expect(word()).toBe('Meh');
    swipe(...DIR.keen);
    expect(word()).toBe('Meh');
    swipe(...DIR.meh);
    expect(word()).toBe('Keen');
    swipe(...DIR.keen);
    expect(word()).toBe('Must');
    swipe(...DIR.must);
    expect(word()).toBeUndefined();
    expect(screen.getByRole('button', { name: copy.go })).toBeTruthy();
  });

  it('takes the arrow key and the matching button too, and ignores the wrong ones', () => {
    setup();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(word()).toBe('Skip');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(word()).toBe('Meh');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(word()).toBe('Meh');
    fireEvent.click(screen.getByRole('button', { name: 'Meh' }));
    expect(word()).toBe('Keen');
  });

  it('Skip the tutorial calls onSkip at any point, and Let\'s go calls onDone', () => {
    const { onDone, onSkip } = setup();
    fireEvent.click(screen.getByRole('button', { name: copy.skipTutorial }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    for (const t of ['skip', 'meh', 'keen', 'must'] as const) swipe(...DIR[t]);
    fireEvent.click(screen.getByRole('button', { name: copy.go }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
