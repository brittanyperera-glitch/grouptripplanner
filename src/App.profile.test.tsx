import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import profile from './content/profile.json';
import { emptyRanking, PEOPLE, type Person, type Response } from './types';
import App from './App';
import { openMenu } from './__fixtures__/menu';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('./data/catalogue.json', () => ({ default: cat }));

const mk = (id: string, name: string, area: string) => ({
  id, name, area, about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, when: 'morning',
});
const row = (name: Person, over: Partial<Response> = {}): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z', ...over,
});
const start = (who: Person) => {
  localStorage.setItem(`tp:resp:${who}`, JSON.stringify(row(who, { rated: ['a'], ranking: { ...emptyRanking(), must: [['a']] } })));
  localStorage.setItem('tp:me', who);
  localStorage.setItem('tp:howto-seen', '1');
};

beforeEach(() => {
  localStorage.clear();
  cat.items = [mk('a', 'Alpha Rock', 'Cultural Triangle'), mk('b', 'Beta Falls', 'Cultural Triangle'), mk('c', 'Gamma Beach', 'South coast')];
});

const onProfile = async (who: Person) => screen.findByRole('article', { name: `${who} trip card` });

describe('opening the profile', () => {
  it('from the header avatar', async () => {
    start('Alex');
    render(<App />);
    await screen.findByText('2 of 3');
    await userEvent.click(screen.getByRole('button', { name: `Alex, ${profile.headerLabel}` }));
    await onProfile('Alex');
  });

  it('from the header name', async () => {
    start('Brittany');
    render(<App />);
    await screen.findByText('2 of 3');
    const header = document.querySelector('header.top') as HTMLElement;
    await userEvent.click(within(header).getByText('Brittany'));
    await onProfile('Brittany');
  });

  it('from My profile at the top of the Menu', async () => {
    start('Lazza');
    render(<App />);
    await screen.findByText('2 of 3');
    openMenu();
    const items = within(screen.getByRole('group', { name: 'Menu' })).getAllByRole('button');
    expect(items[0]).toHaveTextContent(profile.menuItem);
    await userEvent.click(items[0]);
    await onProfile('Lazza');
    expect(screen.queryByRole('group', { name: 'Menu' })).toBeNull();
  });

  it.each(PEOPLE)('%s sees their own card', async who => {
    start(who);
    render(<App />);
    await screen.findByText('2 of 3');
    openMenu();
    await userEvent.click(screen.getByRole('button', { name: profile.menuItem }));
    await onProfile(who);
    expect(screen.getAllByRole('meter').length).toBeGreaterThanOrEqual(3);
  });
});

describe('Back from the profile', () => {
  it('returns to the rating screen where I was, with my place kept', async () => {
    start('Alex');
    render(<App />);
    await screen.findByText('2 of 3');
    await userEvent.click(screen.getByRole('button', { name: `Alex, ${profile.headerLabel}` }));
    await onProfile('Alex');
    await userEvent.click(screen.getByRole('button', { name: profile.back }));
    await screen.findByText('2 of 3');
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('returns to the tab I was on after submitting', async () => {
    localStorage.setItem('tp:resp:Alex', JSON.stringify(row('Alex', { rated: ['a', 'b', 'c'], submitted: true, ranking: { ...emptyRanking(), must: [['a'], ['b'], ['c']] } })));
    localStorage.setItem('tp:me', 'Alex');
    render(<App />);
    const tabs = await screen.findByRole('tablist', { name: 'Sections' });
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Suggest' }));
    await userEvent.click(screen.getByRole('button', { name: `Alex, ${profile.headerLabel}` }));
    await onProfile('Alex');
    // Brittany 2026-10-16: on the tabs, the profile is its own tab in the bar.
    expect(within(screen.getByRole('tablist', { name: 'Sections' })).getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: profile.back }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggest' })).toHaveAttribute('aria-selected', 'true'));
  });
});
