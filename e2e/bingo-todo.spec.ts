import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// Brittany 2026-10-16: making a travel bingo card counts as something to complete.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const b = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1)], skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
const crew = { name: 'Brittany', prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z' };

for (const w of [320, 390, 1280]) {
  test(`no card is a to-do until one is saved, then Open items is all done at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await seenWalkthroughToday(page);
    await page.goto('/');
    await page.evaluate(([f, c]) => { localStorage.clear(); localStorage.setItem('tp:resp:Brittany', JSON.stringify(f)); localStorage.setItem('tp:stays:Brittany', JSON.stringify(c)); localStorage.setItem('tp:me', 'Brittany'); }, [b, crew] as const);
    await page.reload();

    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Open items (1)' }).click();
    await page.getByRole('button', { name: /Make your travel bingo card/ }).click();

    await expect(page.getByRole('button', { name: 'New card' })).toBeVisible();
    await page.getByRole('button', { name: 'New card' }).click();
    // Changed deliberately (Brittany 2026-10-17): New card opens a 3x3 grid and a square is written in a sheet; there is no nine-field form.
    await page.getByRole('button', { name: 'Add square 1' }).click();
    await page.getByPlaceholder('e.g. Monkey steals food').fill('Thing 1');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: /Thing 1, not ticked/ })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('button', { name: /Card 1/ })).toBeVisible();
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).resolves.toBe(true);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Open items', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'All done.' })).toBeVisible();
  });
}
