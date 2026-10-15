import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStore } from './store/local';
import { emptyRanking, PEOPLE, type Person, type Response } from './types';
import App from './App';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
const copy = vi.hoisted(() => ({
  welcome: '',
  quips: { name: {} as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, { take?: string; review?: string; reviewUrl?: string }>,
}));
vi.mock('./data/catalogue.json', () => ({ default: cat }));
vi.mock('./content/copy.json', () => ({ default: copy }));

const mk = (id: string, name: string, area: string, extra: Record<string, unknown> = {}) => ({
  id, name, area, about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0,
  photo: id, when: 'morning', credit: `Credit ${id}`,
  google: { rating: '4.7', reviews: '24,355', url: `https://maps.example/${id}` }, ...extra,
});
const THREE = [mk('a', 'Alpha Rock', 'Cultural Triangle'), mk('b', 'Beta Falls', 'Cultural Triangle'), mk('c', 'Gamma Beach', 'South coast')];

const row = (name: Person, over: Partial<Response> = {}): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z', ...over,
});
const seed = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
const savedAlex = () => JSON.parse(localStorage.getItem('tp:resp:Alex') ?? '{}') as Response;

beforeEach(() => {
  localStorage.clear();
  cat.items = THREE;
  copy.welcome = '';
  copy.quips = { name: {}, days: {}, pace: {}, tier: {} };
  copy.items = {};
});

async function toRate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
  await user.click(await screen.findByRole('button', { name: 'Alex' }));
  await user.click(await screen.findByRole('button', { name: /^9 days/ }));
  await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
}

describe('rating flow', () => {
  // Brittany 2026-10-15: before the head to heads people only swipe tiers and submit.
  it('name, days, pace, then swipes with no compare, then a picks screen with no ranks or moves', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toRate(user);

    await user.click(await screen.findByRole('button', { name: 'Must' }));
    await user.click(await screen.findByRole('button', { name: 'Must' }));
    await user.click(await screen.findByRole('button', { name: 'Keen' }));

    const list = await screen.findByRole('region', { name: 'Your picks' });
    expect(list.querySelectorAll('.rk')).toHaveLength(0);
    expect(within(list).queryByRole('button', { name: /^Move / })).toBeNull();
    const names = Array.from(list.querySelectorAll('.nm')).map(n => n.textContent);
    expect(names).toEqual(['Alpha Rock', 'Beta Falls', 'Gamma Beach']);
    expect(screen.queryByText(/Your ranking/)).toBeNull();
    await waitFor(() => expect(savedAlex().ranking.must).toEqual([['a', 'b']]));
  });

  it('saves every change through the store', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toRate(user);
    await user.click(await screen.findByRole('button', { name: 'Must' }));
    await waitFor(() => {
      const saved = savedAlex();
      expect(saved.days).toBe(9);
      expect(saved.pace).toBe(1);
      expect(saved.ranking.must).toEqual([['a']]);
      expect(saved.rated).toEqual(['a']);
    });
  });

  it('flexible is saved as 14 days with flex true', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Alex' }));
    await user.click(await screen.findByRole('button', { name: /^Flexible/ }));
    await waitFor(() => {
      expect(savedAlex().days).toBe(14);
      expect(savedAlex().flex).toBe(true);
    });
  });

  it('custom days uses a stepper limited to 5 to 21', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Alex' }));
    await user.click(await screen.findByRole('button', { name: /^My own number/ }));
    for (let i = 0; i < 20; i++) await user.click(screen.getByRole('button', { name: 'More days' }));
    expect(screen.getByLabelText('Number of days')).toHaveTextContent('21');
    for (let i = 0; i < 30; i++) await user.click(screen.getByRole('button', { name: 'Fewer days' }));
    expect(screen.getByLabelText('Number of days')).toHaveTextContent('5');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(savedAlex().days).toBe(5));
  });
});

