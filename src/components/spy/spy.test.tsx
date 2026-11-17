import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../../lib/release');
vi.mock('../sound', () => ({ thud: vi.fn(), jingle: vi.fn() }));
import catalogue from '../../data/catalogue.json';
import legsData from '../../data/legs.json';
import { seedState } from '../../guest/seed';
import { groupResult } from '../../lib/group';
import { crewReadiness, levelOf, missionFiles, nextMove } from '../../lib/missions';
import { RELEASE } from '../../lib/release';
import type { Area, Item, Leg } from '../../types';
import { thud } from '../sound';
import Countdown, { countdownText } from './Countdown';
import CrewRing from './CrewRing';
import MissionFile from './MissionFile';
import NextMove from './NextMove';
import SpyScreen from './SpyScreen';
import Stamp from './Stamp';

const setMotion = (m: 'full' | 'reduced' | 'still') => {
  if (m === 'still') { delete (window as { matchMedia?: unknown }).matchMedia; return; }
  window.matchMedia = ((q: string) => ({ matches: m === 'reduced' && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};
afterEach(() => { cleanup(); setMotion('still'); vi.mocked(thud).mockClear(); });

describe('Stamp', () => {
  it('still motion: the text shows and nothing animates', () => {
    setMotion('still');
    render(<Stamp text="Secured" burst />);
    const el = screen.getByText('Secured');
    expect(el.className).not.toMatch(/thunk/);
    expect(document.querySelectorAll('.spy-burst')).toHaveLength(0);
  });

  it('reduced motion is the same as still', () => {
    setMotion('reduced');
    render(<Stamp text="Secured" burst />);
    expect(screen.getByText('Secured').className).not.toMatch(/thunk/);
    expect(document.querySelectorAll('.spy-burst')).toHaveLength(0);
  });

  it('full motion: the stamp thunks, and a burst only when asked', () => {
    setMotion('full');
    const { unmount } = render(<Stamp text="Secured" />);
    expect(screen.getByText('Secured').className).toMatch(/spy-thunk/);
    expect(document.querySelectorAll('.spy-burst')).toHaveLength(0);
    unmount();
    render(<Stamp text="Done" burst />);
    expect(document.querySelectorAll('.spy-burst').length).toBeGreaterThan(0);
  });

  it('thuds only when asked, through the shared sound module (which owns mute)', () => {
    render(<Stamp text="Quiet" />);
    expect(thud).not.toHaveBeenCalled();
    render(<Stamp text="Loud" sound />);
    expect(thud).toHaveBeenCalledTimes(1);
  });
});

describe('SpyScreen', () => {
  it('shows the code and title, goes back, and a replay banner has an Exit', () => {
    const back = vi.fn(), exit = vi.fn();
    render(<SpyScreen code="File 01" title="Stays" back={{ label: 'HQ', onClick: back }} replay={{ onExit: exit }}><p>body</p></SpyScreen>);
    expect(screen.getByRole('heading', { name: 'Stays' })).toBeTruthy();
    expect(screen.getByText('File 01')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /HQ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.spy')).not.toBeNull();
  });

  it('has no back button and no banner unless asked', () => {
    render(<SpyScreen code="HQ" title="Mission HQ">x</SpyScreen>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Countdown', () => {
  // Sri Lanka is UTC+5:30 all year, so a 9 am landing is half past three in the morning in UTC: the count is to that instant, not to a date in the viewer's own zone.
  const AT = '2026-12-08T09:00';
  const land = Date.UTC(2026, 11, 8, 3, 30);
  it('counts days, hours, minutes and seconds to the landing', () => {
    expect(countdownText(AT, land - (20 * 86400 + 3725) * 1000)).toBe('T-20d 01:02:05');
    expect(countdownText(AT, land - 1000)).toBe('T-0d 00:00:01');
    expect(countdownText(AT, land)).toBe('Wheels down');
    expect(countdownText(AT, land + 5000)).toBe('Wheels down');
  });
  it('renders the label, the date and the count', () => {
    render(<Countdown at={AT} label="Wheels down Colombo" now={land - 86400 * 1000} />);
    expect(screen.getByText('Wheels down Colombo')).toBeTruthy();
    expect(screen.getByText('Tue 8 Dec')).toBeTruthy();
    expect(screen.getByText('T-1d 00:00:00')).toBeTruthy();
  });
  it('shows nothing for a time it cannot read', () => {
    const { container } = render(<Countdown at="soon" label="x" now={0} />);
    expect(container.textContent).toBe('');
  });
});

describe('the kit on real mission data', () => {
  const group = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
  const areas = group.final!.days.flatMap(d => (d.area ? [d.area] : []));
  const stay = (area: string) => ({ id: `s-${area}`, name: 'Alex' as const, area: area as Area, kind: 'stay' as const, title: area, status: 'live' as const, createdAt: '2026-11-02T00:00:00Z' });
  const state = { responses: {}, suggestions: [], votes: [], stays: { crew: {}, suggestions: areas.map(stay), admin: { pins: areas.map(a => ({ area: a, suggestionId: `s-${a}`, at: '2026-11-02T00:00:00Z' })), scouts: {}, closed: [] } } };
  const input = {
    state, plan: group.final,
    model: { bookings: [{ id: 'book:train', label: 'Train', status: 'open' as const, opensOn: null, bookBy: '2026-12-01', owner: 'Alex' as const }], missing: { flights: ['Antek' as const], stays: [], bookings: 1, startDate: true } },
  };

  it('a mission file shows its pips, status and tag, and opens on tap', () => {
    const open = vi.fn();
    const [stays, supply, touchdown] = missionFiles(input);
    render(<><MissionFile file={stays} onOpen={open} /><MissionFile file={supply} onOpen={open} /><MissionFile file={touchdown} onOpen={open} /></>);
    expect(screen.getByText('Book by 1 Dec')).toBeTruthy();
    expect(screen.getByText('Antek still dark')).toBeTruthy();
    expect(document.querySelectorAll('.spy-pips')[2].querySelectorAll('i')).toHaveLength(5);
    expect(document.querySelectorAll('.spy-pips')[2].querySelectorAll('i.spy-on')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: /Supply runs/ }));
    expect(open).toHaveBeenCalledWith('supply');
  });

  it('a complete file wears a stamp', () => {
    const [, supply] = missionFiles({ ...input, model: { ...input.model, bookings: [{ ...input.model.bookings[0], status: 'done' as const }] } });
    render(<MissionFile file={supply} />);
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('the crew ring shows the crew percent and each agent level', () => {
    const r = crewReadiness(input);
    render(<CrewRing percent={r.percent} people={r.people} />);
    expect(screen.getByLabelText(`Crew readiness ${r.percent} percent`)).toBeTruthy();
    expect(screen.getAllByText(/^L[1-4]$/)).toHaveLength(5);
    expect(screen.getAllByText(`L${levelOf(r.people[0].done, r.people[0].total)}`).length).toBeGreaterThan(0);
  });

  it('the next move names the task, the agent and the way to the next level, and starts on tap', () => {
    const start = vi.fn();
    const move = nextMove('Antek', input)!;
    render(<NextMove me="Antek" move={move} done={1} total={5} onStart={start} />);
    expect(screen.getByText('Add your flights')).toBeTruthy();
    expect(screen.getByText('Agent Antek · Level 1 · 1 task to Level 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(start).toHaveBeenCalledWith(move);
  });

  it('with nothing open there is a calm line and no button', () => {
    render(<NextMove me="Alex" move={null} done={9} total={9} onStart={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Agent Alex · Level 4')).toBeTruthy();
  });
});

describe('spy.css', () => {
  const css = readFileSync('src/components/spy/spy.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('every rule is under the .spy root, so nothing leaks to the existing app', () => {
    const sels = [...css.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(s => !s.startsWith('@') && !/^(from|to|\d)/.test(s));
    expect(sels.length).toBeGreaterThan(10);
    for (const s of sels) for (const part of s.split(',')) expect(part.trim(), part).toMatch(/^\.spy(?![\w-])/);
  });
  it('no class here shares a name with the rest of the app', () => {
    for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) expect(m[1], m[1]).toMatch(/^spy/);
  });
});
