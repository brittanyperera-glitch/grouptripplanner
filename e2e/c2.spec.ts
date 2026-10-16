import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// Brittany 2026-10-16: once all five have submitted the Picks tab goes, Group trip leads under My trip,
// and the Menu carries the open-item count instead of a dot.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const crew = ['Alex', 'Antek', 'Brittany', 'Lazza', 'Saulie'].map(name => ({
  name, days: 9, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: [['sigiriya']], keen: [], meh: [ids.filter(i => i !== 'sigiriya')], skip: [] },
}));

for (const w of [320, 390, 1280]) {
  test(`locked: five whole tabs, Group trip first, count on Open items, at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('/');
    await seenWalkthroughToday(page);
    await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); for (const r of rs) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r)); }, crew);
    await page.reload();
    await expect(page.getByRole('tab')).toHaveCount(5);
    await expect(page.getByRole('tab', { name: 'Picks' })).toHaveCount(0);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('.tabs')!.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('.tabs [role=tab]')];
      return {
        clipped: tabs.flatMap(t => [...t.querySelectorAll('span')].filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.textContent)),
        outside: tabs.filter(t => { const r = t.getBoundingClientRect(); return r.left < bar.left - 1 || r.right > bar.right + 1; }).map(t => t.textContent),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(m).toEqual({ clipped: [], outside: [], overflowX: 0 });

    await expect(page.getByRole('region', { name: 'The trip' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Group trip' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Democracy needs you' })).toHaveCount(0);

    await page.getByRole('button', { name: 'My trip' }).first().click();
    await expect(page.getByRole('region', { name: 'My trip' })).toBeVisible();
    await page.getByRole('tab', { name: /^Suggest/ }).click();
    await page.getByRole('tab', { name: /^My trip/ }).click();
    await expect(page.getByRole('region', { name: 'The trip' })).toBeVisible();

    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.locator('.oi-dot')).toHaveCount(0);
    const entry = page.getByRole('button', { name: /^Open items \(\d+\)$/ });
    await expect(entry).toBeVisible();
    expect(await entry.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
  });
}
