import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const brittany = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1)], skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
const pending = ['Alex', 'Lazza', 'Saulie'].map((name, i) => ({ id: `s${i}`, name, title: 'Scuba diving', area: 'South coast', note: '', status: 'pending', createdAt: '2026-10-15T00:00:00Z' }));

for (const w of [320, 390, 1280]) {
  test(`Approve and Reject are two separate buttons inside the row at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('/');
    await seenWalkthroughToday(page);
    await page.evaluate(([f, s]) => { localStorage.clear(); localStorage.setItem('tp:resp:Brittany', JSON.stringify(f)); localStorage.setItem('tp:sugg', JSON.stringify(s)); localStorage.setItem('tp:me', 'Brittany'); }, [brittany, pending] as const);
    await page.reload();
    await page.getByRole('tab', { name: /Suggest/ }).click();
    const row = page.locator('.sug').first();
    const approve = row.getByRole('button', { name: 'Approve' }), reject = row.getByRole('button', { name: 'Reject' });
    await expect(approve).toBeVisible();
    const [r, a, j] = await Promise.all([row.boundingBox(), approve.boundingBox(), reject.boundingBox()]);
    for (const b of [a!, j!]) {
      expect(b.x).toBeGreaterThanOrEqual(r!.x);
      expect(b.x + b.width).toBeLessThanOrEqual(r!.x + r!.width + 1);
      expect(b.height).toBeGreaterThanOrEqual(40);
    }
    expect(a!.x + a!.width).toBeLessThanOrEqual(j!.x);
  });
}
