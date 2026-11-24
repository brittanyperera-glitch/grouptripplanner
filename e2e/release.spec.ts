import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// The released plan: the route reveal opens first, then the Route tab, with Stays one tap away on To do.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const ranking = { must: [['sigiriya']], keen: [], meh: ids.filter(i => i !== 'sigiriya').map(i => [i]), skip: [] };
const NAMES = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
const seed = NAMES.map(name => ({ name, days: 9, flex: false, pace: 0, ranking, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' }));
const release = JSON.parse(fs.readFileSync('src/content/release.json', 'utf8')) as { days: number; items: string[] };
const REVEAL_KEY = `${release.days}:${release.items.join(',')}`;
const SHOTS = process.env.SHOTS_DIR;
// The route is the first tab, in every stage: it is on screen at open, with the map and the day strip.
const routeOnScreen = async (page: import('@playwright/test').Page) => {
  await expect(page.getByRole('tab', { name: 'Route' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Trip view')).toBeVisible();
};
// Stays is opened from its card on To do and sits over that tab.
const staysFromTodo = async (page: import('@playwright/test').Page) => {
  await page.getByRole('tab', { name: 'To do' }).click();
  await page.getByRole('button', { name: /^Stays/ }).click();
  await expect(page.getByRole('button', { name: /Back to To do/ })).toBeVisible();
};
const shot = async (page: import('@playwright/test').Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

for (const [w, h] of [[1680, 900], [1440, 900], [1280, 800], [1024, 768]]) for (const scheme of ['light', 'dark'] as const) {
  test(`reveal, itinerary, Stays at ${w}x${h} ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: scheme });
    await seenWalkthroughToday(page);
    await page.goto('/');
    await page.evaluate(([rows]) => {
      localStorage.clear();
      for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
      localStorage.setItem('tp:me', 'Brittany');
    }, [seed]);
    await page.reload();

    // 1. The route reveal is the opening screen, with no tab bar under it.
    await expect(page.getByText('Mission unlocked')).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await shot(page, `${w}-${scheme}-1-reveal`);

    // 2. Close it.
    await page.getByRole('button', { name: 'Close' }).click();

    // 3. The full itinerary is the group plan, with the released days.
    await routeOnScreen(page);
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByText('9 days, about')).toBeVisible();
    await shot(page, `${w}-${scheme}-3-itinerary`);

    // 4. The To do card opens Stays; and the reveal does not play again on reload.
    await staysFromTodo(page);
    await expect(page.getByText('Working out the route.')).toHaveCount(0);
    await expect(page.getByRole('tabpanel', { name: 'Stays' }).locator('button').first()).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, `${w}-${scheme}-4-stays`);
    await page.reload();
    await expect(page.getByText('Mission unlocked')).toHaveCount(0);
  });
}

for (const w of [320, 375]) {
  test(`nothing runs off the side at ${w} wide: reveal, itinerary, Stays`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 700 });
    await seenWalkthroughToday(page);
    await page.goto('/');
    await page.evaluate(([rows]) => {
      localStorage.clear();
      for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
      localStorage.setItem('tp:me', 'Brittany');
    }, [seed]);
    await page.reload();
    const overflow = () => page.evaluate(() => {
      const de = document.documentElement;
      // A designed scroll-snap strip may hold chips past the edge, but only if the scroller itself fits the viewport.
      const inScroller = (e: HTMLElement) => { for (let a = e.parentElement; a; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX, b = a.getBoundingClientRect();
        if ((ox === 'auto' || ox === 'scroll') && b.left >= -0.5 && b.right <= innerWidth + 0.5) return true;
      } return false; };
      const wide = [...document.querySelectorAll<HTMLElement>('button, a, h1, h2, .big, .cta')].filter(e => e.getBoundingClientRect().right > de.clientWidth + 1 && !inScroller(e)).map(e => e.textContent?.trim().slice(0, 30));
      return { page: de.scrollWidth - de.clientWidth, wide };
    });
    await expect(page.getByText('Mission unlocked')).toBeVisible();
    expect(await overflow(), 'reveal').toEqual({ page: 0, wide: [] });
    await page.getByRole('button', { name: 'Close' }).click();
    await routeOnScreen(page);
    expect(await overflow(), 'itinerary').toEqual({ page: 0, wide: [] });
    const strip = (await page.getByRole('group', { name: 'Days' }).boundingBox())!;
    expect(strip.x, 'day strip left').toBeGreaterThanOrEqual(-0.5);
    expect(strip.x + strip.width, 'day strip right').toBeLessThanOrEqual(w + 0.5);
    await staysFromTodo(page);
    await expect(page.getByText('Working out the route.')).toHaveCount(0);
    expect(await overflow(), 'stays').toEqual({ page: 0, wide: [] });
  });
}

test('the poster at the end of the reveal is the travel poster art, loaded, with a way to save it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seenWalkthroughToday(page);
  await page.goto('/');
  await page.evaluate(([rows]) => {
    localStorage.clear();
    for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
    localStorage.setItem('tp:me', 'Brittany');
  }, [seed]);
  await page.reload();
  await page.getByRole('button', { name: 'See the poster' }).click();
  const art = page.getByRole('img', { name: /Sri Lanka, The Homecoming/ });
  await expect(art).toBeVisible();
  await expect.poll(() => art.evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth)).toBe(1024);
  await expect(page.getByRole('button', { name: 'Save poster' })).toBeVisible();
  const box = (await art.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});

test('the Awards dialog does not open over the itinerary after the reveal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seenWalkthroughToday(page);
  await page.goto('/');
  // Different ratings per person, so there are awards to win (the identical seed above has none).
  const tiers = (must: string[], keen: string[]) => ({ must: must.map(m => [m]), keen: keen.map(k => [k]), meh: ids.filter(i => !must.includes(i) && !keen.includes(i)).map(i => [i]), skip: [] });
  const varied = NAMES.map((name, n) => ({ name, days: 9, flex: false, pace: 0, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z',
    ranking: tiers(ids.slice(n, n + 4), ids.slice(n + 4, n + 12)) }));
  await page.evaluate(([rows]) => {
    localStorage.clear();
    for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
    localStorage.setItem('tp:me', 'Brittany');
  }, [varied]);
  await page.reload();
  await page.getByRole('button', { name: 'Close' }).click();
  await routeOnScreen(page);
  await expect(page.getByText('The group awards', { exact: false })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Me' }).click();
  await expect(page.getByRole('button', { name: 'Awards' })).toBeVisible();
});

for (const [w, h] of [[320, 640], [390, 844], [1280, 800]]) {
  test(`the Profile card flips to the poster and nothing spills out at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seenWalkthroughToday(page);
    await page.goto('/');
    await page.evaluate(([rows, key]) => {
      localStorage.clear();
      for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
      localStorage.setItem('tp:me', 'Brittany');
      localStorage.setItem('tp:reveal-seen', key as string);
    }, [seed, REVEAL_KEY]);
    await page.reload();
    const posterRequests: string[] = [];
    page.on('request', r => { if (r.url().includes('/img/poster/')) posterRequests.push(r.url()); });
    await page.getByRole('tab', { name: 'Me' }).click();
    const spill = () => page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const bad = [...document.querySelectorAll<HTMLElement>('.pf-top > *, .pf-flip, .pf-actions, .pf-actions > button')].filter(e => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; });
      return { page: document.documentElement.scrollWidth - vw, bad: bad.map(e => e.className || e.tagName) };
    });
    await expect(page.getByRole('article', { name: 'Brittany trip card' })).toBeVisible();
    expect(await spill(), 'front').toEqual({ page: 0, bad: [] });
    expect(posterRequests, 'the 938 KB poster is not fetched until someone reaches for the flip').toEqual([]);
    await page.getByRole('button', { name: 'Flip card' }).click();
    await expect(page.getByRole('img', { name: /The Homecoming/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (document.querySelector('.pf-poster img') as HTMLImageElement | null)?.naturalWidth ?? 0)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Save poster' })).toBeVisible();
    expect(await spill(), 'back').toEqual({ page: 0, bad: [] });
    await page.getByRole('button', { name: 'See the front' }).click();
    await expect(page.getByRole('button', { name: 'Save image' })).toBeVisible();
  });
}

test('closing the reveal lands on Route, even on the first visit of the day, with the welcome-back walkthrough not yet seen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(([rows]) => {
    localStorage.clear();
    for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
    localStorage.setItem('tp:me', 'Brittany');
  }, [seed]);
  await page.reload();
  await page.getByRole('button', { name: 'Close' }).click();
  await routeOnScreen(page);
  await expect(page.getByRole('tablist')).toBeVisible();
});

test('a second tab on the reveal closes it when the first tab finishes watching', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(([rows]) => {
    localStorage.clear();
    for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
    localStorage.setItem('tp:me', 'Brittany');
  }, [seed]);
  await page.reload();
  const other = await context.newPage();
  await other.setViewportSize({ width: 390, height: 844 });
  await other.goto('/');
  await expect(other.getByText('Mission unlocked')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(other.getByText('Mission unlocked')).toHaveCount(0);
  await expect(other.getByRole('tablist')).toBeVisible();
  // Start over or the guest sandbox in a third tab REMOVES the key; that must not bring the reveal back over what this tab is doing.
  const third = await context.newPage();
  await third.goto('/');
  await third.evaluate(() => localStorage.removeItem('tp:reveal-seen'));
  await other.evaluate(() => new Promise(r => setTimeout(r, 500)));
  await expect(other.getByText('Mission unlocked')).toHaveCount(0);
  await expect(other.getByRole('tablist')).toBeVisible();
});

test('one member starting over does not take the released plan away from the others', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seenWalkthroughToday(page);
  await page.goto('/');
  const open = seed.map(r => (r.name === 'Lazza' ? { ...r, submitted: false } : r));
  await page.evaluate(([rows, key]) => {
    localStorage.clear();
    for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:reveal-seen', key as string);
  }, [open, REVEAL_KEY]);
  await page.reload();
  await routeOnScreen(page);
  await expect(page.getByRole('group', { name: 'Days' })).toBeVisible();
});

test('the group plan holds the released places and none of the ruled-out ones', async ({ page }) => {
  await seenWalkthroughToday(page);
  await page.goto('/');
  await page.evaluate(([rows]) => {
    localStorage.clear();
    for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:reveal-seen', 'skip');
  }, [seed]);
  await page.reload();
  // The seen key differs from the release key, so the reveal plays first.
  await page.getByRole('button', { name: 'Close' }).click();
  await routeOnScreen(page);
  const chips = page.getByRole('group', { name: 'Days' }).getByRole('button');
  const days = await chips.count();
  expect(days, 'every released day is visited').toBe(9);
  let body = '';
  for (let d = 0; d < days; d++) {
    await chips.nth(d).click();
    await expect(chips.nth(d)).toHaveAttribute('aria-pressed', 'true');
    body += '\n' + await page.locator('.tv-card').innerText();
  }
  for (const gone of ['Yala', 'Udawalawe', 'Ella Rock', 'Anuradhapura', 'Polonnaruwa', 'Horton', 'Scuba']) expect(body, gone).not.toContain(gone);
  for (const kept of ['Elephant safari', 'Pidurangala', 'Knuckles']) expect(body, kept).toContain(kept);
});

// Sub-screens and the phone Back.
const TRIP = '2099-03-01';
const AT = '2026-11-02T00:00:00Z';
const bookIds = (JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string; book?: unknown }[] }).items.filter(i => i.book).map(i => `book:${i.id}`);
const openApp = async (page: import('@playwright/test').Page, allDone = false) => {
  const { AREAS } = await import('../src/types');
  await page.setViewportSize({ width: 390, height: 844 });
  await seenWalkthroughToday(page);
  await page.goto('/');
  await page.evaluate(([rows, key, done, trip, at, books, areas, people]) => {
    localStorage.clear();
    for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:reveal-seen', key as string);
    if (!done) return;
    const put = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
    put('tp:settings', { startDate: trip, plan: null, bookingDates: {}, overrides: [], updatedAt: at });
    put('tp:placesug', (areas as string[]).map(a => ({ id: `s-${a}`, name: 'Alex', area: a, kind: 'stay', title: a, status: 'live', createdAt: at })));
    put('tp:staysadmin', { pins: (areas as string[]).map(a => ({ area: a, suggestionId: `s-${a}`, at })), scouts: {}, closed: [] });
    put('tp:travellers', Object.fromEntries((people as string[]).map(p => [p, { name: p, arriveLocal: `${trip}T09:00`, arriveFlight: null, departLocal: `${trip}T09:00`, departFlight: null, updatedAt: at }])));
    put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries([...(books as string[]), ...(areas as string[]).map(a => `stay:${a}`)].map(id => [id, { done: true, doneAt: at }])), updatedAt: at });
  }, [seed, REVEAL_KEY, allDone, TRIP, AT, bookIds, AREAS, NAMES]);
  await page.reload();
};

