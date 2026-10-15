import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Brittany 2026-10-15: "the final route flashed before the animation started". Submitting your picks lands on My trip,
// which autoplays the reveal; the screen-change view transition painted the new My trip, finished route and all, above
// the reveal for ~0.4 s (seen in a 25 fps recording, gone with transitions off). The reveal must end that transition.
// The flash lives in the transition's pseudo-elements, which the DOM cannot sample, so this checks the mechanism.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const MUSTS = ['sigiriya', 'tooth', 'ninearch', 'galle'];
const me = {
  name: 'Brittany', days: 9, flex: false, pace: 1, rated: ids, submitted: false, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: MUSTS.map(m => [m]), keen: [], meh: [ids.filter(i => !MUSTS.includes(i))], skip: [] },
};

test('submitting picks opens the reveal with the screen-change transition skipped', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'view transitions');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: { started: number; skipped: number } };
    w.__vt = { started: 0, skipped: 0 };
    const doc = Document.prototype as unknown as { startViewTransition?: (cb: () => void) => { skipTransition(): void } };
    const real = doc.startViewTransition;
    if (!real) return;
    doc.startViewTransition = function (this: Document, cb: () => void) {
      const vt = real.call(this, cb);
      w.__vt.started++;
      const skip = vt.skipTransition.bind(vt);
      vt.skipTransition = () => { w.__vt.skipped++; skip(); };
      return vt;
    };
  });
  await page.goto('/?quips=1');
  await page.evaluate(r => { localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:howto-seen', '1'); localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r)); }, me);
  await page.reload();
  await page.getByRole('button', { name: 'Done, submit' }).click();
  await expect(page.getByRole('dialog', { name: 'Route reveal' })).toBeVisible();
  const vt = await page.evaluate(() => (window as unknown as { __vt: { started: number; skipped: number } }).__vt);
  expect(vt.started).toBeGreaterThan(0);
  expect(vt.skipped).toBeGreaterThan(0);
});
