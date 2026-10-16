import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// Brittany 2026-10-16: every "nothing to do right now" screen is big, like the All done page, plus who is left.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const genres = JSON.parse(fs.readFileSync('src/data/genres.json', 'utf8')) as { genres: { items: string[] }[] };
const ids = cat.items.map(i => i.id);
const SHOTS = `${process.env.CLAUDE_JOB_DIR ?? 'test-results'}/tmp`;
fs.mkdirSync(SHOTS, { recursive: true });

const only = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1)], skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
const MUST = ['yala', 'udawalawe'];
const SKIP = [...new Set(genres.genres.flatMap(g => g.items))].filter(id => !MUST.includes(id));
const friend = (name: string) => ({
  name, days: 9, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: MUST.map(m => [m]), keen: [], meh: [ids.filter(i => !MUST.includes(i) && !SKIP.includes(i))], skip: SKIP.map(s => [s]) },
});
const FIVE = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'].map(friend);

async function start(page: Page, w: number, rows: object[]) {
  await page.setViewportSize({ width: w, height: 800 });
  await seenWalkthroughToday(page);
  await page.goto('/');
  await page.evaluate(rs => { localStorage.clear(); for (const r of rs as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r)); localStorage.setItem('tp:me', 'Brittany'); }, rows);
  await page.reload();
}

/** The measured claims every big state makes, on the page as it stands. */
async function check(page: Page, headline: string, shot: string, w: number, opts: { crew: boolean; buttons: number }) {
  const h = page.getByRole('heading', { name: headline });
  await expect(h).toBeVisible();
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const root = document.querySelector('.bs') as HTMLElement;
    const hd = root.querySelector('.bs-h') as HTMLElement;
    const hr = hd.getBoundingClientRect();
    const vw = innerWidth;
    const col = root.getBoundingClientRect();
    const all = [...root.querySelectorAll('*')].filter(e => !(e instanceof SVGElement && e.closest('svg') !== e));
    const clipped = all.filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible' && !(e instanceof SVGElement)).map(e => e.className);
    const offscreen = all.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -0.5 || r.right > vw + 0.5); }).map(e => String(e.getAttribute('class') ?? e.tagName));
    const pics = [...root.querySelectorAll('.bs-pic')].map(e => e.getBoundingClientRect());
    const overlap = pics.some((a, i) => pics.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom && b.top < a.bottom));
    const names = [...root.querySelectorAll('.bs-name')].map(e => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    return {
      font: parseFloat(getComputedStyle(hd).fontSize), hSw: hd.scrollWidth, hCw: hd.clientWidth, hl: hr.left, hr: hr.right, vw, cl: col.left, cr: col.right,
      doc: document.documentElement.scrollWidth, clipped, offscreen, overlap, pics: pics.length, names,
      buttons: [...root.querySelectorAll('button')].map(b => b.getBoundingClientRect().height),
    };
  });
  expect(m.font, 'headline font size').toBeGreaterThanOrEqual(56);
  expect(m.hSw).toBeLessThanOrEqual(m.hCw + 1);
  expect(m.hl).toBeGreaterThanOrEqual(0);
  expect(m.hr).toBeLessThanOrEqual(m.vw + 0.5);
  // The app is a phone-width column on a wide screen: the headline must fit that column, not just the window.
  expect(m.hl, 'headline inside its column').toBeGreaterThanOrEqual(m.cl - 0.5);
  expect(m.hr, 'headline inside its column').toBeLessThanOrEqual(m.cr + 0.5);
  expect(m.doc, 'horizontal overflow').toBeLessThanOrEqual(m.vw);
  expect(m.clipped, 'clipped elements').toEqual([]);
  expect(m.offscreen, 'elements off screen').toEqual([]);
  expect(m.pics).toBe(opts.crew ? 5 : 0);
  expect(m.overlap, 'avatars overlap').toBe(false);
  for (const n of m.names) expect(n.sw).toBeLessThanOrEqual(n.cw + 1);
  expect(m.buttons.length, 'buttons inside the big state').toBe(opts.buttons);
  for (const bh of m.buttons) { expect(bh).toBeGreaterThanOrEqual(44); expect(bh).toBeLessThanOrEqual(80); }
  await page.screenshot({ path: `${SHOTS}/bigstate-${shot}-${w}.png` });
  return m;
}

for (const w of [320, 390, 1280]) {
  test(`Waiting on the crew is big and fits at ${w}px`, async ({ page }) => {
    await start(page, w, [only]);
    await page.getByRole('tab', { name: 'Group' }).click();
    await check(page, 'Waiting on the crew.', 'waiting', w, { crew: true, buttons: 1 });
    await expect(page.getByRole('listitem', { name: /^Brittany,/ })).toHaveAttribute('data-done', 'true');
    await expect(page.getByRole('listitem', { name: /^Alex,/ })).toHaveAttribute('data-done', 'false');
  });

  test(`Group trip before it opens is big and fits at ${w}px`, async ({ page }) => {
    await start(page, w, [only]);
    await page.getByRole('tab', { name: 'My trip' }).click();
    await page.getByRole('button', { name: 'Group trip' }).click();
    await check(page, 'The plan is locked.', 'locked', w, { crew: true, buttons: 0 });
    await expect(page.getByRole('button', { name: 'My trip' })).toBeVisible();
  });

  test(`Knockouts once I have voted on everything is big and fits at ${w}px`, async ({ page }) => {
    await start(page, w, FIVE);
    await page.getByRole('tab', { name: 'Group' }).click();
    await page.getByRole('button', { name: /Group knockouts/ }).click();
    const card = page.getByRole('group', { name: '2 safaris on the shortlist' });
    await card.getByRole('button', { name: 'Keep Udawalawe elephants and Transit Home' }).click();
    await card.getByRole('button', { name: 'Save my picks' }).click();
    await check(page, 'Votes are in.', 'knockouts', w, { crew: true, buttons: 0 });
    await expect(page.getByRole('listitem', { name: /^Brittany,/ })).toHaveAttribute('data-done', 'true');
    await expect(page.getByRole('listitem', { name: /^Alex,/ })).toHaveAttribute('data-done', 'false');
  });

  test(`Suggest with no ideas is big, with the form still there, at ${w}px`, async ({ page }) => {
    await start(page, w, [only]);
    await page.getByRole('tab', { name: 'Suggest' }).click();
    await check(page, 'Got an idea?', 'suggest', w, { crew: false, buttons: 0 });
    await expect(page.getByRole('button', { name: 'Suggest it' })).toBeVisible();
    await expect(page.getByLabel('Title')).toBeVisible();
  });

  test(`Bingo with no cards is big and fits at ${w}px`, async ({ page }) => {
    await start(page, w, [only]);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'My profile' }).click();
    await page.getByRole('button', { name: 'Travel Bingo' }).click();
    await check(page, 'Make your first card.', 'bingo', w, { crew: false, buttons: 0 });
    await expect(page.locator('.bs-eg')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /New card/ })).toHaveCount(1);
  });
}
