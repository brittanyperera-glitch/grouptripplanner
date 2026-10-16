import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// Two live defects found by the 2026-10-16 review: the travel quiz had no way out (and the tab bar did nothing while
// it was open), and the Landing title broke mid-word on phones.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const b = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1)], skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };

async function openQuiz(page: import('@playwright/test').Page, w: number) {
  await page.setViewportSize({ width: w, height: 800 });
  await seenWalkthroughToday(page);
  await page.goto('/');
  await page.evaluate(f => { localStorage.clear(); localStorage.setItem('tp:resp:Brittany', JSON.stringify(f)); localStorage.setItem('tp:me', 'Brittany'); }, b);
  await page.reload();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'My profile' }).click();
  await page.locator('.pf-quiz').getByRole('button').click();
  await expect(page.getByText('1 of 6')).toBeVisible();
}

for (const w of [320, 390]) {
  test(`quiz can be closed without saving, and the tab bar is hidden while it is open (${w}px)`, async ({ page }) => {
    await openQuiz(page, w);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('1 of 6')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('tp:stays:Brittany'))).toBeNull();
    await expect(page.getByRole('tablist')).toBeVisible();
  });
  test(`skipping every card does not mark the quiz done (${w}px)`, async ({ page }) => {
    await openQuiz(page, w);
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /^(Skip, no answer|Next)$/ }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const row = await page.evaluate(() => JSON.parse(localStorage.getItem('tp:stays:Brittany') ?? 'null'));
    expect(row?.quizDone ?? false).toBe(false);
  });
}

test('Open items hides the tab bar so a tab tap cannot be swallowed (390px)', async ({ page }) => {
  await openQuiz(page, 390);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Open items' }).click();
  await expect(page.getByRole('tablist')).toHaveCount(0);
});

for (const w of [320, 360, 390, 430]) {
  test(`Landing title stays on one line at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('/#/landing');
    const t = page.locator('.landing-title');
    await expect(t).toBeVisible();
    // Wrapping between words is fine; a word split mid-way is the defect. Measure the widest whole word against the box.
    const m = await t.evaluate(e => {
      const words = (e.textContent ?? '').trim().split(/\s+/);
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;text-transform:uppercase';
      e.appendChild(probe);
      const widths = words.map(w => { probe.textContent = w; return probe.getBoundingClientRect().width; });
      probe.remove();
      return { widest: Math.max(...widths), box: e.clientWidth };
    });
    expect(m.widest, 'widest word vs title box').toBeLessThanOrEqual(m.box + 0.5);
  });
}
