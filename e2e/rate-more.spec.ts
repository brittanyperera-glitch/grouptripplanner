import { test, expect } from '@playwright/test';

// Brittany 2026-10-15: show people there is more card below until they have scrolled to its bottom.
test('More below shows on a long card, sits above the vote buttons, and goes once the bottom is seen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:howto-seen', '1');
    localStorage.setItem('tp:resp:Brittany', JSON.stringify({ name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z' }));
  });
  await page.reload();
  const more = page.getByRole('button', { name: 'More below' });
  await expect(more).toBeVisible();
  const m = await page.evaluate(() => {
    const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
    const hint = r('.rate-more'), bar = r('.tiers');
    return { hint: { l: hint.left, r: hint.right, b: hint.bottom }, barTop: bar.top + 10, vw: innerWidth };
  });
  expect(m.hint.l).toBeGreaterThanOrEqual(0);
  expect(m.hint.r).toBeLessThanOrEqual(m.vw);
  expect(m.hint.b).toBeLessThanOrEqual(m.barTop);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(more).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await expect(more).toHaveCount(0);
});
