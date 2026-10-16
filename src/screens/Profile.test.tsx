import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import copyData from '../content/copy.json';
import profile from '../content/profile.json';
import { emptyRanking, GUESTS, isGuest, PEOPLE } from '../types';
import type { Person, Player, Tier } from '../types';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { MemoryStore } from '../guest/MemoryStore';
import { seedState } from '../guest/seed';
import { friendStats } from '../lib/friendship';
import { AppProvider, useApp } from '../state';
import Friends from './Friends';
import ConnectedProfile, { ProfileView as Profile, VIEW_KEY } from './Profile';
import { artSrc, cardColours, cardData, cardLayout, CARD_H, CARD_W, contrast, FRIEND_LABELS, rarityOf, renderCardBlob, selfieSrc, tierOf } from './profileCard';

function PickThen({ who, children }: { who: Player; children: ReactNode }) {
  const { setMe, me } = useApp();
  useEffect(() => { setMe(who); }, [setMe, who]);
  return me === who ? <>{children}</> : null;
}

// Brittany's words, exactly: the cards must show these and nothing else (src/content/profile.json holds them).
const FACTS: Record<string, string> = {
  Saulie: 'HE HAS BANGS NOW',
  Alex: 'LOVES TO CARPE DIEM IN THEORY',
  Lazza: 'IS NOT A PERMANENT RESIDENT OF GREAT BRITAIN & NORTHERN IRELAND',
  Antek: 'IS NEARLY FLUENT IN ENGLISH',
  Brittany: '34TH IN LINE TO THE SRI LANKAN THRONE',
};

const players = (copyData as unknown as { players: Record<string, { title: string; stats: { label: string; value: number }[] }> }).players;

const originalMatchMedia = window.matchMedia;
const setMotion = (full: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: !full && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
};

// A canvas that records every call, and an Image that always loads. jsdom has neither a 2d context nor image decoding.
type Call = [string, ...unknown[]];
let calls: Call[] = [];
let sizes: [number, number][] = [];
const stubCanvas = () => {
  calls = []; sizes = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get: (t, prop: string) => {
      if (prop === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop in t) return t[prop];
      return (...a: unknown[]) => { calls.push([prop, ...a]); };
    },
    set: (t, prop: string, v) => { t[prop] = v; return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) { sizes.push([this.width, this.height]); return ctx as unknown as CanvasRenderingContext2D; } as never);
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]).join('|');
    cb(new Blob([new Uint8Array([137, 80, 78, 71]), texts], { type: 'image/png' }));
  };
  class FakeImage {
    onload: (() => void) | null = null; onerror: (() => void) | null = null; width = 400; height = 500;
    set src(_: string) { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal('Image', FakeImage);
};
const drawn = () => calls.filter(c => c[0] === 'fillText').map(c => String(c[1]));

beforeEach(() => { setMotion(false); localStorage.clear(); });
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.assign(navigator, { share: undefined, canShare: undefined });
});

