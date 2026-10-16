import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStore } from '../store/local';
import { AppProvider, useApp } from '../state';
import type { GroupResult, Knockout } from '../types';
import Knockouts from './Knockouts';

vi.mock('../data/catalogue.json', async () => ({ default: (await import('../lib/__fixtures__/catalogue-46.json')).default }));

const GALLE: Knockout = { forkId: 'ko:galle', a: ['galle'], b: ['horton'], votes: { a: ['Alex'], b: ['Lazza'] } };
const YALA: Knockout = { forkId: 'ko:yala', a: ['yala'], b: ['sigiriya'], votes: { a: [], b: [] } };
const group = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knocked: [], finalized: [], locked: false, knockouts: [GALLE, YALA], ...over,
});
const alexVoted = () => localStorage.setItem('tp:votes', JSON.stringify([{ forkId: 'ko:galle', name: 'Alex', choice: 'a' }]));
const forks = () => screen.getAllByRole('group', { name: /^Knockout:/ });

function AsGuest({ children }: { children: ReactNode }) {
  const { me, setMe } = useApp();
  useEffect(() => { setMe('Aunty'); }, [setMe]);
  return me ? <>{children}</> : null;
}

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });

describe('voted forks shrink and sink', () => {
  it('lists forks I have not voted on before forks I have', async () => {
    alexVoted();
    render(<AppProvider store={new LocalStore()}><Knockouts group={group()} /></AppProvider>);
    await screen.findAllByRole('group', { name: /^Knockout:/ });
    expect(forks().map(f => f.getAttribute('aria-label'))).toEqual([expect.stringMatching(/Yala/), expect.stringMatching(/Galle/)]);
  });
  it('a voted fork is one compact row with my pick and the dots, and Change brings both cards back', async () => {
    alexVoted();
    const user = userEvent.setup();
    render(<AppProvider store={new LocalStore()}><Knockouts group={group()} /></AppProvider>);
    await screen.findAllByRole('group', { name: /^Knockout:/ });
    const row = forks()[1];
    expect(within(row).getByText(/You picked/)).toHaveTextContent('You picked Galle Fort and sunset');
    expect(within(row).getByText('2 of 5 voted')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^Vote for/ })).toBeNull();
    await user.click(within(row).getByRole('button', { name: 'Change' }));
    expect(within(forks()[1]).getByRole('button', { name: /^Vote for Galle/ })).toBeInTheDocument();
    expect(within(forks()[1]).getByRole('button', { name: /^Vote for Horton/ })).toBeInTheDocument();
  });
  it('a vote cast just now stays where it is until the view is reopened', async () => {
    const user = userEvent.setup();
    render(<AppProvider store={new LocalStore()}><Knockouts group={group()} /></AppProvider>);
    await user.click(await within((await screen.findAllByRole('group', { name: /^Knockout:/ }))[0]).findByRole('button', { name: /^Vote for Galle/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Vote for Galle/ })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });
  it("a guest's saved vote collapses the fork too", async () => {
    localStorage.setItem('tp:votes', JSON.stringify([{ forkId: 'ko:galle', name: 'Aunty', choice: 'b' }]));
    render(<AppProvider store={new LocalStore()} sandbox={{ onFinish: () => {} }}><AsGuest><Knockouts group={group()} /></AsGuest></AppProvider>);
    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByText(/You picked/)).toHaveTextContent('You picked Horton Plains');
  });
});

describe('Decided is folded behind its count', () => {
  const results: GroupResult['results'] = [
    { forkId: 'ko:a', a: ['galle'], b: ['horton'], winner: 'a' }, { forkId: 'ko:b', a: ['yala'], b: ['sigiriya'], winner: 'b' }, { forkId: 'ko:c', a: ['jaffna'], b: ['delft'], winner: 'a' },
  ];
  it('is collapsed by default with the count, and opens on tap', async () => {
    const user = userEvent.setup();
    render(<AppProvider store={new LocalStore()}><Knockouts group={group({ knockouts: [], results })} /></AppProvider>);
    const head = await screen.findByRole('button', { name: /Decided\s*3/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/ beat /)).toBeNull();
    await user.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText(/ beat /)).toHaveLength(3);
  });
});

describe('a fully answered keep/drop group folds', () => {
  const genre: Knockout = {
    forkId: 'genre:safari', a: ['yala', 'udawalawe'], b: [], votes: { a: [], b: [] },
    genre: { id: 'safari', tally: { yala: { keep: [], drop: [] }, udawalawe: { keep: [], drop: [] } } },
  };
  const answered = () => localStorage.setItem('tp:votes', JSON.stringify([
    { forkId: 'genre:safari:yala', name: 'Alex', choice: 'a' }, { forkId: 'genre:safari:udawalawe', name: 'Alex', choice: 'b' },
  ]));
  it('shows one row with Saved and Change, and Change brings the toggles back', async () => {
    answered();
    const user = userEvent.setup();
    render(<AppProvider store={new LocalStore()}><Knockouts group={group({ knockouts: [genre] })} /></AppProvider>);
    const card = await screen.findByRole('group', { name: '2 safaris on the shortlist' });
    expect(within(card).getByText('Saved')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /^Keep / })).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Change' }));
    expect(within(card).getByRole('button', { name: 'Keep Yala leopard safari' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card).getByRole('button', { name: 'Keep Udawalawe elephants and Transit Home' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('an unanswered group stays open', async () => {
    render(<AppProvider store={new LocalStore()}><Knockouts group={group({ knockouts: [genre] })} /></AppProvider>);
    const card = await screen.findByRole('group', { name: '2 safaris on the shortlist' });
    expect(within(card).getByRole('button', { name: 'Keep Yala leopard safari' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Change' })).toBeNull();
  });
});
