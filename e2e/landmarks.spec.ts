import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { hits, type R } from './reveal-helpers';

// Hub landmarks on the route map (src/components/Landmarks.tsx): My trip after the tuk-tuk drive, and the group Plan.
// ?quips=1 turns motion back on under webdriver; without it the map is static and the landmarks are simply there.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const SHOTS = process.env.LANDMARK_SHOTS;

function person(name: string, days: number | null, must: string[], keen: string[]) {
  const rest = ids.filter(i => !must.includes(i) && !keen.includes(i));
  return { name, days, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
    ranking: { must: must.map(m => [m]), keen: keen.map(k => [k]), meh: [rest], skip: [] } };
}
const ME = person('Brittany', 9, ['sigiriya', 'tooth', 'ninearch', 'galle'], []);
const OTHERS = [
  person('Alex', 14, ['yala', 'surf'], ['sigiriya', 'galle', 'polonnaruwa']),
  person('Antek', 9, ['rafting', 'knuckles', 'diyaluma'], ['hiriketiya']),
  person('Lazza', 11, ['train', 'whales'], ['polonnaruwa', 'ellarock']),
  person('Saulie', 14, ['crab', 'horton', 'lipton'], ['surf', 'foodtour']),
];

async function land(page: Page, w: number, h: number, quips: boolean, everyone: boolean) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(quips ? '/?quips=1' : '/');
  await page.evaluate(({ me, others, everyone }) => {
    localStorage.clear();
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:reveal-mine', '1');
    for (const r of [me, ...(everyone ? others : [])]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
  }, { me: ME, others: OTHERS, everyone });
  await page.reload();
}

/** Everything inside the map, in page px: landmark art, stop names, stop dots, the tuk-tuk, and the column it must stay inside. */
async function measure(page: Page, region: string) {
  return page.evaluate((label) => {
    const map = document.querySelector(`[aria-label="${label}"] .map`)!;
    const svg = map.querySelector('svg')!;
    const r = (e: Element): R => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
    const stops = new Set((svg.getAttribute('aria-label') ?? '').replace('Route: ', '').split(', '));
    return {
      vw: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      app: r(document.querySelector('.app')!),
      stops: stops.size,
      landmarks: [...svg.querySelectorAll('[data-landmark]')].map(g => ({
        hub: g.getAttribute('data-landmark')!, box: r(g.querySelector('.lm-pop')!),
        opacity: Number(getComputedStyle(g.querySelector('.lm-pop')!).opacity), animations: g.getAnimations({ subtree: true }).filter(a => a.playState !== 'finished').length,
      })),
      names: [...svg.querySelectorAll('.stop-tag')].map(r),
      dots: [...svg.querySelectorAll('.stop-dot')].map(r),
      tuk: [...svg.querySelectorAll('[data-tuktuk]')].map(r),
    };
  }, region);
}
type M = Awaited<ReturnType<typeof measure>>;

function expectClear(m: M, where: string) {
  expect(m.landmarks.length, `${where}: one landmark per stop`).toBe(m.stops);
  expect(new Set(m.landmarks.map(l => l.hub)).size, `${where}: no hub twice`).toBe(m.stops);
  for (const l of m.landmarks) {
    expect(l.box.width, `${where}: ${l.hub} has size`).toBeGreaterThan(20);
    expect(l.opacity, `${where}: ${l.hub} visible`).toBe(1);
    expect(l.animations, `${where}: ${l.hub} finished popping`).toBe(0);
    expect(m.names.filter(n => hits(n, l.box)).length, `${where}: ${l.hub} covers a stop name`).toBe(0);
    expect(m.dots.filter(d => hits(d, l.box)).length, `${where}: ${l.hub} covers a stop dot`).toBe(0);
    expect(m.tuk.filter(t => hits(t, l.box)).length, `${where}: ${l.hub} covers the tuk-tuk`).toBe(0);
    expect(m.landmarks.filter(o => o.hub !== l.hub && hits(o.box, l.box)).map(o => o.hub), `${where}: ${l.hub} overlaps another landmark`).toEqual([]);
    expect(l.box.left, `${where}: ${l.hub} inside the column (left)`).toBeGreaterThanOrEqual(m.app.left);
    expect(l.box.right, `${where}: ${l.hub} inside the column (right)`).toBeLessThanOrEqual(m.app.right);
  }
  expect(m.overflowX, `${where}: horizontal overflow`).toBeLessThanOrEqual(0);
}

const SIZES = [[360, 740], [390, 844], [1280, 800]] as const;

for (const [w, h] of SIZES) {
  test(`My trip: after the drive every stop has a landmark and none covers a name or the tuk-tuk at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(90_000);
    await land(page, w, h, true, false);
    const map = page.getByRole('region', { name: 'My trip' }).locator('.map');
    await expect(map).toHaveAttribute('data-drive', 'on');
    await expect(map).toHaveAttribute('data-drive', 'done', { timeout: 30_000 });
    await expect.poll(async () => (await measure(page, 'My trip')).landmarks.every(l => l.animations === 0 && l.opacity === 1), { timeout: 5000 }).toBe(true);
    const m = await measure(page, 'My trip');
    expect(m.tuk.length).toBe(1);
    expectClear(m, `My trip ${w}x${h}`);
    if (SHOTS && w === 390) { await map.scrollIntoViewIfNeeded(); await map.screenshot({ path: `${SHOTS}/landmarks-390.png` }); }
  });

  test(`Group plan: every stop has a landmark and none covers a name at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(60_000);
    await land(page, w, h, true, true);
    await page.getByRole('tab', { name: 'Group' }).click();
    await expect(page.getByRole('region', { name: 'The trip' })).toBeVisible();
    await expect.poll(async () => (await measure(page, 'The trip')).landmarks.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await measure(page, 'The trip')).landmarks.every(l => l.animations === 0 && l.opacity === 1), { timeout: 8000 }).toBe(true);
    expectClear(await measure(page, 'The trip'), `Group plan ${w}x${h}`);
    if (SHOTS && w !== 360) await page.getByRole('region', { name: 'The trip' }).locator('.map').screenshot({ path: `${SHOTS}/landmarks-group-${w}.png` });
  });
}

test('with motion off the landmarks are there at once, still', async ({ page }) => {
  await land(page, 390, 844, false, false);
  await expect(page.getByRole('region', { name: 'My trip' })).toBeVisible();
  const m = await measure(page, 'My trip');
  expect(m.tuk.length).toBe(0);
  expectClear(m, 'My trip static');
});