describe('profile card contents', () => {
  it.each(PEOPLE)('%s: the title, every stat as a labelled bar with its number, the full-body art, height and kit', name => {
    render(<Profile name={name} players={players} onBack={() => {}} />);
    const card = screen.getByRole('article', { name: `${name} trip card` });
    expect(within(card).getByRole('heading', { name })).toBeInTheDocument();
    expect(within(card).getByText(players[name].title)).toBeInTheDocument();
    const panel = card.querySelector('.pf-c-stats') as HTMLElement;
    for (const s of players[name].stats) {
      const bar = within(card).getByRole('meter', { name: s.label });
      expect(bar).toHaveAttribute('aria-valuetext', String(s.value));
      expect(within(panel).getByText(s.label)).toBeInTheDocument();
      expect(within(panel).getByText(String(s.value))).toBeInTheDocument();
      expect(bar.closest('.pf-c-stat')).toHaveAttribute('data-tier', tierOf(s.value));
    }
    expect(within(card).getAllByRole('meter')).toHaveLength(players[name].stats.length);
    expect(within(card).getByRole('img', { name })).toHaveAttribute('src', `/img/players/${name.toLowerCase()}.png`);
    expect(card.textContent).toMatch(/Height \d+ cm/);
    expect(card.textContent).toContain(profile.kit);
    const { stars, rarity } = rarityOf(players[name].stats);
    expect(within(card).getByRole('img', { name: `${rarity}, ${stars} of 5 stars` })).toBeInTheDocument();
    expect(card.querySelector('.pf-c-stamp')?.textContent).toBe(rarity);
    expect(card.querySelector('.pf-c-fact > span')?.textContent).toBe('Fun fact');
    expect(card.querySelector('.pf-c-fact > b')?.textContent).toBe(FACTS[name]);
    expect(card.textContent).not.toMatch(/special move/i);
    expect(card.querySelector('.pf-c-foil')).not.toBeNull();
  });

  it('the fun facts are exactly the five agreed lines', () => {
    expect(profile.facts).toEqual(FACTS);
  });

  it('Lazza\'s long fact wraps onto at most two lines in the PNG and is drawn whole, whatever the font width', async () => {
    stubCanvas();
    await renderCardBlob(cardData('Lazza', 4, 5, players.Lazza));
    const lines = drawn().filter(t => FACTS.Lazza.includes(t) && t !== 'FUN FACT');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.join(' ')).toBe(FACTS.Lazza);
  });

  // Brittany 2026-10-16: "All the cards should be 5/5", whatever the stats.
  it('every card is 5 stars, Legendary, whatever the stats', () => {
    for (const stats of [[{ label: 'a', value: 100 }], [{ label: 'a', value: 0 }], [{ label: 'a', value: 6 }], []]) {
      expect(rarityOf(stats)).toEqual({ stars: 5, rarity: 'Legendary' });
    }
  });

  it('every player gets a different card colour', () => {
    const colours = PEOPLE.map(n => {
      const { unmount, container } = render(<Profile name={n} players={players} onBack={() => {}} />);
      const c = (container.querySelector('.pf-card') as HTMLElement).style.getPropertyValue('--pf-a');
      unmount();
      return c;
    });
    expect(new Set(colours).size).toBe(PEOPLE.length);
  });

  it('a stat past 10 fills the bar and is marked over, like the select screen', () => {
    render(<Profile name="Lazza" players={players} onBack={() => {}} />);
    const bar = screen.getByRole('meter', { name: 'Yank' });
    expect(bar).toHaveAttribute('aria-valuenow', '10');
    expect(bar).toHaveAttribute('aria-valuetext', '100');
    expect(bar.closest('.pf-c-stat')?.querySelector('.pf-c-val')).toHaveClass('over');
  });

  it('missing art falls back to the initial, never a hole', () => {
    render(<Profile name="Alex" players={players} onBack={() => {}} />);
    const art = screen.getByRole('img', { name: 'Alex' });
    expect(art).toHaveAttribute('src', '/img/players/alex.png');
    fireEvent.error(art);
    expect(document.querySelector('.pf-c-initial')?.textContent).toBe('A');
  });

  it('a player with no copy still renders a card', () => {
    render(<Profile name="Saulie" players={{}} onBack={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Saulie' })).toBeInTheDocument();
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
  });

  it('Back calls onBack', async () => {
    const onBack = vi.fn();
    render(<Profile name="Alex" players={players} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: profile.back }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// Brittany 2026-10-16: "character card is so mid compared to the other side". The card's hero is the full-body art on the player's rays, as on the Character view.
describe('card hero layout (all 8 players)', () => {
  const ALL = [...PEOPLE, ...GUESTS] as Player[];

  it.each(ALL)('%s: renders with name, title, the full-body art as the hero, 3 stats, rays and a plate in the player colour', name => {
    render(<Profile name={name} players={players} onBack={() => {}} />);
    const card = screen.getByRole('article', { name: `${name} trip card` });
    expect(within(card).getByRole('heading', { name })).toBeInTheDocument();
    expect(within(card).getByText(players[name].title)).toBeInTheDocument();
    const hero = card.querySelector('.pf-c-art img');
    expect(hero).not.toBeNull();
    expect(hero).toHaveAttribute('src', artSrc(name));
    expect(card.querySelector(`img[src="${selfieSrc(name)}"]`)).toBeNull();
    expect(card.querySelectorAll('.pf-c-stats .pf-c-stat')).toHaveLength(3);
    expect(card.querySelector('.pf-c-face')).not.toBeNull();
    const plate = card.querySelector('.pf-c-plate') as HTMLElement;
    expect(plate).not.toBeNull();
    expect((card as HTMLElement).style.getPropertyValue('--pf-plate')).toBe(cardColours(name).plate);
  });

  it.each(ALL)('%s: the fun fact line is there only when the player has one', name => {
    render(<Profile name={name} players={players} onBack={() => {}} />);
    const card = screen.getByRole('article', { name: `${name} trip card` });
    const fact = card.querySelector('.pf-c-fact');
    if (isGuest(name)) expect(fact).toBeNull();
    else expect(fact?.querySelector('b')?.textContent).toBe(FACTS[name]);
  });

  it('guests are numbered within the guest roster, not as card 1 of the trip', () => {
    render(<Profile name="Aunty" players={players} onBack={() => {}} />);
    expect(document.querySelector('.pf-c-no')?.textContent).toBe('Card 02 of 03');
  });

  it.each(ALL)('%s: the layout stacks figure over plate with the feet on the plate, nothing outside the face, nothing overlapping', name => {
    const d = cardData(name, 1, 5, players[name]);
    const L = cardLayout(d);
    expect(L.figBottom).toBeGreaterThan(L.plateTop);
    expect(L.figBottom - L.figTop).toBeGreaterThan(CARD_H * 0.55);
    const blocks = [L.name, L.title, L.stats, L.fact, L.meta].filter(Boolean) as { y: number; h: number }[];
    expect(L.name.y).toBeGreaterThanOrEqual(L.figBottom - 1);
    for (const b of blocks) { expect(b.y).toBeGreaterThanOrEqual(L.plateTop); expect(b.y + b.h).toBeLessThanOrEqual(CARD_H - 16); }
    for (let i = 1; i < blocks.length; i++) expect(blocks[i].y).toBeGreaterThanOrEqual(blocks[i - 1].y + blocks[i - 1].h);
    expect(Boolean(L.fact)).toBe(Boolean(d.fact));
  });

  it.each(ALL)('%s: text on the plate and the stamp reads at 4.5:1 or better', name => {
    const c = cardColours(name);
    for (const ink of ['#ffffff', c.tint, '#f2b632', c.meta]) expect(contrast(ink, c.plate)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.plate, '#fffaf0')).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ALL)('%s: the PNG draws the art (never the selfie) and puts name, title, stats and meta in the same boxes as the screen card', async name => {
    stubCanvas();
    const srcs: string[] = [];
    class Recorded { onload: (() => void) | null = null; onerror: (() => void) | null = null; width = 400; height = 900; set src(s: string) { srcs.push(s); queueMicrotask(() => this.onload?.()); } }
    vi.stubGlobal('Image', Recorded);
    const d = cardData(name, 1, 5, players[name]);
    await renderCardBlob(d);
    expect(srcs).toEqual([artSrc(name)]);
    const L = cardLayout(d);
    const yOf = (t: string) => { const c = calls.find(k => k[0] === 'fillText' && k[1] === t); expect(c, t).toBeDefined(); return c![3] as number; };
    const within_ = (y: number, b: { y: number; h: number }) => { expect(y).toBeGreaterThanOrEqual(b.y); expect(y).toBeLessThanOrEqual(b.y + b.h); };
    within_(yOf(name.toUpperCase()), L.name);
    within_(yOf(players[name].title.toUpperCase()), L.title!);
    for (const s of players[name].stats) within_(yOf(s.label.toUpperCase()), L.stats!);
    expect(drawn().includes('FUN FACT')).toBe(Boolean(d.fact));
    const img = calls.find(k => k[0] === 'drawImage')!;
    expect((img[3] as number) + (img[5] as number)).toBeCloseTo(L.figBottom, 0);
  });
});

// Brittany 2026-10-16: "Once we start getting friendship stats we should put the top one the top 2 on the Pokemon cards".
describe('friendship strip on the card', () => {
  // Five submitted rows rating the same four places, spread so Brittany has a twin (Alex) and a clash.
  const PICKS: Record<Person, Tier[]> = {
    Brittany: ['must', 'must', 'keen', 'skip'], Alex: ['must', 'keen', 'meh', 'skip'], Antek: ['skip', 'skip', 'must', 'must'],
    Lazza: ['keen', 'meh', 'meh', 'meh'], Saulie: ['meh', 'keen', 'skip', 'keen'],
  };
  const groupState = () => {
    const s = seedState();
    for (const p of PEOPLE) {
      const ranking = emptyRanking();
      PICKS[p].forEach((t, i) => ranking[t].push([`p${i}`]));
      s.responses[p] = { ...s.responses[p]!, ranking, rated: ['p0', 'p1', 'p2', 'p3'], submitted: true };
    }
    return s;
  };
  const inApp = (who: Player, state = groupState()) =>
    render(<AppProvider store={new MemoryStore(state)} sandbox={{ onFinish: () => {} }}><ConnectedProfile name={who} players={players} onBack={() => {}} /></AppProvider>);

  it('shows the travel twin and biggest clash with names and percentages once all five have submitted', async () => {
    const want = friendStats(groupState().responses, 'Brittany');
    expect(want.twin && want.clash).toBeTruthy();
    inApp('Brittany');
    const card = await screen.findByRole('article', { name: 'Brittany trip card' });
    const strip = card.querySelector('.pf-c-friends') as HTMLElement;
    expect(strip).not.toBeNull();
    const items = [...strip.querySelectorAll('.pf-c-friend')].map(e => e.textContent);
    expect(items).toEqual([`${FRIEND_LABELS.twin}${want.twin!.name}${want.twin!.pct}%`, `${FRIEND_LABELS.clash}${want.clash!.name}${want.clash!.pct}%`]);
    expect(strip.querySelector(`svg[data-person="${want.twin!.name}"]`)).not.toBeNull();
  });

  it('is absent for a guest', async () => {
    inApp('Aunty');
    const card = await screen.findByRole('article', { name: 'Aunty trip card' });
    expect(card.querySelector('.pf-c-friends')).toBeNull();
  });

  it('is absent, with no empty row, until all five have submitted', async () => {
    const s = groupState();
    s.responses.Lazza = { ...s.responses.Lazza!, submitted: false };
    inApp('Alex', s);
    const card = await screen.findByRole('article', { name: 'Alex trip card' });
    expect(card.querySelector('.pf-c-friends')).toBeNull();
    expect(cardLayout(cardData('Alex', 2, 5, players.Alex)).friends).toBeNull();
  });

  it('uses the same two labels as the Group stats page', async () => {
    render(<AppProvider store={new MemoryStore(groupState())} sandbox={{ onFinish: () => {} }}><PickThen who="Brittany"><Friends /></PickThen></AppProvider>);
    const page = await screen.findByLabelText('Friendship stats');
    expect(page.textContent).toContain(FRIEND_LABELS.twin);
    expect(page.textContent).toContain(FRIEND_LABELS.clash);
  });

  it('the PNG draws the same strip: labels, names, percentages and both friends\' art', async () => {
    stubCanvas();
    const srcs: string[] = [];
    class Recorded { onload: (() => void) | null = null; onerror: (() => void) | null = null; width = 400; height = 900; set src(s: string) { srcs.push(s); queueMicrotask(() => this.onload?.()); } }
    vi.stubGlobal('Image', Recorded);
    const f = friendStats(groupState().responses, 'Brittany');
    const d = cardData('Brittany', 1, 5, players.Brittany, { twin: f.twin, clash: f.clash });
    const L = cardLayout(d);
    expect(L.friends).not.toBeNull();
    await renderCardBlob(d);
    expect(srcs).toEqual([artSrc('Brittany'), artSrc(f.twin!.name), artSrc(f.clash!.name)]);
    const text = drawn();
    for (const t of [FRIEND_LABELS.twin.toUpperCase(), FRIEND_LABELS.clash.toUpperCase(), f.twin!.name.toUpperCase(), f.clash!.name.toUpperCase(), `${f.twin!.pct}%`, `${f.clash!.pct}%`]) expect(text).toContain(t);
    const y = calls.find(k => k[0] === 'fillText' && k[1] === `${f.twin!.pct}%`)![3] as number;
    expect(y).toBeGreaterThanOrEqual(L.friends!.y);
    expect(y).toBeLessThanOrEqual(L.friends!.y + L.friends!.h);
  });
});

describe('profile view switch', () => {
  it('opens on the card, and Character shows only the full size character with the name and title', async () => {
    const user = userEvent.setup();
    render(<Profile name="Saulie" players={players} onBack={() => {}} />);
    expect(screen.getByRole('button', { name: profile.viewCard })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('article', { name: 'Saulie trip card' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: profile.save })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: profile.viewCharacter }));
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button', { name: profile.save })).toBeNull();
    const view = screen.getByRole('region', { name: 'Saulie, full size' });
    expect(within(view).getByRole('heading', { name: 'Saulie' })).toBeInTheDocument();
    expect(within(view).getByText('Mr Money-Bags')).toBeInTheDocument();
    expect(view.querySelector('svg[data-person="Saulie"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: profile.viewCharacter })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: profile.viewCard }));
    expect(screen.getByRole('article', { name: 'Saulie trip card' })).toBeInTheDocument();
  });

  it('remembers the choice in localStorage and opens on it next time', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Profile name="Alex" players={players} onBack={() => {}} />);
    await user.click(screen.getByRole('button', { name: profile.viewCharacter }));
    expect(localStorage.getItem(VIEW_KEY)).toBe('character');
    unmount();
    render(<Profile name="Alex" players={players} onBack={() => {}} />);
    expect(screen.getByRole('region', { name: 'Alex, full size' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: profile.viewCard }));
    expect(localStorage.getItem(VIEW_KEY)).toBe('card');
  });

  it('still works when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup();
    render(<Profile name="Alex" players={players} onBack={() => {}} />);
    await user.click(screen.getByRole('button', { name: profile.viewCharacter }));
    expect(screen.getByRole('region', { name: 'Alex, full size' })).toBeInTheDocument();
  });
});

describe('profile motion', () => {
  const character = async () => { await userEvent.click(screen.getByRole('button', { name: profile.viewCharacter })); };
  it('the character stands still on mount: nothing animates and nothing loops', async () => {
    setMotion(true);
    const { container } = render(<Profile name="Saulie" players={players} onBack={() => {}} />);
    await character();
    expect(container.querySelector('[data-jump]')).toBeNull();
    expect(container.querySelector('.bob')).toBeNull();
    expect(container.querySelector('[data-bob]')).toBeNull();
  });
  it('is a button named Make Saulie jump, and each tap or key press restarts one jump', async () => {
    setMotion(true);
    const user = userEvent.setup();
    const { container } = render(<Profile name="Saulie" players={players} onBack={() => {}} />);
    await character();
    const btn = screen.getByRole('button', { name: 'Make Saulie jump' });
    await user.click(btn);
    const first = container.querySelector('[data-jump]');
    expect(first).not.toBeNull();
    await user.click(btn);
    const second = container.querySelector('[data-jump]');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    btn.focus();
    await user.keyboard('{Enter}');
    const third = container.querySelector('[data-jump]');
    expect(third).not.toBe(second);
    await user.keyboard(' ');
    expect(container.querySelector('[data-jump]')).not.toBe(third);
    expect(container.querySelectorAll('[data-jump]')).toHaveLength(1);
  });
  it('does not jump under reduced motion or the webdriver (still) mode', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<Profile name="Alex" players={players} onBack={() => {}} />);
    await character();
    await user.click(screen.getByRole('button', { name: 'Make Alex jump' }));
    expect(container.querySelector('[data-jump]')).toBeNull();
    unmount();
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    const r = render(<Profile name="Alex" players={players} onBack={() => {}} />);
    await character();
    await user.click(screen.getByRole('button', { name: 'Make Alex jump' }));
    expect(r.container.querySelector('[data-jump]')).toBeNull();
  });

  const aim = (card: HTMLElement, x: number, y: number) => {
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON() {} });
    fireEvent(card, new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  };
  it('tilts toward the pointer with full motion and settles back on leave', () => {
    setMotion(true);
    render(<Profile name="Alex" players={players} onBack={() => {}} />);
    const card = screen.getByRole('article');
    aim(card, 200, 0);
    expect(card.style.getPropertyValue('--pf-ry')).toBe('9.00deg');
    expect(card.style.getPropertyValue('--pf-rx')).toBe('9.00deg');
    expect(card.style.getPropertyValue('--pf-fx')).toBe('0.0%');
    expect(card).toHaveAttribute('data-tilting');
    fireEvent.pointerLeave(card);
    expect(card.style.getPropertyValue('--pf-ry')).toBe('');
    expect(card.style.getPropertyValue('--pf-fx')).toBe('');
    expect(card).not.toHaveAttribute('data-tilting');
  });
  it('does not tilt under reduced motion', () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    render(<Profile name="Alex" players={players} onBack={() => {}} />);
    const card = screen.getByRole('article');
    aim(card, 200, 0);
    expect(card.style.getPropertyValue('--pf-ry')).toBe('');
  });
});

