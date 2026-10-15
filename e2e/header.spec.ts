import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Brittany 2026-10-15: one Menu keeps the header to one row. Two rows ate the sticky space and pushed
// Your picks rows into the auto-scroll zone, which broke drag-rank.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const picks = { must: ids.slice(0, 4).map(i => [i]), keen: ids.slice(4, 7).map(i => [i]), meh: ids.slice(7).map(i => [i]), skip: [] };

for (const [step, rated] of [['rate', ids.slice(0, 2)], ['picks', ids]] as const) {
  for (const w of [320, 360, 390, 1280]) {
    test(`header is one row with the menu inside the screen on ${step} at ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto('/');
      await page.evaluate(({ ranking, rated }) => {
        localStorage.clear();
        localStorage.setItem('tp:me', 'Brittany');
        localStorage.setItem('tp:howto-seen', '1');
        localStorage.setItem('tp:resp:Brittany', JSON.stringify({ name: 'Brittany', days: 9, flex: false, pace: 1, ranking, rated, submitted: false, updatedAt: '2026-10-14T00:00:00Z' }));
      }, { ranking: picks, rated: [...rated] });
      await page.reload();
      const menu = page.getByRole('button', { name: 'Menu' });
      await expect(menu).toBeVisible();
      // One row: every header item's vertical centre is within a few px of the others.
      const centres = await page.evaluate(() => [...document.querySelectorAll('.top > *')].map(e => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; }));
      expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(6);
      await menu.click();
      for (const name of ['Change days or pace', 'Not you?', 'Start over']) await expect(page.getByRole('button', { name })).toBeVisible();
      const box = await page.evaluate(() => { const r = document.querySelector('.hmenu-list')!.getBoundingClientRect(); return { l: r.left, r: r.right }; });
      expect(box.l).toBeGreaterThanOrEqual(0);
      expect(box.r).toBeLessThanOrEqual(w);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
}
