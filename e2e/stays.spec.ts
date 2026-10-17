import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday, voteThroughOpenForks } from './helpers';

// Five submitted friends who all finalized the same list, so the route is final and Stays is open.
// LocalStore stands in for the shared database (the live one has no stays tables).
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const must = ['yala', 'surf', 'sigiriya'];
const ranking = {
  must: must.map(m => [m]), keen: [],
  meh: ids.filter(i => !must.includes(i)).map(i => [i]), skip: [],
};
const NAMES = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
const seed = NAMES.map(name => ({ name, days: 9, flex: false, pace: 1, ranking, final: ranking, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' }));

async function as(page: Page, who: string) {
  await page.evaluate(w => localStorage.setItem('tp:me', w), who);
  await page.reload();
  await page.getByRole('tab', { name: 'Stays' }).click();
}

// Every container that holds controls, checked against its own content box (rule: measure, not eyeball).
async function layout(page: Page, label: string) {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) out.push(`page overflows x: ${de.scrollWidth} > ${de.clientWidth}`);
    const root = (document.querySelector('.st') ?? document.body) as HTMLElement;
    // The page clips sideways, so scrollWidth alone cannot see a wide child: also compare every box to the viewport.
    for (const e of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      // Inner parts of an SVG (avatar art) overshoot their own clipped box by design; the <svg> box itself is checked.
      if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
      const b = e.getBoundingClientRect();
      if (b.width && b.right > window.innerWidth + 1) out.push(`past viewport: ${e.getAttribute('class') || e.tagName} in ${e.parentElement?.getAttribute('class')} / ${e.parentElement?.parentElement?.getAttribute('class')} right ${b.right.toFixed(0)} > ${window.innerWidth}`);
    }
    for (const parent of [root, ...Array.from(root.querySelectorAll<HTMLElement>('.st-card, .st-steps, .st-rows, .st-actions, .st-kinds, .st-top-bar, .st-admin'))]) {
      const cs = getComputedStyle(parent), pr = parent.getBoundingClientRect();
      const left = pr.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
      const right = pr.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
      for (const c of Array.from(parent.children) as HTMLElement[]) {
        const r = c.getBoundingClientRect();
        if (r.width === 0 || getComputedStyle(c).position === 'absolute') continue;
        if (r.right > right + 1 || r.left < left - 1) out.push(`${parent.className} > ${c.className || c.tagName}: ${r.left.toFixed(0)}-${r.right.toFixed(0)} outside ${left.toFixed(0)}-${right.toFixed(0)}`);
      }
    }
    // No scroll container nested inside another.
    const scrollers = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(e => {
      const o = getComputedStyle(e).overflowY;
      return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 1;
    });
    for (const s of scrollers) if (scrollers.some(o => o !== s && o.contains(s))) out.push(`nested scroll: ${s.className}`);
    return out;
  });
  expect(bad, label).toEqual([]);
}