describe('exporting the card', () => {
  it.each(PEOPLE)('%s: renders a non-empty PNG blob with the name, title and every stat drawn on it', async name => {
    stubCanvas();
    const blob = await renderCardBlob(cardData(name, PEOPLE.indexOf(name) + 1, PEOPLE.length, players[name]));
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
    expect(sizes[0]).toEqual([CARD_W, CARD_H]);
    const text = drawn();
    expect(text).toContain(name.toUpperCase());
    expect(text).toContain(players[name].title.toUpperCase());
    expect(text).toContain(rarityOf(players[name].stats).rarity.toUpperCase());
    expect(text).toContain('FUN FACT');
    expect(text.join(' ')).toContain(FACTS[name]);
    expect(text.join(' ')).not.toMatch(/SPECIAL MOVE/);
    expect(text.filter(t => t === '\u2605')).toHaveLength(5);
    for (const s of players[name].stats) {
      expect(text).toContain(s.label.toUpperCase());
      expect(text).toContain(String(s.value));
    }
    expect(calls.some(c => c[0] === 'drawImage')).toBe(true);
  });

  it('waits for the fonts before it draws', async () => {
    stubCanvas();
    let ready!: () => void;
    const gate = new Promise<void>(r => { ready = r; });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => Promise.resolve([]), ready: gate } });
    const p = renderCardBlob(cardData('Alex', 2, 5, players.Alex));
    await new Promise(r => setTimeout(r, 20));
    expect(calls.length).toBe(0);
    ready();
    await p;
    expect(calls.length).toBeGreaterThan(0);
    Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
  });

  it('still exports when the art fails to load, drawing the initial instead', async () => {
    stubCanvas();
    class ArtFails {
      onload: (() => void) | null = null; onerror: (() => void) | null = null; width = 400; height = 500;
      set src(_: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal('Image', ArtFails);
    const blob = await renderCardBlob(cardData('Alex', 2, 5, players.Alex));
    expect(blob.size).toBeGreaterThan(0);
    expect(calls.filter(c => c[0] === 'drawImage')).toHaveLength(0);
    expect(drawn()).toContain('A');
  });

  describe('buttons', () => {
    let created: Blob[] = [];
    beforeEach(() => {
      stubCanvas();
      created = [];
      URL.createObjectURL = vi.fn((b: Blob) => { created.push(b); return 'blob:card'; });
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    it('Save image downloads the PNG and says Saved', async () => {
      const user = userEvent.setup();
      render(<Profile name="Brittany" players={players} onBack={() => {}} />);
      await user.click(screen.getByRole('button', { name: profile.save }));
      expect(await screen.findByRole('button', { name: profile.saved })).toBeInTheDocument();
      expect(created).toHaveLength(1);
      expect(created[0].size).toBeGreaterThan(0);
      expect(created[0].type).toBe('image/png');
    });

    it('hides Copy and Send where the browser cannot do them', () => {
      render(<Profile name="Brittany" players={players} onBack={() => {}} />);
      expect(screen.queryByRole('button', { name: profile.copy })).toBeNull();
      expect(screen.queryByRole('button', { name: profile.send })).toBeNull();
      expect(screen.getByRole('button', { name: profile.save })).toBeInTheDocument();
    });

    it('Copy writes an image/png ClipboardItem and says Copied', async () => {
      const written: unknown[] = [];
      class FakeItem { constructor(public items: Record<string, Promise<Blob>>) {} }
      vi.stubGlobal('ClipboardItem', FakeItem);
      const user = userEvent.setup();
      // After setup(): user-event installs its own clipboard stub on navigator.
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: vi.fn(async (i: unknown[]) => { written.push(...i); }) } });
      render(<Profile name="Brittany" players={players} onBack={() => {}} />);
      await user.click(screen.getByRole('button', { name: profile.copy }));
      expect(await screen.findByRole('button', { name: profile.copied })).toBeInTheDocument();
      const item = written[0] as FakeItem;
      expect(Object.keys(item.items)).toEqual(['image/png']);
      const blob = await item.items['image/png'];
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('Send shares the PNG as a file and says Sent', async () => {
      const share = vi.fn(async () => {});
      Object.assign(navigator, { share, canShare: () => true });
      const user = userEvent.setup();
      render(<Profile name="Brittany" players={players} onBack={() => {}} />);
      await user.click(screen.getByRole('button', { name: profile.send }));
      expect(await screen.findByRole('button', { name: profile.sent })).toBeInTheDocument();
      const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
      expect(arg.files[0].type).toBe('image/png');
      expect(arg.files[0].name).toBe('the-homecoming-brittany.png');
      expect(arg.files[0].size).toBeGreaterThan(0);
    });

    it('cancelling the share sheet shows no confirmation and no error', async () => {
      Object.assign(navigator, { share: vi.fn(async () => { throw new DOMException('cancelled', 'AbortError'); }), canShare: () => true });
      const user = userEvent.setup();
      render(<Profile name="Brittany" players={players} onBack={() => {}} />);
      await user.click(screen.getByRole('button', { name: profile.send }));
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      expect(screen.queryByRole('button', { name: profile.sent })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('a failed render says so instead of claiming Saved', async () => {
      HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(null); };
      const user = userEvent.setup();
      render(<Profile name="Brittany" players={players} onBack={() => {}} />);
      await user.click(screen.getByRole('button', { name: profile.save }));
      expect(await screen.findByRole('alert')).toHaveTextContent(profile.failed);
      expect(screen.queryByRole('button', { name: profile.saved })).toBeNull();
      await waitFor(() => expect(created).toHaveLength(0));
    });
  });
});
