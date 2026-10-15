import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuipBurst, { QUIP_MS } from './QuipBurst';

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
  it('fills the screen with her line, exposed as a status', () => {
    setMotion(false);
    render(<QuipBurst text="banger choice" kind="must" onDone={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('banger choice');
    expect(document.querySelector('.quip.quip-must.quip-full')).not.toBeNull();
  });

  // Brittany 2026-10-15: "the it's decided quip is really nice - make them all like this but make them all big, no emojis".
  it.each(['must', 'skip', 'hi'] as const)('%s: short and long lines get the one big type style, with no emoji or glyph particles', kind => {
    setMotion(false);
    for (const text of ["it's decided", 'okay this one is a long line that has to wrap over a few lines and still be big']) {
      const { container, unmount } = render(<QuipBurst text={text} kind={kind} onDone={() => {}} />);
      const line = screen.getByRole('status');
      expect(line.className).toBe('quip-text');
      expect(container.querySelectorAll('.quip-p, .quip-parts, .quip-emoji')).toHaveLength(0);
      expect(container.textContent).not.toMatch(/[\p{Extended_Pictographic}←-⇿■-➿]/u);
      unmount();
    }
  });

  it('every quip line in the copy is free of emoji', () => {
    const copyText = readFileSync('src/content/copy.json', 'utf8');
    expect(copyText.match(/\p{Extended_Pictographic}/gu) ?? []).toEqual([]);
  });

  it('never takes the pointer: a tap underneath still lands and skips the burst', () => {
    setMotion(false);
    const onDone = vi.fn();
    const clicked = vi.fn();
    render(<><button onClick={clicked}>Next</button><QuipBurst text="solid" kind="must" onDone={onDone} /></>);
    const rule = css.split('\n').find(l => l.startsWith('.quip {'));
    expect(rule).toContain('pointer-events: none');
    const next = screen.getByRole('button', { name: 'Next' });
    fireEvent.pointerDown(next);
    fireEvent.click(next);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalled();
  });

  it.each([false, true])('eases in, holds readable for at least 1.6 s, then eases out (reduced motion: %s)', reduce => {
    vi.useFakeTimers();
    setMotion(reduce);
    const onDone = vi.fn();
    render(<QuipBurst text="cold" kind="skip" onDone={onDone} />);
    const { in: enter, hold, out } = QUIP_MS;
    expect(enter).toBeGreaterThanOrEqual(300);
    expect(hold).toBeGreaterThanOrEqual(1600);
    expect(out).toBeGreaterThanOrEqual(300);
    const el = document.querySelector('.quip') as HTMLElement;
    expect(el.style.getPropertyValue('--in')).toBe(`${enter}ms`);
    expect(el.style.getPropertyValue('--hold')).toBe(`${hold}ms`);
    expect(el.style.getPropertyValue('--out')).toBe(`${out}ms`);
    act(() => { vi.advanceTimersByTime(enter + hold + out - 50); });
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('the overlay CSS fades in over --in and only starts leaving after --in + --hold', () => {
    const rule = css.split('\n').find(l => l.startsWith('.quip {')) ?? '';
    expect(rule).toMatch(/q-in var\(--in\)/);
    expect(rule).toMatch(/q-out var\(--out\)[^,;]*calc\(var\(--in\) \+ var\(--hold\)\)/);
  });

  it('nothing slams, shakes, wobbles or strobes', () => {
    const motionLines = css.split('\n').filter(l => /^\s*\.(quip|flash|welcome|shake)/.test(l));
    for (const l of motionLines) expect(l).not.toMatch(/q-slam|shake|q-wobble|q-sag|q-ring|q-burst|q-drop/);
  });

  it('with reduced motion shows the line with a plain fade and no particles', () => {
    setMotion(true);
    render(<QuipBurst text="hmm interesting choice" kind="skip" onDone={() => {}} />);
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

  it.each(['keen', 'meh'] as const)('%s plays nothing: no overlay, no toast, and it finishes at once', kind => {
    setMotion(false);
    const onDone = vi.fn();
    const { container } = render(<QuipBurst text="quiet" kind={kind} onDone={onDone} />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });
});
