import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../guest/MemoryStore';
import { seedState } from '../guest/seed';
import { AppProvider, useApp } from '../state';
import type { Person } from '../types';
import CrewPage from './Crew';
import type { CrewWhich } from './Crew';

function As({ who, children }: { who: Person; children: JSX.Element }) {
  const { setMe, me } = useApp();
  useEffect(() => { setMe(who); }, [setMe, who]);
  return me === who ? children : null;
}
const show = (who: Person, which: CrewWhich, state = seedState()) => {
  const back = vi.fn();
  render(
    <AppProvider store={new MemoryStore(state)} sandbox={{ onFinish: () => {} }}>
      <As who={who}><CrewPage which={which} back={back} backLabel="Me" /></As>
    </AppProvider>,
  );
  return back;
};
const idea = (): ReturnType<typeof seedState> => {
  const s = seedState();
  s.suggestions.push({ id: 's1', name: 'Alex', title: 'Tea tour', area: 'Kandy' as never, note: '', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' });
  return s;
};

describe('CrewPage', () => {
  it.each([
    ['crew-stats', 'Friendship stats'],
    ['crew-decided', 'Everyone'],
    ['suggest', 'Ideas'],
    ['complaints', 'Complaints'],
  ] as const)('%s wraps its screen under a Back named Me', async (which, label) => {
    const back = show('Alex', which);
    expect(await screen.findByLabelText(label)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Me/ }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('Suggest shows Approve and Reject to Brittany', async () => {
    show('Brittany', 'suggest', idea());
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
  });

  it('Suggest shows a friend no Approve or Reject', async () => {
    show('Lazza', 'suggest', idea());
    await screen.findByText('Tea tour');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});