test('a day picked on Route survives Guide, back to Route, and two phone Backs', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Day 3/ }).click();
  await expect(page.getByRole('button', { name: /Day 3/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Guide' }).click();
  await page.getByRole('tab', { name: 'Route' }).click();
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Guide' })).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Route' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /Day 3/ })).toHaveAttribute('aria-pressed', 'true');
});

test('Bookings opened from the board keeps the tab bar and phone Back returns to the board', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: 'To do' }).click();
  await expect(page.getByRole('heading', { name: 'To do' })).toBeVisible();
  await expect(page.getByRole('tablist')).toBeVisible();
  await page.getByRole('button', { name: /^Bookings/ }).click();
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  await expect(page.getByRole('tablist')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'To do' })).toBeVisible();
  await expect(page.getByRole('tablist')).toBeVisible();
});

test('Stays opened from the board sits over its tab, and closing the travel profile returns to Stays', async ({ page }) => {
  await openApp(page);
  await staysFromTodo(page);
  await expect(page.getByRole('tab', { name: 'To do' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Start my travel profile' }).click();
  await expect(page.getByText('1 of 6')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'To do' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start my travel profile' })).toBeVisible();
  await page.getByRole('button', { name: /Back to To do/ }).click();
  await expect(page.getByRole('heading', { name: 'To do' })).toBeVisible();
});

test('with every mission done the finale shows once on open, its button lands on the route, and a reload does not show it', async ({ page }) => {
  await openApp(page, true);
  const finaleSeen = () => page.evaluate(() => localStorage.getItem('tp:mission-complete-seen'));
  await expect(page.getByRole('button', { name: 'Go to the trip' })).toBeVisible();
  await expect.soft(page.getByRole('tablist'), 'a full-screen moment hides the tab bar').toHaveCount(0);
  expect.soft(await finaleSeen(), 'not marked seen by showing').toBeNull();
  await page.getByRole('button', { name: 'Go to the trip' }).click();
  await routeOnScreen(page);
  await expect(page.getByRole('tablist')).toBeVisible();
  expect(await finaleSeen()).toBe('1');
  await page.reload();
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to the trip' })).toHaveCount(0);
});

// The four tabs.
const colomboToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date());

test('the tab bar is Route, To do, Guide, Me at 320 wide with every label whole', async ({ page }) => {
  await openApp(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByRole('tab')).toHaveCount(4);
  for (const name of ['Route', 'To do', 'Guide', 'Me']) await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.tabs')!.getBoundingClientRect();
    const tabs = [...document.querySelectorAll('.tabs [role=tab]')];
    return {
      clipped: tabs.flatMap(t => [...t.querySelectorAll('span')].filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.textContent)),
      outside: tabs.filter(t => { const r = t.getBoundingClientRect(); return r.left < bar.left - 1 || r.right > bar.right + 1; }).map(t => t.textContent),
    };
  });
  expect(m).toEqual({ clipped: [], outside: [] });
});

