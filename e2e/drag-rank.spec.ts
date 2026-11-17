import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { voteThroughOpenForks, seenWalkthroughToday } from './helpers';

// Brittany 2026-10-15: rank by dragging rows, inside a tier or across tiers, no arrow buttons. Real pointer and touch events at 390 x 844.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
type Ranking = { must: string[][]; keen: string[][]; meh: string[][]; skip: string[][] };

const MUST = ids.slice(0, 4), KEEN = ids.slice(4, 7);
const PICKS: Ranking = { must: MUST.map(i => [i]), keen: KEEN.map(i => [i]), meh: ids.slice(7).map(i => [i]), skip: [] };
const mine = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tp:resp:Brittany') ?? '{}').ranking as Ranking);
const row = (page: Page, id: string) => page.locator(`.item[data-id="${id}"]`);

async function openPicks(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(({ ranking, rated }) => {
    localStorage.clear();
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:resp:Brittany', JSON.stringify({ name: 'Brittany', days: 9, flex: false, pace: 1, ranking, rated, submitted: false, updatedAt: '2026-10-14T00:00:00Z' }));
  }, { ranking: PICKS, rated: ids });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Your picks' })).toBeVisible();
}

// A drag auto-scrolls the page when the pointer is in the top or bottom fifth of the viewport. Whether a release lands before or after
// that scroll depends on machine load, so centre the two rows first and require both pointer ends to sit clear of those zones.
async function centre(page: Page, id: string, toId: string) {
  const a = (await row(page, id).boundingBox())!, b = (await row(page, toId).boundingBox())!;
  const vh = page.viewportSize()!.height;
  await page.evaluate(([mid, h]) => window.scrollBy({ top: mid - h / 2, behavior: 'instant' }), [(Math.min(a.y, b.y) + Math.max(a.y + a.height, b.y + b.height)) / 2, vh]);
}

async function drag(page: Page, id: string, toId: string, where: 'above' | 'below', hold?: () => Promise<void>) {
  const vh = page.viewportSize()!.height;
  await centre(page, id, toId);
  const from = (await row(page, id).boundingBox())!, to = (await row(page, toId).boundingBox())!;
  const endY = where === 'above' ? to.y + 4 : to.y + to.height - 4;
  for (const y of [from.y + from.height / 2, endY]) expect(y, 'pointer outside the autoscroll zones').toBeGreaterThan(vh * 0.2);
  for (const y of [from.y + from.height / 2, endY]) expect(y, 'pointer outside the autoscroll zones').toBeLessThan(vh * 0.8);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + (to.y > from.y ? 8 : -8), { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, where === 'above' ? to.y + 4 : to.y + to.height - 4, { steps: 14 });
  if (hold) await hold();
  await page.mouse.up();
}

test('drag a row up inside its tier: the new order is saved and shown', async ({ page }) => {
  await openPicks(page);
  await expect(page.getByRole('button', { name: /^Move .* (up|down)$/ })).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await drag(page, MUST[2], MUST[0], 'above', async () => { await page.waitForTimeout(350); await shot(page, 'picks-mid-drag'); });
  await expect.poll(async () => (await mine(page)).must).toEqual([[MUST[2]], [MUST[0]], [MUST[1]], [MUST[3]]]);
  const order = await page.locator('ul[aria-label="Musts"] .item').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.id));
  expect(order).toEqual([MUST[2], MUST[0], MUST[1], MUST[3]]);
  await page.waitForTimeout(500);
  await shot(page, 'picks-after-drop');
});

test('drag a row into another tier: it joins that tier at the drop spot', async ({ page }) => {
  await openPicks(page);
  await drag(page, MUST[0], KEEN[1], 'below');
  await expect.poll(async () => (await mine(page)).keen).toEqual([[KEEN[0]], [KEEN[1]], [MUST[0]], [KEEN[2]]]);
  expect((await mine(page)).must).toEqual([[MUST[1]], [MUST[2]], [MUST[3]]]);
});

