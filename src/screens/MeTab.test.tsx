import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../guest/MemoryStore';
import { seedState } from '../guest/seed';
import { AppProvider, useApp } from '../state';
import type { Person } from '../types';
import MeTab from './MeTab';

function As({ who, children }: { who: Person; children: JSX.Element }) {
  const { setMe, me } = useApp();
  useEffect(() => { setMe(who); }, [setMe, who]);
  return me === who ? children : null;
}
const show = (who: Person, props: Partial<Parameters<typeof MeTab>[0]> = {}, state = seedState()) => {
  const onOpen = vi.fn(), onNotYou = vi.fn();
  render(
    <AppProvider store={new MemoryStore(state)} sandbox={{ onFinish: () => {} }}>
      <As who={who}><MeTab me={who} onOpen={onOpen} onQuiz={() => {}} onBingo={() => {}} onNotYou={onNotYou} {...props} /></As>
    </AppProvider>,
  );
  return { onOpen, onNotYou };
};

describe('MeTab', () => {
  it('shows an Organiser row to Brittany that opens the organiser sub-screen', async () => {
    const { onOpen } = show('Brittany');
    fireEvent.click(await screen.findByRole('button', { name: /^Organiser/ }));
    expect(onOpen).toHaveBeenCalledWith({ sub: 'organiser' });
  });

  it('a friend sees no Organiser row', async () => {
    show('Alex');
    await screen.findByRole('button', { name: /Not you/ });
    expect(screen.queryByRole('button', { name: /^Organiser/ })).toBeNull();
  });

  it('shows the Awards row when the shell passes an awards opener', async () => {
    const onAwards = vi.fn();
    show('Alex', { onAwards });
    fireEvent.click(await screen.findByRole('button', { name: /^Awards/ }));
    expect(onAwards).toHaveBeenCalledTimes(1);
  });

  it('has no Awards row without an awards opener', async () => {
    show('Alex');
    await screen.findByRole('button', { name: /Not you/ });
    expect(screen.queryByRole('button', { name: /^Awards/ })).toBeNull();
  });

  it('renders the profile card with no Back button', async () => {
    show('Alex');
    await screen.findByLabelText('Alex trip card');
    expect(screen.queryByRole('button', { name: /^Back$/ })).toBeNull();
  });

  it.each([
    ['Group stats', { sub: 'crew-stats' }],
    ['How we decided', { sub: 'crew-decided' }],
    ['What would you change\\?', { sub: 'complaints' }],
  ])('the %s row opens its sub-screen id', async (name, open) => {
    const { onOpen } = show('Alex');
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));
    expect(onOpen).toHaveBeenCalledWith(open);
  });

  it('has no Group stats row until all five have submitted', async () => {
    const s = seedState();
    s.responses.Lazza = { ...s.responses.Lazza!, submitted: false };
    show('Alex', {}, s);
    await screen.findByRole('button', { name: /How we decided/ });
    expect(screen.queryByRole('button', { name: /^Group stats/ })).toBeNull();
  });

  it('Not you? and Log out call their handlers', async () => {
    const onLogout = vi.fn();
    const { onNotYou } = show('Alex', { onLogout });
    fireEvent.click(await screen.findByRole('button', { name: /Not you/ }));
    expect(onNotYou).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('has no Log out row without a handler', async () => {
    show('Alex');
    await screen.findByRole('button', { name: /Not you/ });
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });
});
