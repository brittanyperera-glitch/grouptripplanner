import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const me = {
  name: 'Brittany', days: 9, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: [['sigiriya']], keen: [], meh: [ids.filter(i => i !== 'sigiriya')], skip: [] },
};

for (const w of [320, 360, 390, 1280]) {
  test(`no Guide section chip is cut off at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('/');
    await seenWalkthroughToday(page);
    await page.evaluate(r => { localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:reveal-mine', '1'); localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r)); }, me);
    await page.reload();
    await page.getByRole('tab', { name: 'Guide' }).click();
    await expect(page.getByRole('region', { name: 'Phrases' })).toBeVisible();
    const m = await page.evaluate(() => ({
      clipped: [...document.querySelectorAll('.guide-chips button')].filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(m.clipped).toEqual([]);
    expect(m.overflowX).toBeLessThanOrEqual(0);
  });
}
