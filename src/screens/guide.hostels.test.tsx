import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Guide from './Guide';
import hostelData from '../content/hostels.json';

type H = { id: string; name: string; hub: string; bunkGbp: number | null; roomGbp: number | null; roomFor: number | null; rating: { score: number; reviews: number }; bookUrl: string; mapsUrl: string };
type G = { hub: string; label: string; vibe: string; note?: string };
const { hostels, groups } = hostelData as unknown as { hostels: H[]; groups: G[] };

const open = async () => {
  const user = userEvent.setup();
  render(<Guide />);
  await user.click(screen.getByRole('button', { name: 'Hostels' }));
  return { user, region: screen.getByRole('region', { name: 'Hostels' }) };
};

describe('Guide Hostels section', () => {
  it('adds a Hostels tab and shows only that section when picked', async () => {
    const { region } = await open();
    expect(within(region).getByRole('heading', { name: 'Hostels' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Phrases' })).toBeNull();
  });

  it('shows every stop as a collapsed group except the first, and a group opens on tap', async () => {
    const { user, region } = await open();
    const toggles = within(region).getAllByRole('button', { expanded: undefined }).filter(b => b.hasAttribute('aria-expanded'));
    const withHostels = groups.filter(g => hostels.some(h => h.hub === g.hub));
    expect(toggles).toHaveLength(withHostels.length);
    expect(toggles.map(t => t.getAttribute('aria-expanded'))).toEqual(toggles.map((_, i) => (i === 0 ? 'true' : 'false')));
    const second = toggles[1];
    await user.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'true');
    await user.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });

  it('headlines each group with its hostel count and lowest bunk price', async () => {
    const { region } = await open();
    const kandy = hostels.filter(h => h.hub === 'Kandy');
    const low = Math.min(...kandy.map(h => h.bunkGbp).filter((n): n is number => n !== null));
    const label = groups.find(g => g.hub === 'Kandy')!.label;
    const toggle = within(region).getByRole('button', { name: new RegExp(`^${label}, ${kandy.length} hostels, from £`) });
    expect(toggle.textContent).toContain(`from £${low.toFixed(2).replace(/\.00$/, '')}`);
  });

  it('a card shows rating, both prices, the vibe line and the two links', async () => {
    const { user, region } = await open();
    const h = hostels.find(x => x.id === 'eden-kandy')!;
    const g = groups.find(x => x.hub === h.hub)!;
    await user.click(within(region).getByRole('button', { name: new RegExp(`^${g.label}, `) }));
    expect(within(region).getByText(g.vibe)).toBeInTheDocument();
    const card = within(region).getByRole('article', { name: h.name });
    expect(within(card).getByText(new RegExp(`${h.rating.score} on Hostelworld, ${h.rating.reviews} reviews`))).toBeInTheDocument();
    expect(within(card).getByText(/^Bunk from £/)).toBeInTheDocument();
    expect(within(card).getByText(/^Room from £.*sleeps \d/)).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: h.name })).toHaveAttribute('loading', 'lazy');
    const book = within(card).getByRole('link', { name: /See and book/ });
    expect(book).toHaveAttribute('href', h.bookUrl);
    expect(book).toHaveAttribute('target', '_blank');
    expect(book.getAttribute('rel')).toContain('noopener');
    expect(within(card).getByRole('link', { name: 'Map' })).toHaveAttribute('href', h.mapsUrl);
  });

  it('says there are no hostels at Udawalawe, guesthouses only', async () => {
    const { region } = await open();
    expect(within(region).getByText(/Udawalawe.*no hostels.*guesthouses/i)).toBeInTheDocument();
  });

  it('puts the Off route group last, collapsed', async () => {
    const { region } = await open();
    const toggles = within(region).getAllByRole('button').filter(b => b.hasAttribute('aria-expanded'));
    const last = toggles[toggles.length - 1];
    expect(last.textContent).toMatch(/Off route/);
    expect(last).toHaveAttribute('aria-expanded', 'false');
  });
});
