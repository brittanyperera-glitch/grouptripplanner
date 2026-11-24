import { test, expect, type Page } from '@playwright/test';

// Changed deliberately (D11, Brittany 24 Nov 2026: "Show the new four tabs"): on the default build a guest opens on a made-up released
// trip with Route, To do, Guide and Me, not the voting flow. The file name puts it in the release project (playwright.config.ts);
// e2e/guest.spec.ts keeps covering the guest's voting flow on the vote-flow build, untouched.
const watchErrors = (page: Page) => {
  const errs: string[] = [];
  page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errs.push(`${m.text()} ${m.location().url}`); });
  page.on('response', r => { if (r.status() === 404 && !r.url().endsWith('/favicon.ico')) errs.push('404 ' + r.url()); });
  page.on('pageerror', e => errs.push(String(e)));
  page.on('request', r => { if (/supabase/i.test(r.url())) errs.push('supabase request ' + r.url()); });
  return errs;
};

// A reload mid-guest would snapshot the already-cleared keys, so enter once by URL and re-enter from Landing.
async function enterAunty(page: Page, fromLanding = false) {
  if (fromLanding) await page.getByRole('button', { name: /Try it as a guest/ }).click();
  // A new query string: a hash-only change from '/' would not reload the app into guest mode.
  else await page.goto('/?demo=1#/guest');
  await page.getByRole('button', { name: 'Choose your character' }).click();
  await page.getByRole('button', { name: 'Aunty', exact: true }).click();
}

async function toRoute(page: Page) {
  await expect(page.getByText('Mission unlocked')).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('tab', { name: 'Route' })).toHaveAttribute('aria-selected', 'true');
}

async function leaveFromMe(page: Page) {
  await page.getByRole('tab', { name: 'Me' }).click();
  await page.getByRole('button', { name: 'Leave the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Group Trip Hero' })).toBeVisible();
}

test('the guest demo opens on the sample trip with Route, To do, Guide and Me, and no organiser row', async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enterAunty(page);
  await toRoute(page);
  await expect(page.getByRole('tab')).toHaveText(['Route', /^To do/, 'Guide', 'Me']);
  await expect(page.getByLabel('Trip view')).toBeVisible();
  await expect(page.getByText('9 days, about')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'To do' }).click();
  await expect(page.getByRole('tabpanel', { name: 'To do' })).toBeVisible();

  await page.getByRole('tab', { name: 'Me' }).click();
  await expect(page.getByRole('button', { name: 'Leave the demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Organiser/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Group stats/ })).toHaveCount(0);
  expect(errs).toEqual([]);
});

test('leaving the demo from Me restores the real device keys and leaves no demo data keys', async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const resp = JSON.stringify({ name: 'Alex', days: 14, flex: false, pace: 1, rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z' });
  await page.evaluate((r) => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); localStorage.setItem('tp-trip-key', 'secret'); localStorage.setItem('tp:resp:Alex', r); }, resp);
  await enterAunty(page);
  expect(await page.evaluate(() => localStorage.getItem('tp:me'))).toBeNull();
  await toRoute(page);
  await leaveFromMe(page);
  await expect(page.getByRole('button', { name: /Try it as a guest/ })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  const after = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(after['tp:me']).toBe('Alex');
  expect(after['tp-trip-key']).toBe('secret');
  expect(after['tp:resp:Alex']).toBe(resp);
  for (const k of ['tp:votes', 'tp:sugg', 'tp:log', 'tp:reveal-seen', 'guest-snapshot']) expect(after[k]).toBeUndefined();
  expect(errs).toEqual([]);
});

test('a reload mid-guest, or leaving without the exit, still gives the device its real keys back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); localStorage.setItem('tp-trip-key', 'secret'); });
  await enterAunty(page);
  expect(await page.evaluate(() => localStorage.getItem('tp:me'))).toBeNull();
  await page.reload();
  await page.getByRole('button', { name: 'Choose your character' }).click();
  await page.getByRole('button', { name: 'Aunty', exact: true }).click();
  await toRoute(page);
  await leaveFromMe(page);
  expect(await page.evaluate(() => localStorage.getItem('tp:me'))).toBe('Alex');

  await enterAunty(page, true);
  await page.goto('/');
  expect(await page.evaluate(() => [localStorage.getItem('tp:me'), localStorage.getItem('tp-trip-key'), localStorage.getItem('guest-snapshot')])).toEqual(['Alex', 'secret', null]);
});
