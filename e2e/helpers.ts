import type { Page } from '@playwright/test';
import { WALKTHROUGH_KEY, todayKey } from '../src/lib/walkthroughKey';

// A late catalogue item adds an open fork once the region fork settles, and it needs 3 votes of its own.
// Switches to `who`, opens the knockouts and votes the first option on every expanded fork they have not
// picked in yet (a pressed pill is their earlier vote and is left alone).
export async function voteThroughOpenForks(page: Page, who: string) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Not you?' }).click();
  await page.getByRole('button', { name: 'Choose your character' }).click();
  await page.getByRole('button', { name: who, exact: true }).click();
  await page.getByRole('tab', { name: 'Group' }).click();
  await page.getByRole('button', { name: /Group knockouts/ }).click();
  const forks = page.getByRole('group', { name: /^Knockout:/ });
  const open = forks.filter({ hasNot: page.locator('button[aria-pressed="true"]') }).getByRole('button', { name: /^Vote for/ });
  for (let i = 0; i < 12 && await open.count(); i++) {
    await open.first().click();
    await page.waitForTimeout(150);
  }
}

// Returning members now get a once-a-day welcome-back walkthrough. These specs test the screens behind it, so
// every load starts with today's walkthrough already seen (an init script survives the specs' own storage clears).
export const seenWalkthroughToday = (page: Page) => page.addInitScript(([key, day]) => {
  if (localStorage.getItem(key) === null) localStorage.setItem(key, day);
}, [WALKTHROUGH_KEY, todayKey(new Date())]);
