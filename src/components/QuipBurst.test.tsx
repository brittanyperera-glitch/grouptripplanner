import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuipBurst from './QuipBurst';

const css = readFileSync('src/styles.css', 'utf8');
const setMotion = (reduce: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};
const setWebdriver = (on: boolean) => Object.defineProperty(window.navigator, 'webdriver', { value: on, configurable: true });

afterEach(() => {
  vi.useRealTimers();
  delete (window as { matchMedia?: unknown }).matchMedia;
  setWebdriver(false);
  window.history.replaceState(null, '', '/');
});

describe('QuipBurst', () => {
  it('fills the screen with her line, exposed as a status, plus a burst of particles', () => {
    setMotion(false);
    render(<QuipBurst text="banger choice" kind="must" onDone={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('banger choice');
    expect(document.querySelector('.quip.quip-must.quip-full')).not.toBeNull();
    expect(document.querySelectorAll('.quip-p').length).toBe(24);
  });

  it('never takes the pointer: a tap underneath still lands and skips the burst', () => {
    setMotion(false);
    const onDone = vi.fn();
    const clicked = vi.fn();
    render(<><button onClick={clicked}>Next</button><QuipBurst text="solid" kind="keen" onDone={onDone} /></>);
    const rule = css.split('\n').find(l => l.startsWith('.quip {'));
    expect(rule).toContain('pointer-events: none');
    const next = screen.getByRole('button', { name: 'Next' });
    fireEvent.pointerDown(next);
    fireEvent.click(next);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalled();
  });

  it('dismisses itself after about 1.2 s', () => {
    vi.useFakeTimers();
    setMotion(false);
    const onDone = vi.fn();
    render(<QuipBurst text="cold" kind="skip" onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(1100); });
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('with reduced motion shows the line with a plain fade and no particles', () => {
    setMotion(true);
    render(<QuipBurst text="hmm interesting choice" kind="meh" onDone={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('hmm interesting choice');
    expect(document.querySelector('.quip-reduced')).not.toBeNull();
    expect(document.querySelectorAll('.quip-p').length).toBe(0);
    expect(document.querySelector('.quip-emoji')).toBeNull();
  });

  it('under webdriver it is a plain line, unless the URL asks for ?quips=1', () => {
    setMotion(false);
    setWebdriver(true);
    const { unmount } = render(<QuipBurst text="say less" kind="must" onDone={() => {}} />);
    expect(screen.getByRole('status')).toHaveClass('quip-toast');
    expect(document.querySelector('.quip')).toBeNull();
    unmount();
    window.history.replaceState(null, '', '/?quips=1');
    render(<QuipBurst text="say less" kind="must" onDone={() => {}} />);
    expect(document.querySelector('.quip.quip-full')).not.toBeNull();
  });
});
