import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// The released plan: the route reveal opens first, then the full itinerary, then a button on to Stays.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const ranking = { must: [['sigiriya']], keen: [], meh: ids.filter(i => i !== 'sigiriya').map(i => [i]), skip: [] };
const NAMES = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
const seed = NAMES.map(name => ({ name, days: 9, flex: false, pace: 0, ranking, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' }));
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