async function runQuiz(page: Page) {
  await expect(page.getByText('Only counts are shown. Nobody sees who said what.')).toBeVisible();
  // First card: tap once = happy, twice = no way.
  const hostel = page.getByRole('button', { name: /^Hostel dorm, not set$/ });
  await hostel.click();
  await expect(page.getByRole('button', { name: /^Hostel dorm, happy$/ })).toBeVisible();
  const villa = page.getByRole('button', { name: /^Villa, not set$/ });
  await villa.click(); await page.getByRole('button', { name: /^Villa, happy$/ }).click();
  await expect(page.getByRole('button', { name: /^Villa, no way$/ })).toBeVisible();
  const advance = page.getByRole('button', { name: /^(Next|Skip, no answer|Done)$/ });
  // Cards after the first are skipped (skip is allowed); the last press shows the reveal.
  for (let i = 0; i < 8 && !(await page.getByText('Your travel personality').isVisible()); i++) await advance.click();
  await expect(page.getByText('Your travel personality')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}

async function addStay(page: Page, link: string, name: string, price: string) {
  await page.getByRole('button', { name: '+ Add a stay' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Link', { exact: true }).fill(link);
  await dlg.getByLabel('Name', { exact: true }).fill(name);
  await dlg.getByLabel(/^Price per person/).fill(price);
  await dlg.getByRole('button', { name: 'Add this stay' }).click();
  await expect(page.getByRole('article', { name })).toBeVisible();
}

test('stays: quiz gate, add, lock in, Brittany-only controls, persistence, layout', async ({ page }) => {
  test.setTimeout(240_000);
  await seenWalkthroughToday(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(fr => { localStorage.clear(); for (const f of fr) localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f)); localStorage.setItem('tp:me', 'Brittany'); }, seed);
  await page.reload();
  // The catalogue carries a late item (scuba) that needs three votes against the plan before the route is final.
  for (const who of ['Brittany', 'Alex', 'Lazza']) await voteThroughOpenForks(page, who);
  await as(page, 'Brittany');
  await page.getByRole('tab', { name: 'Stays' }).click();
  await expect(page.getByRole('region', { name: 'Stays' })).toBeVisible();
  for (const w of [320, 390, 1280]) { await page.setViewportSize({ width: w, height: 844 }); await layout(page, `home ${w}`); }
  await page.setViewportSize({ width: 390, height: 844 });

  // Quiz gate: adding is disabled until the travel profile is done.
  await expect(page.getByRole('heading', { name: 'Your travel profile' })).toBeVisible();
  await page.locator('.st-row').first().click();
  await expect(page.getByRole('button', { name: '+ Add a stay' })).toBeDisabled();
  await page.getByRole('button', { name: 'Do your travel profile first, 3 min' }).click();
  await runQuiz(page);
  await page.getByRole('tab', { name: 'Stays' }).click();
  await page.locator('.st-row').first().click();
  await expect(page.getByRole('button', { name: '+ Add a stay' })).toBeEnabled();

  await addStay(page, 'https://example.com/ella-view', 'Ella View Guesthouse', '18');
  for (const w of [320, 390, 1280]) { await page.setViewportSize({ width: w, height: 844 }); await layout(page, `board ${w}`); }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Pin as final' })).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^Lock in my stays \(1\)/ }).click();
  await page.getByRole('button', { name: 'Lock in my stays' }).click();
  await expect(page.getByText('1 of 5 locked')).toBeVisible();
  for (const w of [320, 390, 1280]) { await page.setViewportSize({ width: w, height: 844 }); await layout(page, `locked ${w}`); }
  await page.setViewportSize({ width: 390, height: 844 });

  // Brittany sees Unlock for herself; reload keeps everything.
  await expect(page.getByRole('group', { name: 'Reopen a stays list' }).getByRole('button', { name: 'Unlock Brittany' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Stays' }).click();
  await expect(page.getByText('1 of 5 locked')).toBeVisible();
  await page.locator('.st-row').first().click();
  await expect(page.getByRole('article', { name: 'Ella View Guesthouse' })).toBeVisible();

  // Alex: own quiz gate, own stay, own lock; no Brittany-only controls.
  await as(page, 'Alex');
  await page.locator('.st-row').first().click();
  await expect(page.getByRole('button', { name: '+ Add a stay' })).toBeDisabled();
  await page.getByRole('button', { name: 'Do your travel profile first, 3 min' }).click();
  await runQuiz(page);
  await page.getByRole('tab', { name: 'Stays' }).click();
  await page.locator('.st-row').first().click();
  await addStay(page, 'https://example.com/alex-place', 'Alex Beach Hut', '25');
  await expect(page.getByRole('button', { name: 'Pin as final' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unpin' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^Lock in my stays \(1\)/ }).click();
  await page.getByRole('button', { name: 'Lock in my stays' }).click();
  await expect(page.getByText('2 of 5 locked')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Reopen a stays list' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Unlock / })).toHaveCount(0);

  // Back as Brittany: she can see both stays, pin Alex's, and unlock.
  await as(page, 'Brittany');
  await expect(page.getByText('2 of 5 locked')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock Alex' })).toBeVisible();
  await page.locator('.st-row').first().click();
  await expect(page.getByRole('article', { name: 'Alex Beach Hut' })).toBeVisible();
  await page.getByRole('article', { name: 'Alex Beach Hut' }).getByRole('button', { name: 'Pin as final' }).click();
  await expect(page.getByRole('article', { name: 'Alex Beach Hut' }).getByRole('button', { name: 'Unpin' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Stays' }).click();
  await page.locator('.st-row').first().click();
  await expect(page.getByRole('article', { name: 'Alex Beach Hut' }).getByRole('button', { name: 'Unpin' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Unlock Alex' }).click();
  await expect(page.getByText('1 of 5 locked')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock Alex' })).toHaveCount(0);
});
