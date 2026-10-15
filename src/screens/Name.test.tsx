import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PEOPLE } from '../types';
import Name from './Name';

const original = window.matchMedia;
const setMotion = (full: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: !full && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
};
afterEach(() => { window.matchMedia = original; });

const players = { Brittany: { title: 'Trip Boss', stats: [{ label: 'Planning', value: 10 }] }, Alex: { title: 'Solo Wolf', stats: [{ label: 'Ego', value: 11 }] } };
const open = async (onPick = vi.fn()) => {
  const user = userEvent.setup();
  render(<Name welcome="Trip Planning. Optimized." welcomeSub="Sub line" players={players} onPick={onPick} />);
  await user.click(screen.getByRole('button', { name: 'Choose your character' }));
  return { user, onPick };
};

describe('opening page', () => {
  it('has the title, the sub line and one button, no countdown and no characters', () => {
    setMotion(false);
    render(<Name welcome="Trip Planning. Optimized." welcomeSub="Sub line" players={players} onPick={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Trip Planning. Optimized.' })).toBeInTheDocument();
    expect(screen.getByText('Sub line')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Choose your character' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Departing/);
    expect(screen.queryByRole('button', { name: 'Alex' })).toBeNull();
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
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith('Alex'), { timeout: 2000 });
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
    expect(within(screen.getByRole('button', { name: 'Alex' })).getByText('Alex')).toBeInTheDocument();
  });
});
