import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../guest/MemoryStore';
import { seedState } from '../guest/seed';
import { AppProvider, useApp } from '../state';
import { LocalStore } from '../store/local';
import { GUESTS, PEOPLE } from '../types';
import type { CrewStays, GroupResult, Plan, PlaceSuggestion, PrefAnswer, Player, Vote } from '../types';
import Stays from './Stays';

const grp = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../workers/usePlan', async orig => ({ ...(await orig<typeof import('../workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const day = (n: number, area: Plan['days'][number]['area']) => ({ n, area, entries: [], spare: 0, rainSlack: false });
const plan: Plan = {
  route: ['AIR', 'Sigiriya', 'Ella', 'AIR'], areas: ['Cultural Triangle', 'Ella'], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
  days: [day(1, 'Cultural Triangle'), day(2, 'Cultural Triangle'), day(3, null), day(4, 'Ella'), day(5, 'Kandy and Knuckles')],
};
// Changed deliberately (route decided only once locked or reopened): the fixture carries `locked`, as a real decided route does.
const routeLocked = (): GroupResult => ({ final: plan, locked: true } as unknown as GroupResult);

const crewRow = (name: Player, over: Partial<CrewStays> = {}): CrewStays => ({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z', ...over });
const seedCrew = (name: Player, over: Partial<CrewStays> = {}) => localStorage.setItem(`tp:stays:${name}`, JSON.stringify(crewRow(name, over)));
const seedAll = (over: Partial<CrewStays> = {}, each: (p: Player) => Partial<CrewStays> = () => ({})) => PEOPLE.forEach(p => seedCrew(p, { ...over, ...each(p) }));
const place = (id: string, o: Partial<PlaceSuggestion> = {}): PlaceSuggestion => ({ id, name: 'Alex', area: 'Ella', kind: 'stay', title: `Stay ${id}`, status: 'live', createdAt: `2026-10-1${id.slice(-1)}`, ...o });
const seedPlaces = (list: PlaceSuggestion[]) => localStorage.setItem('tp:placesug', JSON.stringify(list));
const seedVotes = (list: Vote[]) => localStorage.setItem('tp:votes', JSON.stringify(list));
const stored = <T,>(key: string): T => JSON.parse(localStorage.getItem(key) ?? 'null') as T;
const pref = (topic: PrefAnswer['topic'], picks: PrefAnswer['picks']): PrefAnswer => ({ topic, picks, noPreference: false, skipped: false });

const mount = async (me: Player = 'Brittany', onQuiz?: () => void) => {
  localStorage.setItem('tp:me', me);
  const user = userEvent.setup();
  render(<AppProvider store={new LocalStore()}><Stays onQuiz={onQuiz} /></AppProvider>);
  await screen.findByRole('list', { name: 'Stays steps' });
  return user;
};
const row = (text: string) => screen.getByRole('button', { name: new RegExp(`^${text}`) });
const btn = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => { localStorage.clear(); grp.current = routeLocked(); });
afterEach(() => cleanup());

describe('home: steps, one button, destinations', () => {
  it('on step one the strip marks Quiz, the one button opens the quiz, and each place is one line', async () => {
    const onQuiz = vi.fn();
    const user = await mount('Brittany', onQuiz);
    const steps = within(screen.getByRole('list', { name: 'Stays steps' })).getAllByRole('listitem');
    expect(steps.map(s => s.textContent)).toEqual(['1Quiz', '2Suggest', '3Lock in', '4Rank', '5Final']);
    expect(steps.map(s => s.getAttribute('data-state'))).toEqual(['now', 'next', 'next', 'next', 'next']);
    await user.click(btn('Start my travel profile'));
    expect(onQuiz).toHaveBeenCalledTimes(1);
    expect(row('Cultural Triangle, 2 nights, 0 stays')).toBeInTheDocument();
    expect(row('Ella, 1 night, 0 stays')).toBeInTheDocument();
    expect(row('Kandy and Knuckles, 1 night, 0 stays')).toBeInTheDocument();
  });

  it('a finished quiz ticks Quiz and moves on to Suggest, naming the places I scout', async () => {
    seedCrew('Brittany');
    await mount();
    const steps = within(screen.getByRole('list', { name: 'Stays steps' })).getAllByRole('listitem');
    expect(steps.map(s => s.getAttribute('data-state'))).toEqual(['done', 'now', 'next', 'next', 'next']);
    expect(screen.getByText('You scout Kandy and Knuckles')).toBeInTheDocument();
    expect(screen.getAllByText('You scout')).toHaveLength(1);
  });

  it('before the route locks there is nothing to do yet', async () => {
    grp.current = { final: null } as unknown as GroupResult;
    localStorage.setItem('tp:me', 'Brittany');
    render(<AppProvider store={new LocalStore()}><Stays /></AppProvider>);
    expect(await screen.findByText('Stays opens when the route locks.')).toBeInTheDocument();
  });

  it('a route that was provisional (final lists still being saved) is not a route yet', async () => {
    grp.current = { final: plan, locked: false } as unknown as GroupResult;
    localStorage.setItem('tp:me', 'Brittany');
    render(<AppProvider store={new LocalStore()}><Stays /></AppProvider>);
    expect(await screen.findByText('Stays opens when the route locks.')).toBeInTheDocument();
  });

  it('a late vote reopening the locked route keeps Stays on the held plan', async () => {
    PEOPLE.forEach(n => localStorage.setItem(`tp:resp:${n}`, JSON.stringify({ name: n, days: 9, flex: false, pace: 1, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted: true, updatedAt: 'x', final: { must: [], keen: [], meh: [], skip: [] } })));
    grp.current = { final: null, held: plan, locked: false, knockouts: [{ forkId: 'ko:s:late' }] } as unknown as GroupResult;
    await mount('Brittany');
    expect(screen.queryByText('Stays opens when the route locks.')).toBeNull();
    expect(row('Cultural Triangle, 2 nights, 0 stays')).toBeInTheDocument();
  });
});

describe('the board and the add sheet', () => {
  it('Add a stay stays locked, with the reason, until my quiz is done; Eat stays open', async () => {
    const onQuiz = vi.fn();
    seedCrew('Brittany', { quizDone: false });
    const user = await mount('Brittany', onQuiz);
    await user.click(row('Ella, 1 night, 0 stays'));
    expect(btn('+ Add a stay')).toBeDisabled();
    await user.click(btn('Do your travel profile first, 3 min'));
    expect(onQuiz).toHaveBeenCalledTimes(1);
    await user.click(btn('Eat'));
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('the sheet needs a name and a price, a good link, and saves the stay for the preset place', async () => {
    seedCrew('Brittany');
    const user = await mount();
    await user.click(row('Ella, 1 night, 0 stays'));
    await user.click(btn('+ Add a stay'));
    const save = btn('Add this stay');
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'Hill hut');
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Price per person per night (GBP)'), '12');
    expect(save).toBeEnabled();
    await user.type(screen.getByLabelText('Link'), 'javascript:alert(1)');
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText('Link'));
    await user.click(within(screen.getByRole('group', { name: 'Room setup' })).getByRole('button', { name: 'Dorm' }));
    await user.click(save);
    const saved = stored<PlaceSuggestion[]>('tp:placesug');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Brittany', area: 'Ella', kind: 'stay', title: 'Hill hut', priceGbp: 12, rooms: 'dorm', status: 'live' });
    expect(await screen.findByText('Hill hut')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a guide hostel fills the form, and with no guide price it can be saved without one, keeping its link to the guide', async () => {
    seedCrew('Brittany');
    const user = await mount();
    await user.click(row('Kandy and Knuckles, 1 night, 0 stays'));
    await user.click(btn('+ Add a stay'));
    await user.selectOptions(screen.getByLabelText("Choose from the guide's hostels"), 'bunkalow-kandy');
    expect(screen.getByLabelText('Name')).toHaveValue('Bunkalow');
    expect(screen.getByLabelText('Price per person per night (GBP)')).toHaveValue('');
    await user.click(btn('Add this stay'));
    expect(stored<PlaceSuggestion[]>('tp:placesug')[0]).toMatchObject({ hostelId: 'bunkalow-kandy', stayType: 'hostel', area: 'Kandy and Knuckles' });
    expect(stored<PlaceSuggestion[]>('tp:placesug')[0].priceGbp).toBeUndefined();
  });

  it('a stay with a price in the guide arrives priced', async () => {
    seedCrew('Brittany');
    const user = await mount();
    await user.click(row('Ella, 1 night, 0 stays'));
    await user.click(btn('+ Add a stay'));
    await user.selectOptions(screen.getByLabelText("Choose from the guide's hostels"), 'ella-escapade');
    expect(screen.getByLabelText('Price per person per night (GBP)')).toHaveValue('6.04');
    expect(within(screen.getByRole('group', { name: 'Room setup' })).getByRole('button', { name: 'Dorm' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a withdrawn stay disappears from the board and the count', async () => {
    seedCrew('Brittany');
    seedPlaces([place('a1', { name: 'Brittany', title: 'Hill hut' }), place('a2', { name: 'Alex', title: 'River house' })]);
    const user = await mount();
    await user.click(row('Ella, 1 night, 2 stays'));
    expect(screen.getByText('Hill hut')).toBeInTheDocument();
    await user.click(btn('Withdraw'));
    expect(screen.queryByText('Hill hut')).toBeNull();
    expect(screen.getByText('River house')).toBeInTheDocument();
    expect(stored<PlaceSuggestion[]>('tp:placesug').find(s => s.id === 'a1')?.status).toBe('withdrawn');
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('Edit replaces my stay: the old one is withdrawn and the changed one is live', async () => {
    seedCrew('Brittany');
    seedPlaces([place('a1', { name: 'Brittany', title: 'Hill hut', priceGbp: 10 })]);
    const user = await mount();
    await user.click(row('Ella, 1 night, 1 stay'));
    await user.click(btn('Edit'));
    expect(screen.getByLabelText('Name')).toHaveValue('Hill hut');
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Hill hut two');
    await user.click(btn('Save changes'));
    const list = stored<PlaceSuggestion[]>('tp:placesug');
    expect(list.filter(s => s.status === 'live').map(s => s.title)).toEqual(['Hill hut two']);
    expect(list.find(s => s.id === 'a1')?.status).toBe('withdrawn');
  });
});

describe('lock in', () => {
  it('lists my stays, saves locked, then my cards read Locked and lose Edit and Withdraw', async () => {
    seedCrew('Brittany');
    seedPlaces([place('a1', { name: 'Brittany', title: 'Hill hut' })]);
    const user = await mount();
    await user.click(btn('Lock in my stays (1)'));
    expect(screen.getByText('Hill hut, Ella')).toBeInTheDocument();
    expect(screen.getByText('Edits stop after this.')).toBeInTheDocument();
    await user.click(btn('Lock in my stays'));
    expect(stored<CrewStays>('tp:stays:Brittany').locked).toBe(true);
    expect(await screen.findByText('1 of 5 locked')).toBeInTheDocument();
    await user.click(row('Ella, 1 night, 1 stay'));
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Add a stay' })).toBeNull();
    expect(screen.getByText('You locked in. Edits stop here.')).toBeInTheDocument();
  });

  it('"I have none to add" locks in with zero stays', async () => {
    seedCrew('Brittany');
    const user = await mount();
    await user.click(btn('I have none to add'));
    expect(stored<CrewStays>('tp:stays:Brittany').locked).toBe(true);
    expect(await screen.findByText('Locked in')).toBeInTheDocument();
  });
});

describe('what the cards say about people', () => {
  const names = [...PEOPLE, ...GUESTS];
  it('shows counted warnings and never a name, on the board or the home page', async () => {
    seedAll({}, p => ({
      prefs: p === 'Alex' ? [pref('stayType', { hostel: 'noway' })]
        : p === 'Antek' ? [pref('rooms', { dorm: 'noway' })]
          : p === 'Lazza' ? [pref('budget', { '10to20': 'noway' })]
            : p === 'Saulie' ? [pref('stayType', { 'nights:hostel:1': 'happy' })] : [],
    }));
    seedPlaces([place('a1', { name: 'Brittany', area: 'Cultural Triangle', title: 'Rock hostel', stayType: 'hostel', rooms: 'dorm', priceGbp: 90 })]);
    const user = await mount();
    const home = document.body.textContent ?? '';
    for (const n of ['Alex', 'Antek', 'Lazza', 'Saulie', ...GUESTS]) expect(home, n).not.toContain(n);
    await user.click(row('Cultural Triangle, 2 nights, 1 stay'));
    const lines = [...document.querySelectorAll('[data-st-warn]')].map(e => e.textContent);
    expect(lines).toEqual(["1 person won't do hostels", "1 person won't do dorms", "1 person's budget is under this", '1 person wants max 1 night in a hostel']);
    const board = document.body.textContent ?? '';
    for (const n of names.filter(n => n !== 'Brittany')) expect(board, n).not.toContain(n);
  });
});

describe('rank my top 2', () => {
  const three = () => seedPlaces([
    place('a1', { title: 'Hill hut', stayType: 'hostel' }), place('a2', { title: 'River house' }), place('a3', { title: 'Tea lodge' }),
  ]);
  const ready = () => seedAll({ locked: true }, p => ({ prefs: p === 'Alex' ? [pref('stayType', { hostel: 'noway' })] : [] }));

  it('tap for first then second, tap again to clear, a warned stay can still be ranked, and Submit saves both', async () => {
    ready(); three();
    const user = await mount();
    await user.click(btn('Pick my top 2'));
    const card = (t: string) => screen.getByRole('button', { name: new RegExp(`^Rank ${t}`) });
    const submit = btn('Submit my top 2');
    expect(submit).toBeDisabled();
    await user.click(card('Hill hut'));
    expect(card('Hill hut')).toHaveAttribute('aria-label', 'Rank Hill hut, 1st');
    await user.click(card('River house'));
    expect(card('River house')).toHaveAttribute('aria-label', 'Rank River house, 2nd');
    expect(submit).toBeEnabled();
    await user.click(card('River house'));
    expect(card('River house')).toHaveAttribute('aria-pressed', 'false');
    expect(submit).toBeDisabled();
    await user.click(card('Tea lodge'));
    expect(submit).toBeEnabled();
    await user.click(card('Hill hut'));
    expect(card('Hill hut')).toHaveAttribute('aria-pressed', 'false');
    expect(submit).toBeDisabled();
    await user.click(card('Hill hut'));
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(stored<CrewStays>('tp:stays:Brittany').ranks).toEqual({ Ella: { first: 'a1', second: 'a3' } });
    expect(screen.getByRole('list', { name: 'Stays steps' })).toBeInTheDocument();
  });

  it('after my top 2 the step card waits on the others instead of offering it again', async () => {
    ready(); three();
    seedCrew('Brittany', { locked: true, ranks: { Ella: { first: 'a1', second: 'a2' } } });
    await mount();
    expect(screen.queryByRole('button', { name: 'Pick my top 2' })).toBeNull();
    expect(screen.getByText('Waiting on the others to pick their top 2.')).toBeInTheDocument();
  });
});

describe('head to head', () => {
  const two = () => seedPlaces([place('a1', { title: 'Hill hut' }), place('a2', { title: 'River house' })]);
  const open = async () => {
    const user = await mount();
    await user.click(btn('Head to head'));
    return user;
  };

  it('one tap writes one vote on the right fork, a second tap on the other card replaces it', async () => {
    seedAll({ locked: true }); two();
    const user = await open();
    await user.click(btn('Vote for Hill hut'));
    expect(stored<Vote[]>('tp:votes')).toEqual([{ forkId: 'stay:Ella:a1:a2', name: 'Brittany', choice: 'a' }]);
    expect(screen.getByText('1 of 5 voted')).toBeInTheDocument();
    await user.click(btn('Vote for River house'));
    expect(stored<Vote[]>('tp:votes')).toEqual([{ forkId: 'stay:Ella:a1:a2', name: 'Brittany', choice: 'b' }]);
  });

  it('the full page votes too, and three votes settle it into the decided list', async () => {
    seedAll({ locked: true }); two();
    seedVotes([{ forkId: 'stay:Ella:a1:a2', name: 'Alex', choice: 'a' }, { forkId: 'stay:Ella:a1:a2', name: 'Antek', choice: 'a' }]);
    const user = await open();
    await user.click(btn('Details of Hill hut'));
    const page = screen.getByRole('dialog', { name: 'Hill hut' });
    await user.click(within(page).getByRole('button', { name: 'Vote for this' }));
    expect(stored<Vote[]>('tp:votes').filter(v => v.name === 'Brittany')).toEqual([{ forkId: 'stay:Ella:a1:a2', name: 'Brittany', choice: 'a' }]);
    expect(await screen.findByText('Ella: Hill hut, won the vote')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vote for Hill hut' })).toBeNull();
  });

  it('a finalist with warnings shows a count on the card and the lines on its page', async () => {
    seedAll({ locked: true }, p => ({ prefs: p === 'Alex' ? [pref('stayType', { hostel: 'noway' })] : [] }));
    seedPlaces([place('a1', { title: 'Hill hut', stayType: 'hostel' }), place('a2', { title: 'River house' })]);
    const user = await open();
    expect(screen.getByText('1 heads-up')).toBeInTheDocument();
    expect(screen.queryByText("1 person won't do hostels")).toBeNull();
    await user.click(btn('Details of Hill hut'));
    expect(screen.getByText("1 person won't do hostels")).toBeInTheDocument();
  });

  it('a pin from Brittany decides it with her stamp and nothing left to vote on', async () => {
    seedAll({ locked: true }); two();
    localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [{ area: 'Ella', suggestionId: 'a2', at: 't' }], scouts: {} }));
    await mount();
    expect(screen.queryByRole('button', { name: 'Head to head' })).toBeNull();
    expect(screen.getByText('Your stays are set')).toBeInTheDocument();
    expect(within(row('Ella, 1 night, 2 stays')).getByText('River house')).toBeInTheDocument();
    expect(within(row('Ella, 1 night, 2 stays')).getByText("Brittany's pick")).toBeInTheDocument();
  });
});

describe('eat, do and gems', () => {
  it('Interested writes a reaction vote on the suggestion and shows who', async () => {
    seedCrew('Brittany');
    seedPlaces([place('e1', { kind: 'eat', title: 'Rice and curry stop' })]);
    const user = await mount();
    await user.click(row('Ella, 1 night, 0 stays'));
    await user.click(btn('Eat'));
    await user.click(btn('Interested'));
    expect(stored<Vote[]>('tp:votes')).toEqual([{ forkId: 'react:e1', name: 'Brittany', choice: 'a' }]);
    expect(btn(/^Interested/)).toHaveAttribute('aria-pressed', 'true');
    await user.click(btn(/^Not for me/));
    expect(stored<Vote[]>('tp:votes')).toEqual([{ forkId: 'react:e1', name: 'Brittany', choice: 'b' }]);
  });
});

describe('guests', () => {
  function AsGuest() {
    const { me, setMe } = useApp();
    useEffect(() => { setMe('Aunty'); }, [setMe]);
    return me ? <Stays /> : null;
  }
  const sandbox = () => {
    const base = seedState();
    const crew = Object.fromEntries(PEOPLE.map(p => [p, crewRow(p, { locked: true })]));
    return new MemoryStore({ ...base, stays: { crew, suggestions: [place('a1', { title: 'Hill hut' })], admin: { pins: [], scouts: {}, closed: [] } } });
  };

  it('the guest is the sixth to lock; until then nothing is decided, after it the lone stay is picked', async () => {
    const store = sandbox();
    const user = userEvent.setup();
    render(<AppProvider store={store} sandbox={{ onFinish: () => undefined }}><AsGuest /></AppProvider>);
    await screen.findByRole('list', { name: 'Stays steps' });
    await act(async () => { await store.saveCrewStays('Aunty', { quizDone: true }); });
    await screen.findByText('Where do we sleep?');
    expect(screen.queryByText('Hill hut')).toBeNull();
    await user.click(btn('I have none to add'));
    expect(await screen.findByText('Hill hut')).toBeInTheDocument();
    expect(localStorage.getItem('tp:stays:Aunty')).toBeNull();
  });
});

describe('Brittany-only controls', () => {
  const three = () => seedPlaces([place('a1', { title: 'Hill hut' }), place('a2', { title: 'River house' }), place('a3', { title: 'Tree lodge' })]);

  it('Brittany pins a stay: stamp for all, Unpin for her, and the pin is stored', async () => {
    seedCrew('Brittany'); seedPlaces([place('a1', { title: 'Hill hut' }), place('a2', { title: 'River house' })]);
    const user = await mount('Brittany');
    await user.click(row('Ella, 1 night, 2 stays'));
    const card = screen.getByRole('article', { name: 'River house' });
    await user.click(within(card).getByRole('button', { name: 'Pin as final' }));
    expect(stored<{ pins: { area: string; suggestionId: string }[] }>('tp:staysadmin').pins).toMatchObject([{ area: 'Ella', suggestionId: 'a2' }]);
    expect(within(await screen.findByRole('article', { name: 'River house' })).getByText("Brittany's pick")).toBeInTheDocument();
    await user.click(within(screen.getByRole('article', { name: 'River house' })).getByRole('button', { name: 'Unpin' }));
    expect(stored<{ pins: unknown[] }>('tp:staysadmin').pins).toEqual([]);
    expect(screen.queryByText("Brittany's pick")).toBeNull();
  });

  it('Brittany closes ranking on a waiting destination and the head to head opens on the ranks in; others never see the button', async () => {
    seedAll({ locked: true }, p => (p === 'Saulie' ? {} : { ranks: { Ella: { first: 'a1', second: 'a2' } } })); three();
    await mount('Alex');
    expect(await screen.findByText('Waiting on the others to pick their top 2.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Close ranking/ })).toBeNull();
    cleanup();
    const user = await mount('Brittany');
    await user.click(await screen.findByRole('button', { name: 'Close ranking for Ella' }));
    expect(stored<{ closed: string[] }>('tp:staysadmin').closed).toEqual(['Ella']);
    await user.click(await screen.findByRole('button', { name: 'Head to head' }));
    expect(await screen.findByRole('group', { name: 'Stay vote: Ella' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Close ranking/ })).toBeNull();
  });

  it('everyone else sees the stamp on a pinned stay but no Pin or Unpin', async () => {
    seedCrew('Alex'); seedPlaces([place('a1', { title: 'Hill hut' }), place('a2', { title: 'River house' })]);
    localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [{ area: 'Ella', suggestionId: 'a2', at: 't' }], scouts: {} }));
    const user = await mount('Alex');
    await user.click(row('Ella, 1 night, 2 stays'));
    expect(screen.getByText("Brittany's pick")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin as final' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unpin' })).toBeNull();
  });

  it('a pinned destination with 3 stays skips ranking and the vote', async () => {
    seedAll({ locked: true }); three();
    localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [{ area: 'Ella', suggestionId: 'a3', at: 't' }], scouts: {} }));
    await mount('Brittany');
    expect(screen.getByText('Your stays are set')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pick my top 2' })).toBeNull();
  });

  it('without the pin the same destination still waits for rankings', async () => {
    seedAll({ locked: true }); three();
    await mount('Brittany');
    expect(screen.getByRole('button', { name: 'Pick my top 2' })).toBeInTheDocument();
  });

  it('Brittany can unlock a locked person; nobody else is offered it', async () => {
    seedAll({ locked: true });
    const user = await mount('Brittany');
    await user.click(btn('Unlock Alex'));
    expect(stored<CrewStays>('tp:stays:Alex').locked).toBe(false);
    expect(stored<CrewStays>('tp:stays:Antek').locked).toBe(true);
    cleanup();
    localStorage.clear();
    seedAll({ locked: true });
    await mount('Alex');
    expect(screen.queryByRole('button', { name: /^Unlock/ })).toBeNull();
  });
});

