import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// The travel quiz lives in My profile (not the Menu), saves when the last card is done, and closes on Done.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const b = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1)], skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };

for (const w of [320, 390, 1280]) {
  test(`travel quiz from My profile at ${w}px: saved on the last card, closes on Done`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await seenWalkthroughToday(page);
    await page.goto('/');
    await page.evaluate(f => { localStorage.clear(); localStorage.setItem('tp:resp:Brittany', JSON.stringify(f)); localStorage.setItem('tp:me', 'Brittany'); }, b);
    await page.reload();

    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('button', { name: 'Travel profile' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'My profile' })).toBeVisible();
    await page.getByRole('button', { name: 'My profile' }).click();

    const row = page.locator('.pf-quiz');
    await expect(row).toBeVisible();
    const [r, l] = await Promise.all([row.boundingBox(), row.locator('button').boundingBox()]);
    expect(l!.x).toBeGreaterThanOrEqual(r!.x);
    expect(l!.x + l!.width).toBeLessThanOrEqual(r!.x + r!.width + 1);
    await row.getByRole('button', { name: 'Do it, 3 minutes' }).click();

    await expect(page.getByText('1 of 6')).toBeVisible();
    // Changed deliberately (2026-10-16 review): skipping every card no longer counts as done, so answer one card.
    await page.getByRole('button', { name: 'Hostel dorm, not set' }).click();
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /^(Next|Skip, no answer)$/ }).click();
    // Saved the moment the last card is done, before anyone taps Done.
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('tp:stays:Brittany') !== null)).toBe(true);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByText('1 of 6')).toHaveCount(0);

    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'My profile' }).click();
    await expect(page.locator('.pf-quiz').getByRole('button', { name: 'Retake' })).toBeVisible();
  });
}
