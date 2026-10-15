import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

// Four friends are pre-filled in localStorage (LocalStore stands in for the shared database);
// Brittany goes through every real screen, then Alex and Lazza vote via "Not you?".
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

function friend(name: string, days: number | null, flex: boolean, must: string[], keen: string[]) {
  const rest = ids.filter(i => !must.includes(i) && !keen.includes(i));
  const chunk = (a: string[]) => a.reduce<string[][]>((l, x, i) => (i % 3 ? l[l.length - 1].push(x) : l.push([x]), l), []);
  return { name, days, flex, pace: 1, ranking: { must: must.map(m => [m]), keen: keen.map(k => [k]), meh: chunk(rest), skip: [] },
    rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
}
const FRIENDS = [
  friend('Alex', 14, false, ['yala', 'surf'], ['sigiriya', 'galle', 'polonnaruwa']),
  friend('Antek', null, true, ['rafting', 'knuckles', 'diyaluma'], ['hiriketiya']),
  friend('Lazza', 11, false, ['train', 'whales'], ['polonnaruwa', 'ellarock']),
  friend('Saulie', 14, false, ['crab', 'horton', 'lipton'], ['surf', 'foodtour']),
];
const BRITTANY_MUSTS = new Set(['Sigiriya Rock', 'Elephant safari', 'Nanu Oya to Ella train', 'Ella Rock hike', 'Galle Fort and sunset', 'Weligama surf lesson']);

test('five friends: rate, submit, knockouts, final plan', async ({ page }) => {
  const groupTab = async () => {
    await page.getByRole('tab', { name: 'Group' }).click();
    await expect(page.getByRole('region', { name: 'The trip' })).toBeVisible();
  };
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate((fr) => { localStorage.clear(); for (const f of fr) localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f)); }, FRIENDS);
  await page.reload();

  await page.getByRole('button', { name: 'Choose your character' }).click();
  await page.getByRole('button', { name: 'Brittany', exact: true }).click();
  await page.getByRole('button', { name: /^9 days/ }).click();
  await page.getByRole('button', { name: /^Balanced/ }).click();

  const submit = page.getByRole('button', { name: 'Done, submit' });
  for (let guard = 0; guard < 400 && !(await submit.isVisible()); guard++) {
    const title = (await page.locator('.title').first().textContent())?.trim() ?? '';
    await page.getByRole('button', { name: BRITTANY_MUSTS.has(title) ? 'Must' : 'Meh', exact: true }).click();
  }
  await expect(page.getByRole('region', { name: 'Your picks' })).toBeVisible();
  await shot(page, 'picks');
  await submit.click();

  await page.getByRole('tab', { name: 'My trip' }).click();
  await expect(page.getByText(/Your best 9 days/)).toBeVisible();
  await shot(page, 'mytrip');

  await groupTab();
  await shot(page, 'group-open');
  for (let round = 0; round < 12; round++) {
    const forks = page.getByRole('group', { name: /^Knockout:/ });
    const n = await forks.count();
    if (n === 0) break;
    for (const who of ['Brittany', 'Alex', 'Lazza']) {
      if (who !== 'Brittany') {
        await page.getByRole('button', { name: 'Not you?' }).click();
        await page.getByRole('button', { name: 'Choose your character' }).click();
        await page.getByRole('button', { name: who, exact: true }).click();
        await groupTab();
      }
      const f = page.getByRole('group', { name: /^Knockout:/ });
      for (let i = 0; i < await f.count(); i++) await f.nth(i).locator('button.pick').first().click();
    }
    await page.getByRole('button', { name: 'Not you?' }).click();
    await page.getByRole('button', { name: 'Choose your character' }).click();
    await page.getByRole('button', { name: 'Brittany', exact: true }).click();
    await groupTab();
  }
  await expect(page.getByRole('group', { name: /^Knockout:/ })).toHaveCount(0);
  await expect(page.getByText('Provisional until the knockouts are done')).toHaveCount(0);
  await expect(page.getByText(/^Day 9\b/).first()).toBeVisible();
  await expect(page.getByText(/^Day 10\b/)).toHaveCount(0);
  await shot(page, 'group-final');

  // After the head to heads each friend finalizes their own list (Brittany 2026-10-15).
  await expect(page.getByRole('region', { name: 'Finalize your list' })).toBeVisible();
  await shot(page, 'finalize');
  await page.getByRole('button', { name: 'Save my list' }).click();
  await expect(page.getByText(/Your final list is saved\. 1 of 5 done/)).toBeVisible();
  await expect(page.getByText(/Provisional until all five finalize their lists \(1 of 5 done\)/)).toBeVisible();

  await page.getByRole('tab', { name: 'Everyone' }).click();
  await shot(page, 'everyone');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('tab', { name: 'Group' }).click();
  await shot(page, 'group-final-desktop');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'group-final-dark');
});
