import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../guest/MemoryStore';
import { seedState } from '../guest/seed';
import { AppProvider, useApp } from '../state';
import type { GroupResult, Person } from '../types';
import GroupHub from './GroupHub';

const GROUP = { open: true, days: 9, pace: 1, base: null, knockouts: [], results: [], final: null, extras: [], knocked: [], finalized: [], locked: false } as unknown as GroupResult;

function As({ who, children }: { who: Person; children: JSX.Element }) {
  const { setMe, me } = useApp();
  useEffect(() => { setMe(who); }, [setMe, who]);
  return me === who ? children : null;
}
const view = (who: Person, el: JSX.Element, store = new MemoryStore(seedState())) =>
  render(<AppProvider store={store} sandbox={{ onFinish: () => {} }}><As who={who}>{el}</As></AppProvider>);

describe('Complaints', () => {
  it('the hub block opens the complaints view', async () => {
    const onView = vi.fn();
    view('Alex', <GroupHub group={GROUP} view="hub" onView={onView} />);
    fireEvent.click(await screen.findByRole('button', { name: /Complaints/ }));
    await vi.waitFor(() => expect(onView).toHaveBeenCalledWith('complaints'));
  });

  it('offers re-checking knockouts and finalizing, and sends a comment to the store', async () => {
    const onView = vi.fn(), onFinalize = vi.fn();
    const store = new MemoryStore(seedState());
    view('Alex', <GroupHub group={GROUP} view="complaints" onView={onView} onFinalize={onFinalize} />, store);
    fireEvent.click(await screen.findByRole('button', { name: /Check knockouts again/ }));
    await vi.waitFor(() => expect(onView).toHaveBeenCalledWith('knockouts'));
    fireEvent.click(screen.getByRole('button', { name: /Finalize again/ }));
    expect(onFinalize).toHaveBeenCalled();

    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Your complaint'), { target: { value: 'Too many temples' } });
    fireEvent.click(send);
    expect(await screen.findByText('Too many temples')).toBeTruthy();
    expect(await store.loadComplaints()).toMatchObject([{ name: 'Alex', text: 'Too many temples' }]);
  });

  it('hides Finalize again once the plan is locked', async () => {
    view('Alex', <GroupHub group={{ ...GROUP, locked: true }} view="complaints" onView={() => {}} onFinalize={() => {}} />);
    await screen.findByRole('button', { name: /Check knockouts again/ });
    expect(screen.queryByRole('button', { name: /Finalize again/ })).toBeNull();
    expect(screen.getByText(/plan is locked/)).toBeTruthy();
  });

  it("shows Brittany everyone's complaints and others only their own", async () => {
    const store = new MemoryStore(seedState());
    await store.addComplaint({ name: 'Antek', text: 'Antek says no' });
    view('Alex', <GroupHub group={GROUP} view="complaints" onView={() => {}} />, store);
    await screen.findByLabelText('Your complaint');
    expect(screen.queryByText(/Antek says no/)).toBeNull();
  });

  it("Brittany sees Antek's complaint with the name", async () => {
    const store = new MemoryStore(seedState());
    await store.addComplaint({ name: 'Antek', text: 'Antek says no' });
    view('Brittany', <GroupHub group={GROUP} view="complaints" onView={() => {}} />, store);
    expect(await screen.findByText('Antek: Antek says no')).toBeTruthy();
  });
});
