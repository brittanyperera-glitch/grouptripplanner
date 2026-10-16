import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../guest/MemoryStore';
import { seedState } from '../guest/seed';
import { friendStats } from '../lib/friendship';
import { tierOf } from '../lib/ranking';
import { AppProvider, useApp } from '../state';
import { emptyRanking, PEOPLE, type GroupResult, type Person } from '../types';
import Everyone from './Everyone';
import GroupHub from './GroupHub';

const GROUP = { open: true, days: 9, pace: 1, base: null, knockouts: [], results: [], final: null, extras: [], knocked: [], finalized: [], locked: false } as unknown as GroupResult;

function As({ children }: { children: JSX.Element }) {
  const { setMe, me } = useApp();
  useEffect(() => { setMe('Alex'); }, [setMe]);
  return me === 'Alex' ? children : null;
}
// The seeded crew all agree 100% with each other, which has no real twin; Lazza skipping everything gives Alex a spread.
const spread = () => {
  const s = seedState();
  const a = s.responses.Lazza!;
  s.responses.Lazza = { ...a, ranking: { ...emptyRanking(), skip: Object.values(a.ranking).flat() } };
  return s;
};
const view = (el: JSX.Element) => render(<AppProvider store={new MemoryStore(spread())} sandbox={{ onFinish: () => {} }}><As>{el}</As></AppProvider>);

function Probe({ out }: { out: { twin?: string; musts?: Record<string, number> } }) {
  const { state, me, items } = useApp();
  const t = me ? friendStats(state.responses, me as Person).twin : null;
  out.twin = t ? `Travel twin: ${t.name} ${t.pct}%` : undefined;
  out.musts = Object.fromEntries(items.map(i => [i.name, PEOPLE.filter(p => state.responses[p] && tierOf(state.responses[p]!.ranking, i.id) === 'must').length]));
  return null;
}

describe('T26', () => {
  it('hub Group stats line shows the travel twin and percentage', async () => {
    const out: { twin?: string } = {};
    view(<><Probe out={out} /><GroupHub group={GROUP} view="hub" onView={() => {}} /></>);
    await screen.findByRole('button', { name: /Group stats/ });
    expect(out.twin).toMatch(/^Travel twin: \w+ \d+%$/);
    expect(screen.getByRole('button', { name: /Group stats/ }).textContent).toContain(out.twin!);
  });
  it('Everyone orders by Musts regardless of area', async () => {
    const out: { musts?: Record<string, number> } = {};
    const { container } = view(<><Probe out={out} /><Everyone open /></>);
    await screen.findByLabelText('Everyone');
    const names = [...container.querySelectorAll('tbody .nm')].map(e => e.textContent!);
    const counts = names.map(n => out.musts![n]);
    expect(names.length).toBeGreaterThan(5);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(Math.max(...counts)).toBeGreaterThan(Math.min(...counts));
  });
  it('Everyone block line carries real numbers', async () => {
    view(<GroupHub group={GROUP} view="hub" onView={() => {}} />);
    expect((await screen.findByRole('button', { name: /Everyone's picks/ })).textContent).toMatch(/\d+ places, \d+ Musts/);
  });
});
