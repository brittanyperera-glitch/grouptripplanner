import { test, expect } from '@playwright/test';

// The centred character fills most of its tile, and no figure image spills out of its tile.
for (const height of [844, 667]) {
  test(`carousel figure fills its tile at 390 x ${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Choose your character' }).click();
    const names = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
    const m: Record<string, { fill: number; inside: boolean }> = {};
    for (const n of names) {
      if (n !== 'Brittany') await page.getByRole('button', { name: 'Next character' }).click();
      await page.waitForTimeout(700);
      m[n] = await page.evaluate((n) => {
        const tile = Array.from(document.querySelectorAll('.char')).find(c => c.textContent?.includes(n))!;
        const t = tile.getBoundingClientRect();
        const img = tile.querySelector('image')!.getBoundingClientRect();
        const svg = tile.querySelector('svg')!.getBoundingClientRect();
        return { fill: img.height / t.height, inside: img.top >= t.top - 0.5 && img.bottom <= t.bottom + 0.5 && svg.left >= t.left - 0.5 && svg.right <= t.right + 0.5 && svg.top >= t.top - 0.5 && svg.bottom <= t.bottom + 0.5 };
      }, n);
    }
    console.log(height, JSON.stringify(m));
    expect(m.Alex.fill).toBeGreaterThanOrEqual(0.8);
    for (const n of names) expect(m[n].inside, n).toBe(true);
  });
}