// Lazza has done everything but the stays vote: it is open and she has not ranked her top 2 in Hill country.
const openTopTwo = async (page: import('@playwright/test').Page) => {
  await openApp(page, true);
  const { AREAS } = await import('../src/types');
  await page.evaluate(([areas, at, people]) => {
    const put = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
    const stay = (a: string, k: number) => ({ id: `s-${a}-${k}`, name: 'Alex', area: a, kind: 'stay', title: `House ${a} ${k}`, status: 'live', createdAt: at });
    localStorage.setItem('tp:me', 'Lazza');
    localStorage.setItem('tp:mission-complete-seen', '1');
    put('tp:placesug', (areas as string[]).flatMap(a => (a === 'Hill country' ? [0, 1, 2] : [0]).map(k => stay(a, k))));
    put('tp:staysadmin', { pins: [], scouts: Object.fromEntries((areas as string[]).map(a => [a, 'Alex'])), closed: [] });
    for (const p of people as string[]) put(`tp:stays:${p}`, { name: p, prefs: [], quizDone: true, locked: true, ranks: {}, bingo: [], updatedAt: at });
  }, [AREAS, AT, NAMES]);
  await page.reload();
};

test('a friend at the top 2 step is told so on Route, as the board\'s top card, and by To do badge 1', async ({ page }) => {
  await openTopTwo(page);
  await expect(page.getByRole('button', { name: 'Next: Pick your top 2' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'To do' }).locator('.badge-count')).toHaveText('1');
  await page.getByRole('tab', { name: 'To do' }).click();
  await expect(page.locator('.spy-me')).toContainText('Pick your top 2');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: /Back to To do/ })).toBeVisible();
});

