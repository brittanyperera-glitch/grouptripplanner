import { test, expect, type Page } from '@playwright/test';

const watchErrors = (page: Page) => {
  const errs: string[] = [];
  // index.html has no icon link, so Chrome's /favicon.ico 404s; ignored here, every other error fails.
  page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errs.push(`${m.text()} ${m.location().url}`); });
  page.on('response', r => { if (r.status() === 404 && !r.url().endsWith('/favicon.ico')) errs.push('404 ' + r.url()); });
  page.on('pageerror', e => errs.push(String(e)));
  return errs;
};

// A reload mid-guest would snapshot the already-cleared keys, so enter once by URL and re-enter from Landing.
async function enterAunty(page: Page, fromLanding = false) {
  if (fromLanding) await page.getByRole('button', { name: /Try it as a guest/ }).click();
  else await page.goto('/?howto=1#/guest');
  await page.getByRole('button', { name: 'Choose your character' }).click();
  await page.getByRole('button', { name: 'Aunty', exact: true }).click();
}

async function runToTabs(page: Page) {
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
}

async function finishAndReset(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
}

test('guest flow: play through, reset, start clean', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enterAunty(page);
  await expect(page.getByText('welcome aunty!')).toBeVisible();
  await runToTabs(page);

  await page.getByRole('tab', { name: 'Group' }).click();
  await page.getByRole('button', { name: /Group knockouts/ }).click();
  await page.getByRole('group', { name: /^Knockout:/ }).first().getByRole('button', { name: /^Vote for/ }).first().click();

  await finishAndReset(page);
  // Changed deliberately (Brittany 2026-10-16): the landing heading is now the brand, GROUP TRIP HERO.
  await expect(page.getByRole('heading', { name: 'Group Trip Hero' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Try it as a guest/ })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');

  await enterAunty(page, true);
  await expect(page.getByText('welcome aunty!')).toBeVisible();
  await page.getByRole('button', { name: /^9 days/ }).click();
  await page.getByRole('button', { name: /^Balanced/ }).click();
  await expect(page.getByRole('button', { name: 'Skip the tutorial' })).toBeVisible();
  expect(errs).toEqual([]);
});

test('guest session restores real device keys and leaves no new data keys', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const resp = JSON.stringify({ name: 'Alex', days: 14, flex: false, pace: 1, rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z' });
  await page.evaluate((r) => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); localStorage.setItem('tp:resp:Alex', r); }, resp);
  await enterAunty(page);
  await runToTabs(page);
  await finishAndReset(page);
  await expect(page.getByRole('heading', { name: 'Group Trip Hero' })).toBeVisible();
  const after = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(after['tp:me']).toBe('Alex');
  expect(after['tp:resp:Alex']).toBe(resp);
  for (const k of ['tp:votes', 'tp:sugg', 'tp:log']) expect(after[k]).toBeUndefined();
  expect(errs).toEqual([]);
});

test('a reload mid-guest, or leaving without Finish, still gives the device its real keys back', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); localStorage.setItem('tp-trip-key', 'secret'); });
  await enterAunty(page);
  expect(await page.evaluate(() => localStorage.getItem('tp:me'))).toBeNull();
  await page.reload();
  await page.getByRole('button', { name: 'Choose your character' }).click();
  await page.getByRole('button', { name: 'Aunty', exact: true }).click();
  await finishAndReset(page);
  expect(await page.evaluate(() => localStorage.getItem('tp:me'))).toBe('Alex');

  // Leave guest mode by just opening the app again (a closed tab, no Log out).
  await enterAunty(page, true);
  await page.goto('/');
  expect(await page.evaluate(() => [localStorage.getItem('tp:me'), localStorage.getItem('tp-trip-key'), localStorage.getItem('guest-snapshot')])).toEqual(['Alex', 'secret', null]);
});
