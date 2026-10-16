import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// Brittany 2026-10-15: Your picks lives in the tab bar. The tabs must fit a small phone with every label whole.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const me = {
  name: 'Brittany', days: 9, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: [['sigiriya']], keen: [], meh: [ids.filter(i => i !== 'sigiriya')], skip: [] },
};

for (const w of [320, 360, 390, 1280]) {
  test(`tabs fit with whole labels, and Picks shows my list, at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('/');
    await seenWalkthroughToday(page);
    await page.evaluate(r => { localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:reveal-mine', '1'); localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r)); }, me);
    await page.reload();
    await expect(page.getByRole('tab')).toHaveCount(6);
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
    await page.getByRole('tab', { name: 'Picks' }).click();
    await expect(page.getByRole('list', { name: 'Musts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done, submit' })).toHaveCount(0);
  });
}
