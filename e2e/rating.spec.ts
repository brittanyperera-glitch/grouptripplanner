import { test, expect, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

for (const scheme of ['light', 'dark'] as const) {
  test(`rating flow at phone width, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Trip Planning. Optimized.' })).toBeVisible();
    await shot(page, `${scheme}-1-name`);
    await page.getByRole('button', { name: 'Alex', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('solo wolf');
    await shot(page, `${scheme}-1b-quip`);
    await page.getByRole('button', { name: /^9 days/ }).click();
    await page.getByRole('button', { name: /^Balanced/ }).click();
    const must = page.getByRole('button', { name: 'Must', exact: true });
    await expect(must).toBeVisible();
    await shot(page, `${scheme}-3-rate`);
    await must.click();
    await must.click();
    await expect(page.getByText(/which do you want more/i)).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, `${scheme}-4-compare`);
  });
}
