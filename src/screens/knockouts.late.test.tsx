import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { GroupResult, Knockout } from '../types';
import Knockouts from './Knockouts';

vi.mock('../data/catalogue.json', async () => ({ default: (await import('../lib/__fixtures__/catalogue-46.json')).default }));

const FIT = { day: 4, hub: 'South coast', travelBefore: 18.2, travelAfter: 19.21 };
const LATE: Knockout = { forkId: 'ko:galle', a: ['galle'], b: ['horton', 'sigiriya'], votes: { a: [], b: [] }, fit: FIT };
const PLAIN: Knockout = { ...LATE, fit: undefined };
const group = (k: Knockout): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knocked: [], finalized: [], locked: false, knockouts: [k],
});
const show = (k: Knockout) => render(<AppProvider store={new LocalStore()}><Knockouts group={group(k)} /></AppProvider>);

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });

describe('how a late place fits the plan', () => {
  it('a late fork prints one fit line under the conflict line', async () => {
    show(LATE);
    expect(await screen.findByTestId('ko-fit')).toHaveTextContent('If added: day 4 in South coast, travel 18.2 h to 19.2 h.');
    expect(screen.getAllByTestId('ko-fit')).toHaveLength(1);
  });
  it('leaves the day out when the place has none', async () => {
    show({ ...LATE, fit: { ...FIT, day: null, hub: null } });
    expect(await screen.findByTestId('ko-fit')).toHaveTextContent(/^If added: travel 18\.2 h to 19\.2 h\.$/);
  });
  it('an ordinary fork prints no fit line', async () => {
    show(PLAIN);
    await screen.findByTestId('ko-why');
    expect(screen.queryByTestId('ko-fit')).toBeNull();
  });
  it('the late option page shows the same line, the other option page does not', async () => {
    const user = userEvent.setup();
    show(LATE);
    await user.click(await screen.findByRole('button', { name: /^Details.*Galle/ }));
    expect(within(await screen.findByRole('dialog')).getByTestId('is-fit')).toHaveTextContent('If added: day 4 in South coast, travel 18.2 h to 19.2 h.');
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: /^Details.*Horton/ }));
    expect(within(await screen.findByRole('dialog')).queryByTestId('is-fit')).toBeNull();
  });
});

describe('the vote count copy', () => {
  it('says how many of the five settle each vote', async () => {
    show(PLAIN);
    expect(await screen.findByText('3 of 5 votes settle each one.')).toBeInTheDocument();
    expect(screen.queryByText(/Three votes settle/)).toBeNull();
  });
});
