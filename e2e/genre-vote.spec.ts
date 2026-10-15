import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

// All five Must Yala and Udawalawe, so two safaris land on the shortlist with no head to head before it.
// Every other place with a type is Skip, so the safari pair is the only question.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const genres = JSON.parse(fs.readFileSync('src/data/genres.json', 'utf8')) as { genres: { items: string[] }[] };
const ids = cat.items.map(i => i.id);
const MUST = ['yala', 'udawalawe'];
const SKIP = [...new Set(genres.genres.flatMap(g => g.items))].filter(id => !MUST.includes(id));
const friend = (name: string) => ({
  name, days: 9, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: MUST.map(m => [m]), keen: [], meh: [ids.filter(i => !MUST.includes(i) && !SKIP.includes(i))], skip: SKIP.map(s => [s]) },
});
const FRIENDS = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'].map(friend);

const open = async (page: Page, width: number, height: number) => {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.evaluate(fr => { localStorage.clear(); for (const f of fr) localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f)); localStorage.setItem('tp:me', 'Brittany'); }, FRIENDS);
  await page.reload();
  await page.getByRole('tab', { name: 'Group' }).click();
  const card = page.getByRole('group', { name: '2 safaris on the shortlist' });
  await expect(card).toBeVisible();
  return card;
};

for (const [width, height] of [[390, 844], [1280, 800]] as const) {
  test(`two safaris: the keep card fits and saves one vote per place at ${width}x${height}`, async ({ page }) => {
    const card = await open(page, width, height);
    await expect(card.getByText('You already have a safari: Yala leopard safari. Keep the others too?')).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // Every row and its parts stay inside the card; toggles overlap neither each other nor the names.
    const geo = await card.evaluate(el => {
      const r = (e: Element) => e.getBoundingClientRect();
      const c = r(el);
      const rows = [...el.querySelectorAll('.gv-row')].map(row => ({
        row: r(row), name: r(row.querySelector('.gv-name')!), toggle: row.querySelector('.gv-toggle') ? r(row.querySelector('.gv-toggle')!) : null,
        clipped: [...row.querySelectorAll('*')].some(x => x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).overflow !== 'visible'),
      }));
      return { c: { l: c.left, r: c.right }, rows: rows.map(x => ({ ...x, row: { l: x.row.left, r: x.row.right }, name: { r: x.name.right, t: x.name.top, b: x.name.bottom }, toggle: x.toggle && { l: x.toggle.left, r: x.toggle.right, t: x.toggle.top, b: x.toggle.bottom } })) };
    });
    expect(geo.rows.length).toBe(2);
    for (const row of geo.rows) {
      expect(row.row.l).toBeGreaterThanOrEqual(geo.c.l - 0.5);
      expect(row.row.r).toBeLessThanOrEqual(geo.c.r + 0.5);
      expect(row.toggle).not.toBeNull();
      expect(row.toggle!.r).toBeLessThanOrEqual(row.row.r + 0.5);
      expect(row.toggle!.l).toBeGreaterThanOrEqual(row.name.r - 0.5);
      expect(row.clipped).toBe(false);
    }
    const [t1, t2] = geo.rows.map(x => x.toggle!);
    expect(t1.b <= t2.t || t2.b <= t1.t).toBe(true);
    if (width === 390) await page.screenshot({ path: 'docs/review/genre-vote.png', fullPage: false });

    await card.getByRole('button', { name: 'Keep Udawalawe elephants and Transit Home' }).click();
    await expect(card.getByRole('button', { name: 'Keep Udawalawe elephants and Transit Home' })).toHaveAttribute('aria-pressed', 'false');
    await card.getByRole('button', { name: 'Save my picks' }).click();
    await expect(card.getByText('Saved')).toBeVisible();
    await expect(card.getByText('1 of 5 keep')).toBeVisible();
    await expect(card.getByText('0 of 5 keep')).toBeVisible();
    if (width === 390) await card.screenshot({ path: 'test-results/genre-vote-saved.png' });
    const votes = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => /vote/i.test(k)).map(([, v]) => v).join(''));
    expect(votes).toContain('genre:safari:yala');
    expect(votes).toContain('genre:safari:udawalawe');
    await expect(page.getByRole('status')).toHaveText('Waiting on votes to move onto the next knockout (2 more needed).');
  });
}
