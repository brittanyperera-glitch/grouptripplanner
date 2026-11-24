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

describe('CrewPage', () => {
  it.each([
    ['crew-stats', 'Friendship stats'],
    ['crew-decided', 'Everyone'],
    ['complaints', 'Complaints'],
  ] as const)('%s wraps its screen under a Back named Me', async (which, label) => {
    const back = show('Alex', which);
    expect(await screen.findByLabelText(label)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Me/ }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
