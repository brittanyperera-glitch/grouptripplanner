import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// The floating Skip/Meh/Keen/Must bar must never hide the card's text: scrolled to the bottom,
// every line of the info panel sits above the bar. Checked on the place with the longest review.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const copy = JSON.parse(fs.readFileSync('src/content/copy.json', 'utf8')) as { items: Record<string, { review?: string }> };
const ids = cat.items.map(i => i.id);
const longest = ids.filter(id => copy.items[id]?.review).sort((a, b) => copy.items[b].review!.length - copy.items[a].review!.length)[0];

for (const height of [844, 667]) {
  test(`rating bar clears the last line at 390 x ${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await page.goto('/');
    const rated = ids.filter(id => id !== longest);
    await page.evaluate(({ rated }) => {
      localStorage.clear();
      localStorage.setItem('tp:me', 'Brittany');
      const ranking = { must: [], keen: [], meh: [rated.slice(0, 3)], skip: [] };
      localStorage.setItem('tp:resp:Brittany', JSON.stringify({ name: 'Brittany', days: 9, flex: false, pace: 1, ranking, rated, submitted: false, updatedAt: '2026-10-14T00:00:00Z' }));
    }, { rated });
    await page.reload();
    await expect(page.locator('.review')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('.tiers')!.getBoundingClientRect();
      const lines = Array.from(document.querySelectorAll('.info > *')).map(el => el.getBoundingClientRect().bottom);
      return { barTop: bar.top, lastBottom: Math.max(...lines) };
    });
    expect(m.lastBottom).toBeLessThanOrEqual(m.barTop);
  });
}
