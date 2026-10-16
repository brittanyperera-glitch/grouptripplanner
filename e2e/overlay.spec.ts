import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// One page over the tabs at a time, and the browser Back closes it (review 2026-10-16, lane B).
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const b = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1)], skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };

async function start(page: Page, w: number) {
  await page.setViewportSize({ width: w, height: 800 });
  await seenWalkthroughToday(page);
  await page.goto('/');
  await page.evaluate(f => { localStorage.clear(); localStorage.setItem('tp:resp:Brittany', JSON.stringify(f)); localStorage.setItem('tp:me', 'Brittany'); }, b);
  await page.reload();
}

for (const w of [320, 390, 1280]) {
  test(`browser Back closes Open items and shows the tab under it (${w}px)`, async ({ page }) => {
    await start(page, w);
    await expect(page.getByRole('tab', { name: 'My trip', selected: true })).toBeVisible();
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Open items' }).click();
    await expect(page.getByRole('heading', { name: 'Open items' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Open items' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'My trip', selected: true })).toBeVisible();
    await expect(page.getByRole('tabpanel', { name: 'My trip' })).toBeVisible();
  });

  test(`Travel Bingo from My profile: make a card, tick a square, Back (${w}px)`, async ({ page }) => {
    await start(page, w);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'My profile' }).click();
    await page.getByRole('button', { name: 'Travel Bingo' }).click();
    await expect(page.getByRole('tablist')).toHaveCount(0);

    await page.getByRole('button', { name: /New card/ }).click();
    await page.getByLabel('Card title').fill('Things that go wrong');
    for (let i = 1; i <= 9; i++) await page.getByLabel(`Square ${i}`, { exact: true }).fill(`Thing ${i}`);
    await page.getByRole('button', { name: 'Save card' }).click();
    await page.getByRole('button', { name: /Things that go wrong/ }).click();
    const sq = page.getByRole('button', { name: 'Thing 1, not ticked' });
    await sq.click();
    await expect(page.getByRole('button', { name: 'Thing 1, ticked' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: /New card/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Profile', selected: true })).toBeVisible();
    // The browser Back from Bingo lands on the profile too, not out of the app.
    await page.getByRole('button', { name: 'Travel Bingo' }).click();
    await page.goBack();
    await expect(page.getByRole('button', { name: /New card/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Profile', selected: true })).toBeVisible();
  });
}