describe('no compares before the head to heads', () => {
  it('a fourth Must joins the same unordered spot', async () => {
    cat.items = [...THREE, mk('d', 'Delta Hill', 'South coast')];
    seed(row('Alex', { ranking: { ...emptyRanking(), must: [['a', 'b', 'c']] }, rated: ['a', 'b', 'c'] }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Must' }));
    await waitFor(() => expect(savedAlex().ranking.must).toEqual([['a', 'b', 'c', 'd']]));
    expect(screen.queryByRole('button', { name: /this one/i })).toBeNull();
  });
});

describe('rating card', () => {
  async function onCard(items: unknown[]) {
    cat.items = items;
    seed(row('Alex'));
    localStorage.setItem('tp:me', 'Alex');
    render(<App />);
    await screen.findByRole('button', { name: 'Must' });
  }

  it('hides the credit behind an i button, shows facts, and a Google Maps link with no star rating', async () => {
    await onCard(THREE);
    expect(screen.queryByText(/Credit a/)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Photo credit' }));
    expect(screen.getByText(/Credit a/)).toBeInTheDocument();
    // Facts are separate pills now (area on the photo, then time, fee and best time).
    expect(screen.getByText('Cultural Triangle')).toBeInTheDocument();
    for (const fact of ['3 h', 'free', 'morning']) expect(screen.getByText(fact)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'See it on Google Maps' });
    expect(link).toHaveAttribute('href', 'https://maps.example/a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('explains what Brittany approved means', async () => {
    (copy.items as Record<string, { approved?: boolean }>).a = { approved: true };
    await onCard(THREE);
    expect(screen.getByText(/Brittany approved/)).toBeInTheDocument();
    expect(screen.getByText(/can vouch for it\. The others aren't necessarily bad/)).toBeInTheDocument();
    delete (copy.items as Record<string, unknown>).a;
  });

  it('hides empty review and take', async () => {
    await onCard(THREE);
    expect(screen.queryByText(/Brittany:/)).not.toBeInTheDocument();
    expect(document.querySelector('.review')).not.toBeInTheDocument();
  });

  it('shows review and take when the copy has them', async () => {
    copy.items = { a: { take: 'Go at dawn', review: 'Worth the climb' } };
    await onCard(THREE);
    expect(screen.getByText('Go at dawn')).toBeInTheDocument();
    expect(screen.getByText(/Worth the climb/)).toBeInTheDocument();
  });

  it('renders a solid area block with the name when there is no photo', async () => {
    await onCard([mk('a', 'Alpha Rock', 'Cultural Triangle', { photo: undefined }), ...THREE.slice(1)]);
    const block = document.querySelector('.photo.nophoto') as HTMLElement | null;
    expect(block).toBeInTheDocument();
    expect(within(block as HTMLElement).getByText('Alpha Rock')).toBeInTheDocument();
  });

  it('hides the Google rating when the item has none', async () => {
    await onCard([mk('a', 'Alpha Rock', 'Cultural Triangle', { google: undefined }), ...THREE.slice(1)]);
    expect(screen.queryByRole('link', { name: /★/ })).not.toBeInTheDocument();
  });
});

describe('quips', () => {
  it('shows no toast when the quip is empty', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Alex' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the quip when it has text', async () => {
    copy.quips.name = { Alex: 'Alex has arrived' };
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Alex' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Alex has arrived');
  });

  it('picks one line from a list of quips', async () => {
    (copy.quips as { name: Record<string, string | string[]> }).name = { Alex: ['line one', 'line two'] };
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Alex' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/^line (one|two)$/);
  });

  it('shows the welcome title and subtitle above the names', async () => {
    (copy as { welcome: string; welcomeSub?: string }).welcome = 'Trip Planning. Optimized.';
    (copy as { welcomeSub?: string }).welcomeSub = "Britt's solution to group chat debates";
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Trip Planning. Optimized.' })).toBeInTheDocument();
    expect(screen.getByText("Britt's solution to group chat debates")).toBeInTheDocument();
    (copy as { welcome: string; welcomeSub?: string }).welcome = '';
    (copy as { welcomeSub?: string }).welcomeSub = '';
  });
});

describe('submit, lock and errors', () => {
  it('submit saves and opens the tabs', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toRate(user);
    await user.click(await screen.findByRole('button', { name: 'Must' }));
    await user.click(await screen.findByRole('button', { name: 'Keen' }));
    await user.click(await screen.findByRole('button', { name: 'Meh' }));
    await user.click(await screen.findByRole('button', { name: /Done, submit/ }));
    for (const t of ['My trip', 'Group', 'Everyone', 'Suggest']) {
      expect(await screen.findByRole('tab', { name: t })).toBeInTheDocument();
    }
    expect(savedAlex().submitted).toBe(true);
  });

  it('locks ratings once all five have submitted', async () => {
    for (const p of PEOPLE) seed(row(p, { submitted: true, rated: ['a', 'b', 'c'], ranking: { ...emptyRanking(), must: [['a'], ['b'], ['c']] } }));
    localStorage.setItem('tp:me', 'Alex');
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'My trip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit my ratings/i })).not.toBeInTheDocument();
    expect(screen.getByText(/ratings are locked/i)).toBeInTheDocument();
  });

  it('shows the crew selfies at the top of the Group tab once the group is open', async () => {
    for (const p of PEOPLE) seed(row(p, { submitted: true, rated: ['a', 'b', 'c'], ranking: { ...emptyRanking(), must: [['a'], ['b'], ['c']] }, final: { ...emptyRanking(), must: [['a'], ['b'], ['c']] } }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    expect(await screen.findByRole('list', { name: 'The crew' })).toBeInTheDocument();
  });

  it('offers Finalize your list on the Group tab once the head to heads are done', async () => {
    for (const p of PEOPLE) seed(row(p, { submitted: true, rated: ['a', 'b', 'c'], ranking: { ...emptyRanking(), must: [['a', 'b', 'c']] } }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    const list = await screen.findByRole('region', { name: 'Finalize your list' });
    expect(Array.from(list.querySelectorAll('.rk')).map(n => n.textContent)).toEqual(['1', '2', '3']);
    await user.click(screen.getByRole('button', { name: 'Save my list' }));
    await waitFor(() => expect(savedAlex().final?.must).toEqual([['a'], ['b'], ['c']]));
    expect(await screen.findByText(/Your list is saved\. 1 of 5 done/)).toBeInTheDocument();
  });

  const openGroup = async (finals: Person[]) => {
    const rk = { ...emptyRanking(), must: [['a'], ['b'], ['c']] };
    for (const p of PEOPLE) seed(row(p, { submitted: true, rated: ['a', 'b', 'c'], ranking: { ...emptyRanking(), must: [['a', 'b', 'c']] }, ...(finals.includes(p) ? { final: rk } : {}) }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    return user;
  };

  it('before I save my list the Finalize step stands alone, with no plan under it', async () => {
    await openGroup([]);
    await screen.findByRole('region', { name: 'Finalize your list' });
    expect(screen.queryByText(/Provisional until all five finalize/)).toBeNull();
    expect(screen.queryByLabelText('Trailer')).toBeNull();
  });

  it('after I save, the plan shows and Edit my list reopens the Finalize step until the lock', async () => {
    const user = await openGroup(['Alex']);
    expect(await screen.findByText(/Provisional until all five finalize/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Finalize your list' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit my list' }));
    expect(await screen.findByRole('region', { name: 'Finalize your list' })).toBeInTheDocument();
    expect(screen.queryByText(/Provisional until all five finalize/)).toBeNull();
  });

  it('shows no Play trailer button before the lock', async () => {
    await openGroup(['Alex', 'Lazza']);
    expect(await screen.findByText(/The trailer drops once all five lock their lists/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play trailer' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Still to go' }).children).toHaveLength(3);
  });

  it('offers Play trailer, and no Edit my list, once the plan is locked', async () => {
    await openGroup([...PEOPLE]);
    expect(await screen.findByRole('button', { name: 'Play trailer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit my list' })).toBeNull();
    expect(screen.queryByText(/The trailer drops once/)).toBeNull();
  });

  it('keeps ratings editable before the group opens', async () => {
    seed(row('Alex', { submitted: true, rated: ['a', 'b', 'c'], ranking: { ...emptyRanking(), must: [['a'], ['b'], ['c']] } }));
    localStorage.setItem('tp:me', 'Alex');
    render(<App />);
    expect(await screen.findByRole('button', { name: /edit my ratings/i })).toBeInTheDocument();
  });

  it('a failed save shows the retry banner, keeps going, and clears on retry', async () => {
    let fail = true;
    class Flaky extends LocalStore {
      override async saveResponse(...a: Parameters<LocalStore['saveResponse']>) {
        if (fail) throw new Error('offline');
        return super.saveResponse(...a);
      }
    }
    const user = userEvent.setup();
    render(<App store={new Flaky()} />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Alex' }));
    await user.click(await screen.findByRole('button', { name: /^9 days/ }));
    const banner = await screen.findByRole('button', { name: /Couldn't save\. Tap to retry/ });
    expect(await screen.findByRole('button', { name: /^Balanced/ })).toBeInTheDocument();
    fail = false;
    await user.click(banner);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Couldn't save/ })).not.toBeInTheDocument());
    expect(savedAlex().days).toBe(9);
  });
});

describe('picks screen', () => {
  const ready = () => {
    seed(row('Alex', { rated: ['a', 'b', 'c'], ranking: { ...emptyRanking(), must: [['a'], ['b']], keen: [['c']] } }));
    localStorage.setItem('tp:me', 'Alex');
  };

  it('changing tier joins that tier without a compare', async () => {
    ready();
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(await screen.findByLabelText('Change tier for Gamma Beach'), 'must');
    await waitFor(() => expect(savedAlex().ranking.must).toEqual([['a', 'b', 'c']]));
    expect(screen.queryByRole('button', { name: /this one/i })).toBeNull();
  });
});
