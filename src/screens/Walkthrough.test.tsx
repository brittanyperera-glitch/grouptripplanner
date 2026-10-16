import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpenItem } from '../lib/openItems';
import Walkthrough from './Walkthrough';

const items: OpenItem[] = [
  { id: 'votes', label: 'x', count: 1, target: { tab: 'Group', view: 'knockouts' } },
  { id: 'rate', label: 'x', count: 12, target: { tab: 'Picks' } },
  { id: 'awards', label: 'x', target: { tab: 'Awards' } },
];
const setup = (list = items) => {
  const onGo = vi.fn();
  const onDone = vi.fn();
  render(<Walkthrough name="Lazza" items={list} onGo={onGo} onDone={onDone} />);
  return { onGo, onDone };
};
const sentence = () => document.querySelector('.hw-sentence')?.textContent;
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

describe('Walkthrough', () => {
  it('opens with the greeting, then one screen per item in order, then the close', () => {
    setup();
    expect(sentence()).toBe('Greetings, Lazza. It seems you have some travel admin to do.');
    next();
    expect(sentence()).toContain('1 head-to-head.');
    next();
    expect(sentence()).toContain('12 places');
    next();
    expect(sentence()).toContain('awards are in');
    next();
    expect(sentence()).toBe("That's the lot, Lazza. Off you go.");
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('shows the accent words as accent type', () => {
    setup();
    expect([...document.querySelectorAll('.wt-accent')].map(e => e.textContent)).toEqual(['Lazza', 'travel admin']);
  });

  it('has exactly one primary action per screen', () => {
    setup();
    for (let i = 0; i < items.length + 2; i++) {
      expect(document.querySelectorAll('.cta')).toHaveLength(1);
      if (i < items.length + 1) fireEvent.click(screen.queryByRole('button', { name: 'Next' }) ?? document.querySelector('.cta')!);
    }
  });

  it('Skip is on every screen and calls onDone', () => {
    for (let at = 0; at < items.length + 2; at++) {
      const { onDone, onGo } = setup();
      for (let i = 0; i < at; i++) next();
      fireEvent.click(screen.getByRole('button', { name: "Skip, I'll do it later" }));
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onGo).not.toHaveBeenCalled();
      document.body.innerHTML = '';
    }
  });

  it('the primary button calls onGo with that item then onDone', () => {
    const { onGo, onDone } = setup();
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Rate them' }));
    expect(onGo).toHaveBeenCalledWith(items[1]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
