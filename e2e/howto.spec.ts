import { test, expect, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function toHowTo(page: Page, query: string) {
  await page.goto(`/${query}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Choose your character' }).click();
  await page.getByRole('button', { name: 'Alex', exact: true }).click();
  // With motion on, picking a character needs the Select button (the lock-in screen).
  if (query.includes('quips')) await page.getByRole('button', { name: 'Select', exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: /^9 days/ }).click();
  await page.getByRole('button', { name: /^Balanced/ }).click();
}

// A real pointer drag from the card centre; the card is the thing the player grabs.
async function dragCard(page: Page, dx: number, dy: number) {
  const box = (await page.locator('.hw-card').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

const STEPS = [
  { word: 'Skip', dx: -140, dy: 0 },
  { word: 'Meh', dx: 0, dy: 140 },
  { word: 'Keen', dx: 0, dy: -140 },
  { word: 'Must', dx: 140, dy: 0 },
];

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`how-to practice with real swipes at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await toHowTo(page, '?howto=1');
    await expect(page.getByRole('button', { name: 'Skip the tutorial' })).toBeVisible();
    for (const s of STEPS) {
      const word = page.locator('.hw-word');
      await expect(word).toHaveText(s.word);
      // The big word and the hint arrow sit fully inside the viewport, and the page does not scroll sideways.
      for (const sel of ['.hw-word', '.hw-arrow', '.hw-step']) {
        const b = (await page.locator(sel).boundingBox())!;
        expect(b.x, sel).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, sel).toBeLessThanOrEqual(vp.width);
        expect(b.y, sel).toBeGreaterThanOrEqual(0);
        expect(b.y + b.height, sel).toBeLessThanOrEqual(vp.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (s.word === 'Skip') {
        // A wrong way is a nudge, not an error.
        await dragCard(page, 140, 0);
        await expect(word).toHaveText('Skip');
        await expect(page.getByRole('status').filter({ hasText: 'Other way' })).toBeVisible();
      }
      await dragCard(page, s.dx, s.dy);
    }
    await expect(page.getByText(/Order counts/)).toBeVisible();
    await page.getByRole('button', { name: "Let's go" }).click();
    await expect(page.getByText(/^1 of \d+$/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('how-to types out and shows the Skip practice step (screenshots, motion on)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toHowTo(page, '?quips=1');
  await expect(page.getByRole('button', { name: 'Skip the tutorial' })).toBeVisible();
  await page.waitForTimeout(900);
  await shot(page, 'howto-typing');
  await expect(page.locator('.hw-word')).toHaveText('Skip', { timeout: 15_000 });
  await shot(page, 'howto-skip-step');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
