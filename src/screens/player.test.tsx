import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Name from './Name';

// motion() is 'still' in jsdom (one tap goes straight in); a reduced-motion matchMedia lets a tap preview the card.
const original = window.matchMedia;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { window.matchMedia = original; });

describe('player card stats', () => {
  it('shows the real number when a joke stat goes past 10, and marks the bar as overflowing', async () => {
    const user = userEvent.setup();
    const players = { Alex: { title: 'Solo Wolf', stats: [{ label: 'Ego', value: 11 }, { label: 'Navigation', value: 4 }] } };
    render(<Name welcome="" players={players} onPick={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /^Alex$/ }));
    const ego = await screen.findByRole('meter', { name: 'Ego' });
    expect(ego).toHaveClass('over');
    expect(within(ego.closest('.stat') as HTMLElement).getByText('11')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Navigation' })).not.toHaveClass('over');
  });
});