test('a friend has no Menu button, on any tab', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Me' }).click();
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
});

test('on a trip day with nobody owing there is no To do tab, and a booking on the day card opens Bookings', async ({ page }) => {
  await openApp(page, true);
  await page.evaluate(([day]) => {
    const s = JSON.parse(localStorage.getItem('tp:settings')!);
    localStorage.setItem('tp:settings', JSON.stringify({ ...s, startDate: day }));
    localStorage.setItem('tp:mission-complete-seen', '1');
  }, [colomboToday()]);
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('tab', { name: 'To do' })).toHaveCount(0);
  const doors = page.getByRole('list', { name: 'Day bookings' }).getByRole('button');
  const chips = page.getByRole('group', { name: 'Days' }).getByRole('button');
  for (let d = 0; d < await chips.count() && await doors.count() === 0; d++) await chips.nth(d).click();
  await doors.first().click();
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Back to Route/ })).toBeVisible();
});

test('Start over is not offered to a friend', async ({ page }) => {
  await openApp(page);
  // A friend would look in the Menu first; on a build that still has one, open it.
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.count()) await menu.click();
  await expect(page.getByRole('button', { name: /start over/i })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Me' }).click();
  await expect(page.getByRole('button', { name: /start over/i })).toHaveCount(0);
});

