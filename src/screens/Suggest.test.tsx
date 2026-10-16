import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { Person, Suggestion } from '../types';
import Suggest from './Suggest';

class SpyStore extends LocalStore {
  setSuggestionStatus = vi.fn(async () => {});
}
const sug = (id: string, name: Person, title: string, area: Suggestion['area'] = 'South coast'): Suggestion => ({ id, name, title, area, note: '', status: 'pending', createdAt: '' });
const show = async (me: Person, open: boolean, list: Suggestion[], title: string) => {
  localStorage.setItem('tp:me', me);
  localStorage.setItem('tp:sugg', JSON.stringify(list));
  const store = new SpyStore();
  render(<AppProvider store={store}><Suggest open={open} /></AppProvider>);
  await screen.findAllByText(title);
  return store;
};

describe('Suggest approval after the ratings lock', () => {
  beforeEach(() => localStorage.clear());

  it('shows Approve to Brittany when all five have submitted', async () => {
    await show('Brittany', true, [sug('p1', 'Alex', 'Tea factory tour', 'Hill country')], 'Tea factory tour');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByText('Approved ideas go to the group vote.')).toBeInTheDocument();
  });

  it('groups identical suggestions into one row with one Approve', async () => {
    const list = [sug('a', 'Alex', 'Scuba diving'), sug('b', 'Lazza', ' scuba diving '), sug('c', 'Saulie', 'Scuba Diving')];
    const store = await show('Brittany', true, list, 'Scuba diving');
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
    expect(screen.getByText(/3 people suggested this \(Alex, Lazza, Saulie\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const calls = store.setSuggestionStatus.mock.calls as unknown as [string, string][];
    expect(calls.filter(c => c[1] === 'live')).toEqual([['a', 'live']]);
    expect(calls.filter(c => c[1] === 'rejected').map(c => c[0]).sort()).toEqual(['b', 'c']);
    expect(calls).toHaveLength(3);
  });

  it('rejects the whole group with one Reject', async () => {
    const list = [sug('a', 'Alex', 'Scuba diving'), sug('b', 'Lazza', 'scuba diving')];
    const store = await show('Brittany', true, list, 'Scuba diving');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(store.setSuggestionStatus.mock.calls.map(c => (c as unknown as [string, string])[1])).toEqual(['rejected', 'rejected']);
  });

  it('keeps different areas apart', async () => {
    const list = [sug('a', 'Alex', 'Scuba diving'), sug('b', 'Lazza', 'Scuba diving', 'East coast')];
    await show('Brittany', true, list, 'Scuba diving');
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(2);
  });

  it('shows a non-admin no Approve', async () => {
    await show('Alex', true, [sug('p1', 'Lazza', 'Scuba diving')], 'Scuba diving');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});
