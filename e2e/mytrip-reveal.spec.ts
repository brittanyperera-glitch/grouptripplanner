import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { hits, inside, measureStop } from './reveal-helpers';

// Brittany has submitted; the others have not, so the group plan is not open. My trip is the landing tab.
// ?quips=1 turns motion back on under webdriver.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const MUSTS = ['sigiriya', 'tooth', 'ninearch', 'galle'];
const me = {
  name: 'Brittany', days: 9, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: MUSTS.map(m => [m]), keen: [], meh: [ids.filter(i => !MUSTS.includes(i))], skip: [] },
};
const SHOTS = process.env.REVEAL_SHOTS;

async function land(page: Page, w: number, h: number, quips = true) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(quips ? '/?quips=1' : '/');
  await page.evaluate(r => { localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r)); }, me);
  await page.reload();
}

for (const [w, h] of [[390, 844], [390, 667], [1280, 800]] as const) {
  test(`My trip plays my reveal once, then the tuk-tuk drives the map at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(120_000);
    const big = w === 390 && h === 844;
    await land(page, w, h);
    const dlg = page.getByRole('dialog', { name: 'Route reveal' });
    await expect(dlg).toHaveAttribute('data-stage', 'intro');
    await expect(dlg.getByText('YOUR ROUTE IS IN.')).toBeVisible();
    await page.waitForTimeout(900);
    if (big && SHOTS) await page.screenshot({ path: `${SHOTS}/1-intro.png` });

    const places: string[] = [];
    for (let guard = 0; guard < 12; guard++) {
      await expect(dlg).toHaveAttribute('data-stage', /stop|complete/, { timeout: 6000 });
      if ((await dlg.getAttribute('data-stage')) === 'complete') break;
      const next = dlg.getByRole('button', { name: 'Next stop' });
      if (!(await next.isVisible())) { await expect(dlg).toHaveAttribute('data-stage', 'complete', { timeout: 6000 }); break; }
      await page.waitForTimeout(650);
      if (big && SHOTS && places.length === 1) await page.screenshot({ path: `${SHOTS}/2-daycard.png` });
      const m = await measureStop(page);
      places.push(m.place);
      expect(m.overflowX).toBeLessThanOrEqual(0);
      expect(hits(m.card, m.tuk), `card covers the tuk-tuk at ${m.place}`).toBe(false);
      expect(hits(m.card, m.label), `card covers the ${m.place} label`).toBe(false);
      expect(m.labels.filter(l => hits(l, m.bubble)), `bubble covers a stop name at ${m.place}`).toEqual([]);
      expect(m.cardClipped).toBe(false);
      expect(inside(m.bubble, m.paper, 4)).toBe(true);
      expect(inside(m.card, { left: 0, top: 0, right: m.vw, bottom: m.vh, width: m.vw, height: m.vh })).toBe(true);
      await expect(dlg.getByRole('list', { name: 'Compromises' })).toHaveCount(0);
      await next.click();
    }
    expect(places.length).toBeGreaterThanOrEqual(3);

    const ready = dlg.getByRole('region', { name: 'Mission ready' });
    await expect(ready.getByText('MISSION READY')).toBeVisible();
    await expect(ready.getByRole('img', { name: / selfie$/ })).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.rv-crew figure')!).opacity), { timeout: 4000 }).toBe('1');
    if (big && SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/3-mission-ready.png` }); }
    await ready.getByRole('button', { name: 'Back to my trip' }).click();
    await expect(dlg).toHaveCount(0);

    // Back on My trip the map draws itself while the tuk-tuk drives it once.
    const map = page.getByRole('region', { name: 'My trip' }).locator('.map');
    await expect(map).toHaveAttribute('data-drive', 'on');
    await page.waitForTimeout(1200);
    const tuk = map.locator('[data-tuktuk]');
    const box = await page.evaluate(() => {
      const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
      const t = r('[aria-label="My trip"] .map [data-tuktuk]'), s = r('[aria-label="My trip"] .map svg');
      return { t: { left: t.left, right: t.right, top: t.top, bottom: t.bottom }, s: { left: s.left, right: s.right, top: s.top, bottom: s.bottom } };
    });
    expect(box.t.left).toBeGreaterThanOrEqual(box.s.left - 2);
    expect(box.t.right).toBeLessThanOrEqual(box.s.right + 2);
    if (big && SHOTS) await page.screenshot({ path: `${SHOTS}/4-mytrip-driving.png` });
    await expect(map).toHaveAttribute('data-drive', 'done', { timeout: 20000 });
    await expect(tuk).toHaveAttribute('data-driving', 'false');
    await expect(map.locator('polyline')).toHaveCount(2);
    if (big && SHOTS) await page.screenshot({ path: `${SHOTS}/5-mytrip-done.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    // Second visit: no auto reveal, the button still plays it.
    await page.reload();
    await expect(page.getByRole('region', { name: 'My trip' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog', { name: 'Route reveal' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Play my route reveal' }).click();
    await expect(page.getByRole('dialog', { name: 'Route reveal' })).toBeVisible();
  });
}

test('with motion off My trip is static and does not play the reveal by itself', async ({ page }) => {
  await land(page, 390, 667, false);
  await expect(page.getByRole('region', { name: 'My trip' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Route reveal' })).toHaveCount(0);
  await expect(page.locator('[aria-label="My trip"] .map [data-tuktuk]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play my route reveal' }).click();
  await expect(page.getByRole('region', { name: 'Mission ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to my trip' }).click();
  await expect(page.getByRole('dialog', { name: 'Route reveal' })).toHaveCount(0);
});
