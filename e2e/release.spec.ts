import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// The released plan: the route reveal opens first, then the full itinerary, then a button on to Stays.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const ranking = { must: [['sigiriya']], keen: [], meh: ids.filter(i => i !== 'sigiriya').map(i => [i]), skip: [] };
const NAMES = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
const seed = NAMES.map(name => ({ name, days: 9, flex: false, pace: 0, ranking, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' }));
const release = JSON.parse(fs.readFileSync('src/content/release.json', 'utf8')) as { days: number; items: string[] };
const REVEAL_KEY = `${release.days}:${release.items.join(',')}`;
const SHOTS = process.env.SHOTS_DIR;
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

    // 3. The full itinerary is the group plan, with the released days and a way on to Stays.
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByText('9 days, about')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next: find somewhere to stay' })).toBeVisible();
    await shot(page, `${w}-${scheme}-3-itinerary`);

    // 4. The button opens Stays; and the reveal does not play again on reload.
    await page.getByRole('button', { name: 'Next: find somewhere to stay' }).click();
    await expect(page.getByRole('tab', { name: 'Stays' })).toHaveAttribute('aria-selected', 'true');
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
      const wide = [...document.querySelectorAll<HTMLElement>('button, a, h1, h2, .big, .cta')].filter(e => e.getBoundingClientRect().right > de.clientWidth + 1).map(e => e.textContent?.trim().slice(0, 30));
      return { page: de.scrollWidth - de.clientWidth, wide };
    });
    await expect(page.getByText('Mission unlocked')).toBeVisible();
    expect(await overflow(), 'reveal').toEqual({ page: 0, wide: [] });
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: 'Next: find somewhere to stay' })).toBeVisible();
    expect(await overflow(), 'itinerary').toEqual({ page: 0, wide: [] });
    await page.getByRole('button', { name: 'Next: find somewhere to stay' }).click();
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
  await expect(page.getByRole('button', { name: 'Next: find somewhere to stay' })).toBeVisible();
  await expect(page.getByText('The group awards', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu' }).click();
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
    await page.getByRole('tab', { name: 'Profile' }).click();
    const spill = () => page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const bad = [...document.querySelectorAll<HTMLElement>('.pf-top > *, .pf-flip, .pf-actions, .pf-actions > button')].filter(e => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; });
      return { page: document.documentElement.scrollWidth - vw, bad: bad.map(e => e.className || e.tagName) };
    });
    await expect(page.getByRole('article', { name: 'Brittany trip card' })).toBeVisible();
    expect(await spill(), 'front').toEqual({ page: 0, bad: [] });
    await page.getByRole('button', { name: 'Flip card' }).click();
    await expect(page.getByRole('img', { name: /The Homecoming/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save poster' })).toBeVisible();
    expect(await spill(), 'back').toEqual({ page: 0, bad: [] });
    await page.getByRole('button', { name: 'See the front' }).click();
    await expect(page.getByRole('button', { name: 'Save image' })).toBeVisible();
  });
}

test('closing the reveal lands on the itinerary even on the first visit of the day, with the welcome-back walkthrough not yet seen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(([rows]) => {
    localStorage.clear();
    for (const r of rows as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
    localStorage.setItem('tp:me', 'Brittany');
  }, [seed]);
  await page.reload();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Next: find somewhere to stay' })).toBeVisible();
  await expect(page.getByRole('tablist')).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Next: find somewhere to stay' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Stays' })).toBeVisible();
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
  const body = await page.locator('main, body').first().innerText();
  for (const gone of ['Yala', 'Udawalawe', 'Ella Rock', 'Anuradhapura', 'Polonnaruwa', 'Horton', 'Scuba']) expect(body, gone).not.toContain(gone);
  for (const kept of ['Elephant safari', 'Pidurangala', 'Knuckles']) expect(body, kept).toContain(kept);
});