describe('add an eat, do or gem idea', () => {
  it('the chooser switches the form to name, destination, link, why and rough cost, and saves the kind', async () => {
    seedCrew('Brittany');
    const user = await mount('Brittany');
    await user.click(row('Ella, 1 night, 0 stays'));
    await user.click(btn('Gems'));
    await user.click(btn('+ Add an idea'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Gems' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).queryByRole('group', { name: 'Room setup' })).toBeNull();
    await user.type(within(dialog).getByLabelText('Name'), 'Secret waterfall');
    await user.type(within(dialog).getByLabelText('Link'), 'example.com/fall');
    await user.type(within(dialog).getByLabelText('Why it is good (optional, one line)'), 'Empty at dawn');
    await user.type(within(dialog).getByLabelText('Rough cost per person (GBP, optional)'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Add this idea' }));
    expect(stored<PlaceSuggestion[]>('tp:placesug')).toMatchObject([{ kind: 'gem', area: 'Ella', title: 'Secret waterfall', why: 'Empty at dawn', priceGbp: 3, link: 'https://example.com/fall' }]);
    expect(stored<PlaceSuggestion[]>('tp:placesug')[0].stayType).toBeUndefined();
  });

  it('an idea needs only a name', async () => {
    seedCrew('Brittany');
    const user = await mount('Brittany');
    await user.click(row('Ella, 1 night, 0 stays'));
    await user.click(btn('Do'));
    await user.click(btn('+ Add an idea'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Add this idea' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Name'), 'Sunrise hike');
    await user.click(within(dialog).getByRole('button', { name: 'Add this idea' }));
    expect(stored<PlaceSuggestion[]>('tp:placesug')[0]).toMatchObject({ kind: 'do', title: 'Sunrise hike' });
  });
});
