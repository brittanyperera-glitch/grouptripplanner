import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../guest/MemoryStore';
import { AppProvider, useApp } from '../state';
import type { Player } from '../types';
import Friends from './Friends';

function Pick({ who }: { who: Player }) {
  const { setMe, me } = useApp();
  useEffect(() => { setMe(who); }, [setMe, who]);
  return me === who ? <Friends /> : null;
}
const view = (who: Player) => render(<AppProvider store={new MemoryStore()} sandbox={{ onFinish: () => {} }}><Pick who={who} /></AppProvider>);

describe('Friends for guests', () => {
  it('(g) renders nothing for a guest and still renders for a trip member', async () => {
    const a = view('Aunty');
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByLabelText('Friendship stats')).toBeNull();
    a.unmount();
    view('Alex');
    expect(await screen.findByLabelText('Friendship stats')).toBeTruthy();
  });
});
