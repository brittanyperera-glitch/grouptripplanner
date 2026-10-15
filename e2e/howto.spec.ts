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

// A real pointer drag from the centre of the word (hw-card); the word is the thing the player grabs.
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

// ---- fun pass: motion on (?quips=1), measured at three viewports ----
type Box = { x: number; y: number; width: number; height: number };
const rect = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox()) as Box;
const inside = (b: Box, vp: { width: number; height: number }) => b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height + 0.5;
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function buttons(page: Page) {
  const out: Box[] = [];
  for (const b of await page.locator('.hw-tiers .t').all()) out.push((await b.boundingBox()) as Box);
  return out;
}

for (const vp of [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`how-to fun pass: everything fits and nothing overlaps the buttons at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await toHowTo(page, '?quips=1');
    await expect(page.locator('.hw-word')).toHaveText('Skip', { timeout: 15_000 });
    await expect(page.locator('.hw-pill[data-moving="true"]')).toBeVisible();

    // The word shakes left and back on a loop; sample the whole loop.
    for (let i = 0; i < 18; i++) {
      for (const sel of ['.hw-pill', '.hw-word', '.hw-sentence', '.hw-progress']) {
        const b = await rect(page, sel);
        expect(inside(b, vp), `${sel} inside viewport (sample ${i}): ${JSON.stringify(b)}`).toBe(true);
      }
      await page.waitForTimeout(110);
    }

    for (const [n, s] of STEPS.entries()) {
      await expect(page.locator('.hw-word')).toHaveText(s.word);
      await expect(page.locator('.hw-count')).toHaveText(new RegExp(`${n + 1}/4`, 'i'));
      // Let the sentence settle so we measure it at rest.
      await page.waitForTimeout(700);
      const btns = await buttons(page);
      expect(btns).toHaveLength(4);
      for (const sel of ['.hw-pill', '.hw-sentence', '.hw-word', '.hw-arrow', '.hw-progress', '.hw-slots', '.hw-count', '.hw-step', '.hw-nudge']) {
        const b = await rect(page, sel);
        expect(inside(b, vp), `${sel} inside viewport at step ${s.word}: ${JSON.stringify(b)}`).toBe(true);
        for (const [k, btn] of btns.entries()) expect(overlap(b, btn), `${sel} overlaps button ${k} at step ${s.word}`).toBe(false);
      }
      for (const btn of btns) expect(inside(btn, vp), `button inside viewport: ${JSON.stringify(btn)}`).toBe(true);
      expect(await noSideways(page)).toBe(true);
      await dragCard(page, s.dx, s.dy);
    }

    // Finale, then ranking.
    await expect(page.locator('.hw-natural')).toBeVisible();
    for (const sel of ['.hw-natural', '.hw-hero', '.hw-lane']) expect(inside(await rect(page, sel), vp), sel).toBe(true);
    expect(await noSideways(page)).toBe(true);
    await expect(page.getByText(/Order counts/)).toBeVisible({ timeout: 10_000 });
    expect(inside(await rect(page, '.cta'), vp)).toBe(true);
    expect(await noSideways(page)).toBe(true);
  });
}

test('how-to fun pass: a wrong swipe wobbles, a right one flies off with a stamp and a burst', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toHowTo(page, '?quips=1');
  await expect(page.locator('.hw-word')).toHaveText('Skip', { timeout: 15_000 });
  await dragCard(page, 140, 0);
  await expect(page.locator('.hw-pill.nudged')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Other way' })).toBeVisible();
  await expect(page.locator('.hw-pill')).toHaveAttribute('data-moving', 'false');
  await dragCard(page, -140, 0);
  await expect(page.locator('.ghost.fly-skip .stamp.skip')).toBeVisible();
  await expect(page.locator('.hw-burst span').first()).toBeAttached();
  await expect(page.locator('.ghost')).toHaveCount(0, { timeout: 3000 });
});

test('how-to fun pass: screenshots (motion on)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toHowTo(page, '?quips=1');
  await expect(page.locator('.hw-word')).toHaveText('Skip', { timeout: 15_000 });
  // The word mid-shake: wait for the loop, then catch it away from its resting spot.
  await expect(page.locator('.hw-pill[data-moving="true"]')).toBeVisible();
  await page.waitForFunction(() => {
    const el = document.querySelector('.hw-pill') as HTMLElement;
    const rest = el.offsetParent!.getBoundingClientRect().x + el.offsetLeft;
    return Math.abs(el.getBoundingClientRect().x - rest) > 10;
  });
  await shot(page, 'howto-fun-motion');
  await dragCard(page, -140, 0);
  await shot(page, 'howto-fun-fly');
  await page.waitForTimeout(900);
  await dragCard(page, 0, 140);
  await page.waitForTimeout(900);
  await expect(page.locator('.hw-count')).toHaveText(/3\/4/);
  await shot(page, 'howto-fun-progress-3of4');
  await dragCard(page, 0, -140);
  await page.waitForTimeout(900);
  await dragCard(page, 140, 0);
  await expect(page.locator('.hw-tuk')).toBeAttached();
  await page.waitForTimeout(600);
  await shot(page, 'howto-fun-finale');
});
