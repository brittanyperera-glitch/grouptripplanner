import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerLike } from './store/__fixtures__/serverLike';
import App from './App';
import { mkItem as mk, crewQuizDone } from './__fixtures__/seed';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
const copy = vi.hoisted(() => ({
  welcome: '',
  quips: { name: {} as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, unknown>,
}));
vi.mock('./data/catalogue.json', () => ({ default: cat }));
vi.mock('./content/copy.json', () => ({ default: copy }));


beforeEach(() => {
  localStorage.clear();
  cat.items = [mk('a', 'Alpha Rock', 'Cultural Triangle'), mk('b', 'Beta Falls', 'Cultural Triangle'), mk('c', 'Gamma Beach', 'South coast')];
});

async function submitAsAlex(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
  await user.click(await screen.findByRole('button', { name: 'Alex' }));
  await user.click(await screen.findByRole('button', { name: /^9 days/ }));
  await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
  for (const t of ['Must', 'Keen', 'Meh']) await user.click(await screen.findByRole('button', { name: t }));
  await user.click(await screen.findByRole('button', { name: /Done, submit/ }));
}

const myTripShows = async () => {
  const panel = await screen.findByRole('tabpanel', { name: 'My trip' });
  await within(panel).findByRole('region', { name: 'My trip' });
  expect(within(panel).queryByText('Loading')).toBeNull();
};

describe('a save the server rejects', () => {
  it('My trip still shows my plan, not Loading, and a server reload without my row does not wipe it', async () => {
    const store = new ServerLike();
    store.failResp = true;
    store.failLog = true;
    const user = userEvent.setup();
    render(<App store={store} />);
    await submitAsAlex(user);
    await myTripShows();
    expect(await screen.findByRole('button', { name: /Couldn't save\. Tap to retry/ })).toBeInTheDocument();

    await act(() => store.push());
    await myTripShows();
    expect(store.rows.Alex).toBeUndefined();
  });

  it('a page reload keeps my unsaved ratings, and retry then stores them', async () => {
    const store = new ServerLike();
    // Quiz done on the server, so this exercises what it did before the stayQuiz to-do existed.
    store.stays = { crew: { Alex: crewQuizDone('Alex') }, suggestions: [], admin: { pins: [], scouts: {} } };
    store.failResp = true;
    const user = userEvent.setup();
    const first = render(<App store={store} />);
    await submitAsAlex(user);
    await myTripShows();
    first.unmount();

    render(<App store={store} />);
    await myTripShows();
    store.failResp = false;
    await user.click(await screen.findByRole('button', { name: /Couldn't save\. Tap to retry/ }));
    await waitFor(() => expect(store.rows.Alex?.submitted).toBe(true));
    expect(store.rows.Alex?.rated).toEqual(['a', 'b', 'c']);
  });
});

describe('an audit log the server rejects', () => {
  // The bar says my choices did not save; a missing choice_log row does not lose any choice, so it stays quiet.
  it('still saves the response and shows no error bar', async () => {
    const store = new ServerLike();
    store.failLog = true;
    const user = userEvent.setup();
    render(<App store={store} />);
    await submitAsAlex(user);
    await waitFor(() => expect(store.rows.Alex?.submitted).toBe(true));
    await waitFor(() => expect(store.logCalls).toBeGreaterThan(0));
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: /Couldn't save/ })).toBeNull();
    await myTripShows();
  });
});
