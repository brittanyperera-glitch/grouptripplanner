import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { emptyRanking } from '../types';
import type { Item, Ranking } from '../types';
import Rerank from './Rerank';

// Brittany 2026-10-15: rows are dragged (no arrow buttons, no tier drop-down); a keyboard does the same.
const mk = (id: string, name: string): Item => ({
  id, name, area: 'South coast', about: '', hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, when: 'morning',
} as unknown as Item);
const ITEMS = [mk('a', 'Alpha'), mk('b', 'Beta'), mk('c', 'Gamma'), mk('d', 'Delta')];
const BY = Object.fromEntries(ITEMS.map(i => [i.id, i]));

function Harness({ start, draws = false, seen }: { start: Ranking; draws?: boolean; seen: (r: Ranking, id: string) => void }) {
  const [r, setR] = useState(start);
  return <Rerank ranking={r} byId={BY} draws={draws} onChange={(next, id) => { setR(next); seen(next, id); }} onSubmit={() => undefined} title="Your picks" sub="s" cta="Go" />;
}
const ranking = (over: Partial<Ranking>): Ranking => ({ ...emptyRanking(), ...over });
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });
const names = (tier: string) => within(screen.getByRole('list', { name: tier })).queryAllByRole('listitem').map(li => li.querySelector('.nm')?.textContent);

describe('Your picks rows', () => {
  it('has no up or down buttons and no tier drop-down', () => {
    render(<Harness start={ranking({ must: [['a'], ['b']], keen: [['c']] })} seen={() => undefined} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Move .* (up|down)$/ })).toBeNull();
  });

  it('keyboard: Space lifts a row, arrows reorder inside the tier, Space drops and saves the order', async () => {
    const seen = vi.fn(); const user = userEvent.setup();
    render(<Harness start={ranking({ must: [['a'], ['b'], ['c']] })} seen={seen} />);
    row('Gamma').focus();
    await user.keyboard(' {ArrowUp}{ArrowUp}');
    expect(names('Musts')).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(seen).not.toHaveBeenCalled();
    await user.keyboard(' ');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].must).toEqual([['c'], ['a'], ['b']]);
    expect(seen.mock.calls[0][1]).toBe('c');
    expect(document.querySelector('.sr-only')).toHaveTextContent('Gamma dropped. Musts, position 1 of 3.');
  });

  it('keyboard: Escape puts the row back', async () => {
    const seen = vi.fn(); const user = userEvent.setup();
    render(<Harness start={ranking({ must: [['a'], ['b']] })} seen={seen} />);
    row('Beta').focus();
    await user.keyboard(' {ArrowUp}{Escape}');
    expect(names('Musts')).toEqual(['Alpha', 'Beta']);
    expect(seen).not.toHaveBeenCalled();
  });

  it('keyboard: arrowing past the end of a tier moves the row into the next tier', async () => {
    const seen = vi.fn(); const user = userEvent.setup();
    render(<Harness start={ranking({ must: [['a'], ['b']], keen: [['c']] })} seen={seen} />);
    row('Beta').focus();
    await user.keyboard(' {ArrowDown} ');
    expect(seen.mock.calls[0][0].must).toEqual([['a']]);
    expect(seen.mock.calls[0][0].keen).toEqual([['b'], ['c']]);
    expect(names('Keens')).toEqual(['Beta', 'Gamma']);
  });

  it('keyboard: an empty tier can be reached', async () => {
    const seen = vi.fn(); const user = userEvent.setup();
    render(<Harness start={ranking({ must: [['a']] })} seen={seen} />);
    row('Alpha').focus();
    await user.keyboard(' {ArrowDown}{ArrowDown}{ArrowDown} ');
    expect(seen.mock.calls[0][0].skip).toEqual([['a']]);
  });

  it('before submit there are no draws: an old shared spot is split on the first change and no draw control shows', async () => {
    const seen = vi.fn(); const user = userEvent.setup();
    render(<Harness start={ranking({ must: [['a', 'b', 'c']] })} seen={seen} />);
    expect(screen.queryByRole('button', { name: /^Draw / })).toBeNull();
    row('Gamma').focus();
    await user.keyboard(' {ArrowUp} ');
    expect(seen.mock.calls[0][0].must).toEqual([['a'], ['c'], ['b']]);
  });

  it('on Finalize a row can draw with the one above, up to 5 to a spot, and split off again', async () => {
    const seen = vi.fn(); const user = userEvent.setup();
    render(<Harness draws start={ranking({ must: [['a'], ['b'], ['c']] })} seen={seen} />);
    expect(screen.queryByRole('button', { name: 'Draw Alpha with the row above' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Draw Beta with the row above' }));
    expect(seen.mock.calls[0][0].must).toEqual([['a', 'b'], ['c']]);
    expect(Array.from(document.querySelectorAll('.item .rk')).map(n => n.textContent)).toEqual(['1=', '1=', '3']);
    expect(screen.getByRole('button', { name: 'Draw Beta with the row above' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Draw Beta with the row above' }));
    expect(seen.mock.calls[1][0].must).toEqual([['a'], ['b'], ['c']]);
  });

  it('on Finalize a keyboard move keeps other draws and dropping inside one splits it', async () => {
    const seen = vi.fn(); const user = userEvent.setup();
    render(<Harness draws start={ranking({ must: [['a', 'b'], ['c']] })} seen={seen} />);
    row('Gamma').focus();
    await user.keyboard(' {ArrowUp} ');
    expect(seen.mock.calls[0][0].must).toEqual([['a'], ['c'], ['b']]);
  });
});