test('touch: a quick swipe scrolls the page, a press and hold then drag moves the row', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openPicks(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const a = (await row(page, MUST[3]).boundingBox())!;
  const x = a.x + a.width / 2;

  const y0 = a.y + a.height / 2;
  await touch('touchStart', x, y0);
  for (let i = 1; i <= 8; i++) await touch('touchMove', x, y0 - i * 25);
  await touch('touchEnd', x, 0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(40);
  expect((await mine(page)).must).toEqual(PICKS.must);

  // Let the swipe's fling settle before measuring, or the row moves under the next touch.
  await expect.poll(async () => { await page.evaluate(() => window.scrollTo(0, 0)); return page.evaluate(() => window.scrollY); }).toBe(0);
  await page.waitForTimeout(500);
  const from = (await row(page, MUST[3]).boundingBox())!, to = (await row(page, MUST[0]).boundingBox())!;
  await touch('touchStart', x, from.y + from.height / 2);
  await page.waitForTimeout(500);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', x, from.y + from.height / 2 + ((to.y + 4 - from.y - from.height / 2) * i) / 12); await page.waitForTimeout(40); }
  await page.waitForTimeout(200);
  await touch('touchEnd', x, 0);
  await expect.poll(async () => (await mine(page)).must).toEqual([[MUST[3]], [MUST[0]], [MUST[1]], [MUST[2]]]);
  await ctx.close();
});

// Finalize: reach it the way region.spec does, then drag a row and make a draw.
function friend(name: string, must: string[]) {
  const rest = ids.filter(i => !must.includes(i));
  return { name, days: 9, flex: false, pace: 1, ranking: { must: must.map(m => [m]), keen: [], meh: rest.map(r => [r]), skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
}
const NORTH = ['jaffna', 'delft', 'nainativu'], SOUTH = ['sigiriya', 'yala', 'galle'];
const FRIENDS = [friend('Brittany', NORTH), friend('Alex', NORTH), friend('Antek', SOUTH), friend('Lazza', SOUTH), friend('Saulie', SOUTH)];

test('Finalize: drag reorders, = makes a draw shown as a shared rank on joined rows, no side bar', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seenWalkthroughToday(page);
  await page.evaluate(fr => { localStorage.clear(); for (const f of fr) localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f)); localStorage.setItem('tp:me', 'Brittany'); }, FRIENDS);
  await page.reload();
  await page.getByRole('tab', { name: 'Group' }).click();
  for (const who of ['Antek', 'Lazza', 'Saulie']) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Not you?' }).click();
    await page.getByRole('button', { name: 'Choose your character' }).click();
    await page.getByRole('button', { name: who, exact: true }).click();
    await page.getByRole('tab', { name: 'Group' }).click();
    await page.getByRole('button', { name: /Group knockouts/ }).click();
    await page.getByRole('group', { name: /North or South/i }).getByRole('button', { name: 'Vote for South' }).click();
  }
  // The region fork settling opens the late item's own head to head, which needs its own three votes.
  for (const who of ['Antek', 'Lazza', 'Saulie']) await voteThroughOpenForks(page, who);
  await page.getByRole('tab', { name: 'Group' }).click();
  const list = page.getByRole('region', { name: 'Finalize your list' });
  await expect(list).toBeVisible();
  // The deciding vote swaps the tab's content: Finalize must open at the top, not where the vote card was scrolled.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const musts = list.locator('ul[aria-label="Musts"] .item');
  const first = await musts.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.id!));
  expect(first.length).toBeGreaterThanOrEqual(3);
  await expect(list.getByRole('button', { name: /^Move .* (up|down)$/ })).toHaveCount(0);

  const a = (await row(page, first[2]).boundingBox())!, b = (await row(page, first[0]).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 8, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 4, { steps: 14 });
  await page.mouse.up();
  await expect.poll(() => musts.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.id))).toEqual([first[2], first[0], first[1], ...first.slice(3)]);
  // dnd-kit swallows any click for 50 ms after a drop (so a drag never counts as a tap); a person cannot click that fast.
  await page.waitForTimeout(150);

  await list.getByRole('button', { name: /^Draw .* with the row above$/ }).nth(0).click();
  await expect(list.locator('.item.join')).toHaveCount(1);
  expect(await list.locator('.item .rk').first().textContent()).toBe('1=');
  const edge = await list.locator('.item').first().evaluate(el => getComputedStyle(el).borderLeftWidth);
  expect(edge).toBe('0px');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await shot(page, 'finalize-draw');
});
