import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import guide from '../content/guide.json';
import Guide from './Guide';

type P = { english: string; sinhala: string; say: string };
const PHRASES = (guide.sections as { id: string; phrases?: P[] }[]).find(s => s.id === 'Phrases')!.phrases!;

const open = async () => {
  const user = userEvent.setup();
  render(<Guide />);
  await user.click(screen.getByRole('button', { name: 'Phrases' }));
  return user;
};
const cards = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Flash cards' }));
const card = () => document.querySelector('.pc-card') as HTMLElement;
const en = () => card().querySelector('.pc-en')!.textContent;
const counter = () => document.querySelector('.pc-count')!.textContent;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Phrase flash cards', () => {
  it('has a List / Flash cards toggle and starts on the list', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Flash cards' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelectorAll('.guide-phrases li')).toHaveLength(20);
    expect(card()).toBeNull();
  });

  it('shows English first, flips on click and on Space/Enter to show Sinhala and the pronunciation', async () => {
    const user = await open();
    await cards(user);
    expect(en()).toBe(PHRASES[0].english);
    expect(card()).toHaveAttribute('data-flipped', 'false');
    await user.click(card());
    expect(card()).toHaveAttribute('data-flipped', 'true');
    expect(card().querySelector('.pc-back')).toHaveAttribute('aria-hidden', 'false');
    expect(card().querySelector('.pc-si')!.textContent).toBe(PHRASES[0].sinhala);
    expect(card().querySelector('.pc-say')!.textContent).toBe(PHRASES[0].say);
    card().focus();
    await user.keyboard(' ');
    expect(card()).toHaveAttribute('data-flipped', 'false');
    await user.keyboard('{Enter}');
    expect(card()).toHaveAttribute('data-flipped', 'true');
  });

  it('Next / Prev move through the deck, wrap at both ends, and reset the flip', async () => {
    const user = await open();
    await cards(user);
    expect(counter()).toBe('1 of 20');
    await user.click(card());
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(counter()).toBe('2 of 20');
    expect(en()).toBe(PHRASES[1].english);
    expect(card()).toHaveAttribute('data-flipped', 'false');
    await user.click(screen.getByRole('button', { name: 'Prev' }));
    await user.click(screen.getByRole('button', { name: 'Prev' }));
    expect(counter()).toBe('20 of 20');
    expect(en()).toBe(PHRASES[19].english);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(counter()).toBe('1 of 20');
  });

  it('swipe left goes next, swipe right goes back, a short drag does nothing', async () => {
    const user = await open();
    await cards(user);
    fireEvent.touchStart(card(), { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(card(), { changedTouches: [{ clientX: 100 }] });
    expect(counter()).toBe('2 of 20');
    fireEvent.touchStart(card(), { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(card(), { changedTouches: [{ clientX: 200 }] });
    expect(counter()).toBe('1 of 20');
    fireEvent.touchStart(card(), { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(card(), { changedTouches: [{ clientX: 110 }] });
    expect(counter()).toBe('1 of 20');
  });

  it('Shuffle changes the order but every phrase appears exactly once', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const user = await open();
    await cards(user);
    await user.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(counter()).toBe('1 of 20');
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      seen.push(en()!);
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect([...seen].sort()).toEqual(PHRASES.map(p => p.english).sort());
    expect(seen).not.toEqual(PHRASES.map(p => p.english));
  });

  it('shows every one of the 20 phrases word for word, front and back', async () => {
    expect(PHRASES).toHaveLength(20);
    const user = await open();
    await cards(user);
    for (const p of PHRASES) {
      expect(en()).toBe(p.english);
      expect(card().querySelector('.pc-si')!.textContent).toBe(p.sinhala);
      expect(card().querySelector('.pc-say')!.textContent).toBe(p.say);
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
  });

  it('remembers the chosen view in tp:phrase-view', async () => {
    const user = await open();
    await cards(user);
    expect(localStorage.getItem('tp:phrase-view')).toBe('cards');
    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(localStorage.getItem('tp:phrase-view')).toBe('list');
  });

  it('opens on flash cards when that was the last choice', async () => {
    localStorage.setItem('tp:phrase-view', 'cards');
    await open();
    expect(card()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Flash cards' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('survives blocked storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = await open();
    await cards(user);
    expect(card()).not.toBeNull();
  });

  it('under webdriver / jsdom the card is flat: no 3D', async () => {
    const user = await open();
    await cards(user);
    expect(card()).toHaveAttribute('data-flat', 'true');
  });
});
