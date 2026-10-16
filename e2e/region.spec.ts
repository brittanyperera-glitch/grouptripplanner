import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { voteThroughOpenForks } from './helpers';

// Two friends want the north, three the south: the group stage should ask "North or South?" once.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

function friend(name: string, must: string[]) {
  const rest = ids.filter(i => !must.includes(i));
  const meh = rest.reduce<string[][]>((l, x, i) => (i % 3 ? l[l.length - 1].push(x) : l.push([x]), l), []);
  return { name, days: 9, flex: false, pace: 1, ranking: { must: must.map(m => [m]), keen: [], meh, skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
}
const NORTH = ['jaffna', 'delft', 'nainativu'];
const SOUTH = ['sigiriya', 'yala', 'galle'];
const FRIENDS = [friend('Brittany', NORTH), friend('Alex', NORTH), friend('Antek', SOUTH), friend('Lazza', SOUTH), friend('Saulie', SOUTH)];

test('one North or South question, settled by three votes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(fr => { localStorage.clear(); for (const f of fr) localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f)); localStorage.setItem('tp:me', 'Brittany'); }, FRIENDS);
  await page.reload();
  await page.getByRole('tab', { name: 'Group' }).click();
  await page.getByRole('button', { name: /Group knockouts/ }).click();
  await expect(page.getByText('North or South?')).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, 'region-open');
  for (const who of ['Antek', 'Lazza', 'Saulie']) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Not you?' }).click();
    await page.getByRole('button', { name: 'Choose your character' }).click();
    await page.getByRole('button', { name: who, exact: true }).click();
    await page.getByRole('tab', { name: 'Group' }).click();
    await page.getByRole('button', { name: /Group knockouts/ }).click();
    const region = page.getByRole('group', { name: /North or South/i });
    await region.getByRole('button', { name: 'Vote for South' }).click();
  }
  await expect(page.getByText('North or South?')).toHaveCount(0);
  // The region fork settling opens the late item's own head to head, which needs its own three votes.
  for (const who of ['Antek', 'Lazza', 'Saulie']) await voteThroughOpenForks(page, who);
  await page.getByRole('tab', { name: 'Group' }).click();
  await page.getByRole('button', { name: 'Save my list' }).click();
  await page.getByRole('button', { name: /Group knockouts/ }).click();
  // Settled forks sit behind the Decided toggle once other forks are open.
  const decided = page.getByRole('button', { name: /^Decided/ });
  if (await decided.count() && await decided.getAttribute('aria-expanded') === 'false') await decided.click();
  await expect(page.getByText(/South beat North/)).toBeVisible();
  await shot(page, 'region-decided');
});
