import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Brittany 2026-10-15: after Open the guide, a phone's Back left the app. Back must return to the previous tab.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const me = {
  name: 'Brittany', days: 9, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: [['sigiriya']], keen: [], meh: [ids.filter(i => i !== 'sigiriya')], skip: [] },
};

test('Back after Open the guide returns to Group, then My trip, without leaving the app', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(r => { localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:reveal-mine', '1'); localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r)); }, me);
  await page.reload();
  const tab = (name: string) => page.getByRole('tab', { name, selected: true });
  await expect(tab('My trip')).toBeVisible();

  await page.getByRole('tab', { name: 'Group' }).click();
  await expect(tab('Group')).toBeVisible();
  await page.getByRole('button', { name: 'Open the guide' }).click();
  await expect(tab('Guide')).toBeVisible();

  await page.goBack();
  await expect(tab('Group')).toBeVisible();
  await page.goBack();
  await expect(tab('My trip')).toBeVisible();
});
