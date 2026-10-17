import { test, expect, type Page } from '@playwright/test';

// The guest sandbox must never reach the shared database or write the device's real trip keys, Stays included.
const DATA_KEY = /^tp:(resp:|stays:|tripadmin:|votes$|sugg$|log$|placesug$|staysadmin$)/;

function watch(page: Page) {
  const supabase: string[] = [];
  page.on('request', r => { if (/supabase\.co/.test(r.url())) supabase.push(r.url()); });
  return supabase;
}

async function recordWrites(page: Page) {
  await page.addInitScript(() => {
    const w = (window as unknown as { __tpWrites: string[] });
    w.__tpWrites = [];
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) { if (this === window.localStorage) w.__tpWrites.push(k); return orig.call(this, k, v); };
  });
}
const writes = (page: Page) => page.evaluate(() => (window as unknown as { __tpWrites: string[] }).__tpWrites);

async function enterAunty(page: Page) {
  await page.goto('/?howto=1#/guest');
  await page.getByRole('button', { name: 'Choose your character' }).click();
  await page.getByRole('button', { name: 'Aunty', exact: true }).click();
}

// Rate, submit, vote through every knockout the example crew follows, answer the train question, save Aunty's list.
async function playToEnd(page: Page) {
  await page.getByRole('button', { name: /^9 days/ }).click();
  await page.getByRole('button', { name: /^Balanced/ }).click();
  const submit = page.getByRole('button', { name: 'Done, submit' });
  const skip = page.getByRole('button', { name: 'Skip the tutorial' });
  for (let g = 0; g < 400 && !(await submit.isVisible()); g++) {
    if (await skip.isVisible()) { await skip.click(); continue; }
    await page.getByRole('button', { name: 'Meh', exact: true }).click({ timeout: 2000 }).catch(() => {});
  }
  await submit.click();
  await expect(page.getByRole('tab', { name: 'My trip' })).toBeVisible();
  await page.getByRole('tab', { name: 'Group' }).click();
  const block = page.getByRole('button', { name: /Group knockouts/ });
  if (await block.count()) await block.click();
  const open = page.getByRole('group', { name: /^Knockout:/ }).filter({ hasNot: page.getByRole('button', { name: 'Change' }) }).getByRole('button', { name: /^Vote for/ });
  for (let i = 0; i < 40 && await open.count(); i++) { await open.first().click(); await page.waitForTimeout(200); }
  const picks = page.getByRole('button', { name: 'Save my picks' });
  if (await picks.count()) await picks.click();
  const list = page.getByRole('button', { name: 'Save my list' });
  await list.waitFor({ timeout: 5000 }).then(() => list.click()).catch(() => {});
  await expect(page.getByRole('region', { name: 'Finalize your list' })).toHaveCount(0);
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement, out: string[] = [];
    if (de.scrollWidth > de.clientWidth) out.push(`page x-overflow ${de.scrollWidth}>${de.clientWidth}`);
    const root = document.querySelector<HTMLElement>('.st');
    // The page clips sideways, so scrollWidth alone cannot see a wide child: also compare every box to the viewport.
    for (const e of root ? Array.from(root.querySelectorAll<HTMLElement>('*')) : []) {
      // Inner parts of an SVG (avatar art) overshoot their own clipped box by design; the <svg> box itself is checked.
      if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
      const b = e.getBoundingClientRect();
      if (b.width && b.right > window.innerWidth + 1) out.push(`past viewport: ${e.className || e.tagName} right ${b.right.toFixed(0)}`);
    }
    for (const p of root ? [root, ...Array.from(root.querySelectorAll<HTMLElement>('.st-card, .st-steps, .st-rows, .st-actions, .st-kinds'))] : []) {
      const cs = getComputedStyle(p), pr = p.getBoundingClientRect();
      const l = pr.left + parseFloat(cs.paddingLeft), r = pr.right - parseFloat(cs.paddingRight);
      for (const c of Array.from(p.children) as HTMLElement[]) {
        const b = c.getBoundingClientRect();
        if (b.width && (b.right > r + 1 || b.left < l - 1)) out.push(`${p.className}>${c.className || c.tagName} ${b.left.toFixed(0)}-${b.right.toFixed(0)} vs ${l.toFixed(0)}-${r.toFixed(0)}`);
      }
    }
    return out;
  });
}

test('guest: whole flow makes no Supabase request and writes no real trip keys', async ({ page }) => {
  test.setTimeout(240_000);
  const supabase = watch(page);
  await recordWrites(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enterAunty(page);
  await playToEnd(page);
  await page.waitForTimeout(1000);
  expect(supabase).toEqual([]);
  expect((await writes(page)).filter(k => DATA_KEY.test(k))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /^tp:(resp:|stays:|votes$|sugg$|log$|placesug$|staysadmin$)/.test(k)))).toEqual([]);
});

test('guest: Stays tab opens with the example crew, works in memory, and fits at 320, 390 and 1280', async ({ page }) => {
  test.setTimeout(240_000);
  const supabase = watch(page);
  await recordWrites(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enterAunty(page);
  await playToEnd(page);
  // The sandbox has to reach a final route on its own, or a guest can never see Stays.
  await expect(page.getByRole('tab', { name: 'Stays' })).toBeVisible();
  // The group awards open over the tabs once the route locks; closing them is the guest's first move.
  const awards = page.getByRole('dialog', { name: 'The group awards' });
  if (await awards.isVisible()) await awards.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('tab', { name: 'Stays' }).click();
  await expect(page.getByRole('region', { name: 'Stays' })).toBeVisible();
  for (const w of [320, 390, 1280]) { await page.setViewportSize({ width: w, height: 844 }); expect(await overflow(page), `${w}`).toEqual([]); }
  expect(supabase).toEqual([]);
  expect((await writes(page)).filter(k => DATA_KEY.test(k))).toEqual([]);
});