test('a Crew page opened from Me closes onto Me with the phone Back', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: 'Me' }).click();
  await page.getByRole('button', { name: 'Group stats' }).click();
  await expect(page.getByRole('button', { name: /Back to Me/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: /Back to Me/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Me' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Group stats' })).toBeVisible();
});

test('a day card\'s stay line with no stay chosen opens a sheet whose door lands on that area in Stays, and Back returns to Route', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Day 8/ }).click();
  await page.getByRole('button', { name: /No stay chosen yet in/ }).click();
  const door = page.getByRole('dialog').getByRole('button', { name: /^Stays in / });
  const area = (await door.textContent())!.replace(/^Stays in /, '');
  await door.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Back to Route/ })).toBeVisible();
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Stays' }).getByRole('button', { name: new RegExp(`^${area}`) }).first()).toBeInViewport();
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Route' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Trip view')).toBeVisible();
  await expect(page.getByRole('tablist')).toBeVisible();
});

test('on a trip day, a stop on today\'s card opens its place sheet and tonight\'s stay opens the stay sheet with the Stays door', async ({ page }) => {
  await openApp(page, true);
  await page.evaluate(([day]) => {
    const s = JSON.parse(localStorage.getItem('tp:settings')!);
    // Day 3, which has stops: day 1 is the arrival day.
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 2);
    localStorage.setItem('tp:settings', JSON.stringify({ ...s, startDate: d.toISOString().slice(0, 10) }));
    localStorage.setItem('tp:mission-complete-seen', '1');
    localStorage.removeItem('tp:staysadmin');
  }, [colomboToday()]);
  await page.reload();
  const today = page.getByLabel('Today');
  await today.locator('.it-row').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await today.getByLabel('Tonight').getByRole('button').click();
  const door = page.getByRole('dialog').getByRole('button', { name: /^Stays in / });
  await door.click();
  await expect(page.getByRole('button', { name: /Back to Route/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Route' })).toHaveAttribute('aria-selected', 'true');
});

test('Play route reveal again: phone Back closes it onto Route, and its own Close leaves no entry behind', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Play route reveal' }).click();
  await expect(page.getByText('Mission unlocked')).toBeVisible();
  await page.goBack();
  await expect(page.getByText('Mission unlocked')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Route' })).toHaveAttribute('aria-selected', 'true');
  expect(page.url()).toContain('localhost');

  await page.getByRole('button', { name: 'Play route reveal' }).click();
  await expect(page.getByText('Mission unlocked')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Mission unlocked')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Route' })).toHaveAttribute('aria-selected', 'true');
  // Its entry is gone with it: one more Back leaves the app (to the page before it), not onto the reveal or another Route entry.
  await page.goBack();
  await expect(page.getByText('Mission unlocked')).toHaveCount(0);
  expect(page.url()).not.toContain('localhost');
});
