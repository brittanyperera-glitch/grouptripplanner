import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// Only Brittany has submitted: the Group tab shows the waiting screen with the guide button.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const brittany = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1)], skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };

for (const scheme of ['dark', 'light'] as const) {
  test(`guide at 390px, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await seenWalkthroughToday(page);
    await page.evaluate(f => { localStorage.clear(); localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f)); localStorage.setItem('tp:me', f.name); }, brittany);
    await page.reload();

    await page.getByRole('tab', { name: 'Group' }).click();
    await expect(page.getByRole('button', { name: 'Open the guide' })).toBeVisible();
    await page.waitForTimeout(600);
    await shot(page, `waiting-${scheme}`);

    // Five tabs fit inside the bar: every tab is within the bar box and none overlap.
    const boxes = await page.evaluate(() => {
      const r = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      const bar = document.querySelector('.tabs')!;
      return { bar: r(bar), tabs: Array.from(bar.querySelectorAll('button')).map(b => ({ ...r(b), sw: b.scrollWidth, cw: b.clientWidth })) };
    });
    expect(boxes.tabs).toHaveLength(6);
    for (const t of boxes.tabs) {
      expect(t.l).toBeGreaterThanOrEqual(boxes.bar.l);
      expect(t.r).toBeLessThanOrEqual(boxes.bar.r);
      expect(t.t).toBeGreaterThanOrEqual(boxes.bar.t);
      expect(t.b).toBeLessThanOrEqual(boxes.bar.b);
      expect(t.sw).toBeLessThanOrEqual(t.cw + 1);
    }
    for (let i = 1; i < boxes.tabs.length; i++) expect(boxes.tabs[i].l).toBeGreaterThanOrEqual(boxes.tabs[i - 1].r);
    console.log(`TABS ${scheme}`, JSON.stringify(boxes.tabs.map(t => [Math.round(t.l), Math.round(t.r), Math.round(t.r - t.l)])), 'bar', Math.round(boxes.bar.l), Math.round(boxes.bar.r));

    await page.getByRole('button', { name: 'Open the guide' }).click();
    await expect(page.getByRole('region', { name: 'Phrases' })).toBeVisible();
    await page.waitForTimeout(600);
    await shot(page, `guide-food-${scheme}`);

    // All six section chips are on screen without scrolling, at 390 and 360 px.
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 844 });
      const chips = await page.evaluate(() => Array.from(document.querySelectorAll('.guide-chips button')).map(b => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right }; }));
      expect(chips).toHaveLength(6);
      // Two even rows of three: no chip may be stretched across a row of its own.
      expect(new Set(chips.map(c => Math.round(c.r - c.l))).size).toBe(1);
      for (const c of chips) {
        expect(c.l).toBeGreaterThanOrEqual(0);
        expect(c.r).toBeLessThanOrEqual(w);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByRole('button', { name: 'Phrases' }).click();
    await expect(page.getByRole('region', { name: 'Phrases' })).toBeVisible();
    await shot(page, `guide-phrases-${scheme}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
