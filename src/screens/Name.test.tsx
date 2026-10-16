import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PEOPLE } from '../types';
import Name, { FLASH } from './Name';

const original = window.matchMedia;
const setMotion = (full: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: !full && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
};
afterEach(() => { window.matchMedia = original; });

const players = { Brittany: { title: 'Trip Boss', stats: [{ label: 'Planning', value: 10 }] }, Alex: { title: 'Solo Wolf', stats: [{ label: 'Ego', value: 11 }] } };
const open = async (onPick = vi.fn()) => {
  const user = userEvent.setup();
  render(<Name welcome="The Homecoming." welcomeSub="Sub line" players={players} onPick={onPick} />);
  await user.click(screen.getByRole('button', { name: 'Choose your character' }));
  return { user, onPick };
};

describe('opening page', () => {
  it('has the title, the sub line and one button, no countdown and no characters', () => {
    setMotion(false);
    render(<Name welcome="The Homecoming." welcomeSub="Sub line" players={players} onPick={() => {}} />);
    expect(screen.getByRole('heading', { name: 'The Homecoming.' })).toBeInTheDocument();
    expect(screen.getByText('Sub line')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Choose your character' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Departing/);
    expect(screen.queryByRole('button', { name: 'Alex' })).toBeNull();
  });
});

describe('The Homecoming opening', () => {
  it('reads like the reference: a SRI LANKA / DEC 2026 kicker, a plain title, a pill button with an arrow', () => {
    setMotion(false);
    render(<Name welcome="The Homecoming." welcomeSub="Sub line" players={players} onPick={() => {}} />);
    const kicker = document.querySelector('.intro-kicker');
    expect(kicker?.textContent).toMatch(/Sri Lanka/i);
    expect(kicker?.textContent).toMatch(/Dec 2026/i);
    const h1 = screen.getByRole('heading', { level: 1, name: 'The Homecoming.' });
    expect(h1).toHaveClass('intro-title');
    expect(h1).not.toHaveClass('display');
    const btn = screen.getByRole('button', { name: /choose your character/i });
    expect(btn).toHaveClass('intro-pill');
    expect(btn.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('puts the most scenic covers first: Nine Arch Bridge leads, then Sigiriya', () => {
    setMotion(false);
    const covers = ['pettah', 'kottu', 'sigiriya', 'crab', 'ninearch', 'tea', 'galle', 'rooftop'].map(id => ({ id, photo: id })) as never[];
    render(<Name welcome="The Homecoming." covers={covers} players={players} onPick={() => {}} />);
    const srcs = Array.from(document.querySelectorAll('.slides img')).map(i => i.getAttribute('src'));
    expect(srcs.slice(0, 2)).toEqual(['/img/ninearch.jpg', '/img/sigiriya.jpg']);
    expect(srcs.length).toBeLessThanOrEqual(6);
    expect(document.querySelector('.slides img.on')?.getAttribute('src')).toBe('/img/ninearch.jpg');
  });
});

describe('character select page', () => {
  it('lists all five by name, centres the first, and shows that character\'s stats', async () => {
    setMotion(true);
    await open();
    for (const p of PEOPLE) expect(screen.getByRole('button', { name: p })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Brittany' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Planning' })).toBeInTheDocument();
  });

  it('arrow keys and the prev/next buttons move the centred character, Select picks them', async () => {
    setMotion(true);
    const { user, onPick } = await open();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: 'Alex' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Ego' })).toHaveClass('over');
    await user.click(screen.getByRole('button', { name: 'Previous character' }));
    expect(screen.getByRole('heading', { name: 'Brittany' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next character' }));
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith('Alex'), { timeout: 3500 });
  });

  it('tapping another character centres it without picking', async () => {
    setMotion(true);
    const { user, onPick } = await open();
    await user.click(screen.getByRole('button', { name: 'Alex' }));
    expect(screen.getByRole('heading', { name: 'Alex' })).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('every character bops on its own beat, and nobody bops when motion is off', async () => {
    setMotion(true);
    await open();
    const delays = PEOPLE.map(p => (screen.getByRole('button', { name: p }) as HTMLElement).style.getPropertyValue('--bop-delay'));
    expect(new Set(delays).size).toBe(PEOPLE.length);
    expect(document.querySelectorAll('.char .bob').length).toBe(PEOPLE.length);
  });

  it('with reduced motion nobody bops', async () => {
    setMotion(false);
    await open();
    expect(document.querySelectorAll('.char .bob').length).toBe(0);
    expect(screen.getByRole('button', { name: 'Alex' })).toBeInTheDocument();
  });
});

describe('select', () => {
  it('Select shows the picked character\'s selfie full screen, and a tap continues straight away', async () => {
    setMotion(true);
    const { user, onPick } = await open();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    const lock = screen.getByRole('dialog', { name: 'Brittany selected' });
    expect(within(lock).getByRole('img', { name: 'Brittany selfie' })).toHaveAttribute('src', '/img/players/brittany-selfie.png');
    expect(onPick).not.toHaveBeenCalled();
    await user.click(lock);
    expect(onPick).toHaveBeenCalledWith('Brittany');
  });

  it('the lock-in eases in and stays readable for at least 1.6 s before it moves on, with no shake', async () => {
    setMotion(true);
    const { user, onPick } = await open();
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      expect(document.querySelector('.welcome.shake')).toBeNull();
      const lock = screen.getByRole('dialog', { name: 'Brittany selected' });
      expect(lock.style.getPropertyValue('--in')).toBe(`${FLASH.in}ms`);
      expect(FLASH.hold).toBeGreaterThanOrEqual(1600);
      act(() => { vi.advanceTimersByTime(FLASH.in + FLASH.hold - 50); });
      expect(onPick).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(FLASH.out + 100); });
      expect(onPick).toHaveBeenCalledWith('Brittany');
    } finally { vi.useRealTimers(); }
    void user;
  });
});

describe('selfie', () => {
  it('a Selfie button opens the centred character\'s selfie, and a tap closes it', async () => {
    setMotion(true);
    const { user } = await open();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Take a selfie' }));
    const dlg = screen.getByRole('dialog', { name: 'Brittany selfie' });
    expect(within(dlg).getByRole('img', { name: 'Brittany selfie' })).toHaveAttribute('src', '/img/players/brittany-selfie.png');
    await user.click(dlg);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await user.click(screen.getByRole('button', { name: 'Take a selfie' }));
    expect(screen.getByRole('img', { name: 'Alex selfie' })).toHaveAttribute('src', '/img/players/alex-selfie.png');
  });
});

describe('roster', () => {
  const roster = PEOPLE.slice(0, 2);
  const openWith = async (onPick = vi.fn(), r?: readonly (typeof PEOPLE)[number][]) => {
    setMotion(true);
    const user = userEvent.setup();
    render(<Name welcome="The Homecoming." players={players} roster={r} onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: 'Choose your character' }));
    return { user, onPick };
  };

  it('shows only the roster names and none of the other trip names', async () => {
    await openWith(vi.fn(), roster);
    for (const p of roster) expect(screen.getByRole('button', { name: p })).toBeInTheDocument();
    for (const p of PEOPLE.slice(2)) expect(screen.queryByRole('button', { name: p })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next character' })).not.toBeDisabled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Next character' })).toBeDisabled();
  });

  it('picking one calls onPick with that exact name', async () => {
    const flipped = [roster[1], roster[0]];
    const { user, onPick } = await openWith(vi.fn(), flipped);
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith(roster[1]), { timeout: 3500 });
  });

  it('with no roster all five show', async () => {
    await openWith();
    for (const p of PEOPLE) expect(screen.getByRole('button', { name: p })).toBeInTheDocument();
  });
});
