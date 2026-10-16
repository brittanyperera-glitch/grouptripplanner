import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Landing from './Landing';

const setup = () => {
  const onTrip = vi.fn(), onGuest = vi.fn();
  render(<Landing onTrip={onTrip} onGuest={onGuest} />);
  return { onTrip, onGuest };
};

describe('Landing', () => {
  it('shows the title and two real buttons with accessible names', () => {
    setup();
    // Changed deliberately (Brittany 2026-10-16): brand is now GROUP TRIP HERO, with "Sri Lanka: The Homecoming" beneath.
    expect(screen.getByRole('heading', { name: 'Group Trip Hero' })).toBeInTheDocument();
    expect(screen.getByText('Sri Lanka: The Homecoming')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons.every(b => b.tagName === 'BUTTON')).toBe(true);
    expect(screen.getByRole('button', { name: /I'm on the trip/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try it as a guest/ })).toBeInTheDocument();
  });
  it('each card calls only its own prop', async () => {
    const { onTrip, onGuest } = setup();
    await userEvent.click(screen.getByRole('button', { name: /I'm on the trip/ }));
    expect([onTrip.mock.calls.length, onGuest.mock.calls.length]).toEqual([1, 0]);
    await userEvent.click(screen.getByRole('button', { name: /Try it as a guest/ }));
    expect([onTrip.mock.calls.length, onGuest.mock.calls.length]).toEqual([1, 1]);
  });
  it('keeps every string under 25 words', () => {
    setup();
    for (const el of document.querySelectorAll('h1, .landing-h, .landing-sub')) expect((el.textContent ?? '').trim().split(/\s+/).length).toBeLessThan(25);
  });
});
