import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import { emptyRanking } from '../types';
import type { GroupResult, Item, Person, Plan as PlanT, Ranking, Response } from '../types';
import Finalize from './Finalize';
import Rerank from './Rerank';

// Brittany 2026-10-16: nothing gets buried under a long scroll; Mehs fold behind a count, Save my list stays in reach.
const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const [A, B, C, ...REST] = ITEMS;
const BY = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const mehRanking = (): Ranking => ({ ...emptyRanking(), must: [[A.id]], keen: [[B.id]], meh: [[C.id], ...REST.slice(0, 5).map(i => [i.id])] });

function Harness({ start }: { start: Ranking }) {
  const [r, setR] = useState(start);
  return <Rerank ranking={r} byId={BY} onChange={next => setR(next)} onSubmit={() => undefined} title="Your picks" sub="s" cta="Go" />;
}

describe('Mehs fold', () => {
  it('starts collapsed with the count in its headline, Musts and Keens stay open', () => {
    render(<Harness start={mehRanking()} />);
    const head = screen.getByRole('button', { name: /^Mehs 6/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Mehs' })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Musts' })).getAllByRole('listitem')).toHaveLength(1);
    expect(within(screen.getByRole('list', { name: 'Keens' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Skips' })).toBeInTheDocument();
  });
  it('expands on tap and folds again', async () => {
    const user = userEvent.setup();
    render(<Harness start={mehRanking()} />);
    await user.click(screen.getByRole('button', { name: /^Mehs 6/ }));
    expect(screen.getByRole('button', { name: /^Mehs 6/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('list', { name: 'Mehs' })).getAllByRole('listitem')).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: /^Mehs 6/ }));
    expect(screen.queryByRole('list', { name: 'Mehs' })).toBeNull();
  });
  it('an empty Mehs group has nothing to fold and stays a drop target', () => {
    render(<Harness start={{ ...emptyRanking(), must: [[A.id]] }} />);
    expect(screen.queryByRole('button', { name: /^Mehs/ })).toBeNull();
    expect(screen.getByRole('list', { name: 'Mehs' })).toBeInTheDocument();
  });
  it('keyboard: arrowing a row into the folded Mehs opens them so the lifted row keeps focus', async () => {
    const user = userEvent.setup();
    render(<Harness start={{ ...emptyRanking(), keen: [[B.id]], meh: [[C.id]] }} />);
    screen.getByRole('button', { name: new RegExp(`^${B.name},`) }).focus();
    await user.keyboard(' {ArrowDown}');
    expect(screen.getByRole('list', { name: 'Mehs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(`^${B.name},`) })).toHaveFocus();
  });
});

const resp = (name: Person): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: mehRanking(), rated: ITEMS.map(i => i.id), submitted: true, updatedAt: '',
});
const plan = (): PlanT => ({ route: ['AIR', 'AIR'], areas: [], chosen: [A.id], dropped: [], travelHours: 1, fits: true, missingMusts: [], score: 0, days: [] });
const group: GroupResult = {
  open: true, days: 9, pace: 1, base: plan(), final: plan(), knockouts: [], results: [], extras: [], knocked: [], finalized: [], locked: false,
};

describe('Finalize', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); localStorage.setItem('tp:resp:Alex', JSON.stringify(resp('Alex'))); });
  it('keeps Save my list pinned (rendered once, sticky) and folds the Mehs', async () => {
    const user = userEvent.setup();
    render(<AppProvider store={new LocalStore()}><Finalize group={group} /></AppProvider>);
    const list = await screen.findByRole('region', { name: 'Finalize your list' });
    const save = screen.getAllByRole('button', { name: 'Save my list' });
    expect(save).toHaveLength(1);
    expect(save[0].parentElement).toHaveClass('foot', 'sticky');
    expect(save[0].parentElement).toHaveStyle({ bottom: '84px' });
    expect(within(list).getByRole('button', { name: /^Mehs 6/ })).toHaveAttribute('aria-expanded', 'false');
    await user.click(save[0]);
    await waitFor(() => expect(JSON.parse(localStorage.getItem('tp:resp:Alex') ?? '{}').final).toBeTruthy());
  });
});
