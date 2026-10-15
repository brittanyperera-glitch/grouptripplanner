import { test, expect } from '@playwright/test';

// Brittany 2026-10-15: "need to be able to go back if you click wrong". Undo brings the last card back and forgets its vote.
test('Undo brings back the last voted card, twice in a row, and removes its vote', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:howto-seen', '1');
    localStorage.setItem('tp:resp:Brittany', JSON.stringify({ name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z' }));
  });
  await page.reload();
  const title = page.locator('.card:not(.ghost) .title');
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('tp:resp:Brittany')!) as { rated: string[]; ranking: Record<string, string[][]> });
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);

  const first = await title.textContent();
  await page.locator('.tiers .t.must').click();
  await expect(title).not.toHaveText(first!);
  const second = await title.textContent();
  await page.locator('.tiers .t.skip').click();
  await expect(title).not.toHaveText(second!);
  await expect.poll(async () => (await saved()).rated.length).toBe(2);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(title).toHaveText(second!);
  await expect.poll(async () => (await saved()).rated.length).toBe(1);
  expect((await saved()).ranking.skip.flat()).toEqual([]);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(title).toHaveText(first!);
  await expect.poll(async () => (await saved()).rated.length).toBe(0);
  expect((await saved()).ranking.must.flat()).toEqual([]);
  await expect(page.getByText(/^1 of /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});
