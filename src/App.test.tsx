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
  await user.click(await screen.findByRole('button', { name: 'Alex' }));
  await user.click(await screen.findByRole('button', { name: /^9 days/ }));
  await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
}

describe('rating flow', () => {
  it('name, days, pace, rate with a compare, then rerank shows 1, 2 and 3', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toRate(user);

    await user.click(await screen.findByRole('button', { name: 'Must' }));
    await user.click(await screen.findByRole('button', { name: 'Must' }));
    await user.click(await screen.findByRole('button', { name: /this one/i }));
    await user.click(await screen.findByRole('button', { name: 'Keen' }));

    const list = await screen.findByRole('region', { name: 'Your ranking' });
    const ranks = Array.from(list.querySelectorAll('.rk')).map(n => n.textContent);
    expect(ranks).toEqual(['1', '2', '3']);
    const names = Array.from(list.querySelectorAll('.nm')).map(n => n.textContent);
    expect(names).toEqual(['Beta Falls', 'Alpha Rock', 'Gamma Beach']);
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

describe('compare', () => {
  const four = () => [...THREE, mk('d', 'Delta Hill', 'South coast')];

  it('disables tie when the level already holds three', async () => {
    cat.items = four();
    seed(row('Alex', { ranking: { ...emptyRanking(), must: [['a', 'b', 'c']] }, rated: ['a', 'b', 'c'] }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Must' }));
    const tie = await screen.findByRole('button', { name: /3 already tied there/i });
    expect(tie).toBeDisabled();
  });

  it('offers tie when the level has room', async () => {
    cat.items = four();
    seed(row('Alex', { ranking: { ...emptyRanking(), must: [['a']] }, rated: ['a', 'b', 'c'] }));
    localStorage.setItem('tp:me', 'Alex');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Must' }));
    expect(await screen.findByRole('button', { name: /tie them/i })).toBeEnabled();
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

  it('shows credit, facts, and a Google Maps link with no star rating', async () => {
    await onCard(THREE);
    expect(screen.getByText(/Credit a/)).toBeInTheDocument();
    expect(screen.getByText('Cultural Triangle · morning · 3 h · free')).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'Alex' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the quip when it has text', async () => {
    copy.quips.name = { Alex: 'Alex has arrived' };
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Alex' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Alex has arrived');
  });

  it('picks one line from a list of quips', async () => {
    (copy.quips as { name: Record<string, string | string[]> }).name = { Alex: ['line one', 'line two'] };
    const user = userEvent.setup();
    render(<App />);
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

describe('rerank', () => {
  const ready = () => {
    seed(row('Alex', { rated: ['a', 'b', 'c'], ranking: { ...emptyRanking(), must: [['a'], ['b']], keen: [['c']] } }));
    localStorage.setItem('tp:me', 'Alex');
  };

  it('moves an item down and saves', async () => {
    ready();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Move Alpha Rock down' }));
    await waitFor(() => expect(savedAlex().ranking.must).toEqual([['b', 'a']]));
  });

  it('changing tier into an occupied tier opens a compare', async () => {
    ready();
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(await screen.findByLabelText('Change tier for Gamma Beach'), 'must');
    expect(await screen.findByRole('button', { name: /this one/i })).toBeInTheDocument();
  });
});
