import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Brittany 2026-10-15: Mission ready needs an obvious way into Britt's guide.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const MUSTS = ['sigiriya', 'tooth', 'ninearch', 'galle'];
const me = {
  name: 'Brittany', days: 9, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: MUSTS.map(m => [m]), keen: [], meh: [ids.filter(i => !MUSTS.includes(i))], skip: [] },
};

test('See Britt\'s guide on Mission ready closes the reveal and opens the Guide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(r => { localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:reveal-mine', '1'); localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r)); }, me);
  await page.reload();
  await page.getByRole('button', { name: 'Play my route reveal' }).click();
  const ready = page.getByRole('region', { name: 'Mission ready' });
  const guide = ready.getByRole('button', { name: "See Britt's guide" });
  await expect(guide).toBeVisible();
  await expect(ready.getByText('No refunds. Only memories.')).toHaveCount(0);
  // High on the screen: right under the title, above the route list.
  const [g, list] = [await guide.boundingBox(), await ready.getByRole('list', { name: 'Itinerary' }).boundingBox()];
  expect(g!.y + g!.height).toBeLessThan(list!.y);
  await guide.click();
  await expect(page.getByRole('dialog', { name: 'Route reveal' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Guide', selected: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Phrases' })).toBeVisible();
  // The reveal's scroll lock is gone with it.
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
});
