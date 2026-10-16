import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { seenWalkthroughToday } from './helpers';

// Brittany 2026-10-16: a plan entry opens in place, and the plan saves as a PDF. The PDFs are real:
// print media, page.pdf(), then pdftotext and pdftoppm on the file itself.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const OUT = path.join(process.env.CLAUDE_JOB_DIR ?? os.tmpdir(), 'tmp', 'itinerary');
const BIN = '/opt/homebrew/bin';

function friend(name: string, days: number | null, flex: boolean, must: string[], keen: string[]) {
  const rest = ids.filter(i => !must.includes(i) && !keen.includes(i));
  const chunk = (a: string[]) => a.reduce<string[][]>((l, x, i) => (i % 3 ? l[l.length - 1].push(x) : l.push([x]), l), []);
  return { name, days, flex, pace: 1, ranking: { must: must.map(m => [m]), keen: keen.map(k => [k]), meh: chunk(rest), skip: [] },
    rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
}
// All five have submitted, so the group plan is open.
const FIVE = [
  friend('Brittany', 9, false, ['sigiriya', 'elephants', 'train', 'ellarock', 'galle', 'surf'], ['crab', 'tea']),
  friend('Alex', 14, false, ['yala', 'surf'], ['sigiriya', 'galle', 'polonnaruwa']),
  friend('Antek', null, true, ['rafting', 'knuckles', 'diyaluma'], ['hiriketiya']),
  friend('Lazza', 11, false, ['train', 'whales'], ['polonnaruwa', 'ellarock']),
  friend('Saulie', 14, false, ['crab', 'horton', 'lipton'], ['surf', 'foodtour']),
];

async function openGroupTrip(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await seenWalkthroughToday(page);
  // The print dialog cannot be driven headless: count the call instead.
  await page.addInitScript(() => { (window as unknown as { __prints: number }).__prints = 0; window.print = () => { (window as unknown as { __prints: number }).__prints++; }; });
  await page.goto('/');
  await page.evaluate(fr => {
    localStorage.clear();
    for (const f of fr) localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f));
    localStorage.setItem('tp:me', 'Brittany');
  }, FIVE);
  await page.reload();
  await page.getByRole('tab', { name: 'My trip' }).click();
  await page.getByRole('button', { name: 'Group trip' }).click();
  await expect(page.getByRole('region', { name: 'The trip' })).toBeVisible();
}

const run = (cmd: string, args: string[]) => execFileSync(`${BIN}/${cmd}`, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const flat = (s: string) => s.replace(/\s+/g, ' ');

test('the group plan saves as a real PDF: A4 and Letter, plan content in, app chrome out', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT, { recursive: true });
  await openGroupTrip(page, 390);

  // The document does not exist until asked for, and is hidden on screen once it does.
  await expect(page.getByTestId('itinerary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save itinerary as PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
  await expect(page.getByTestId('itinerary')).toBeHidden();
  expect(await page.title()).toBe('Sri Lanka group itinerary');

  // What the screen says, to compare the file against.
  const rows = await page.locator('.days .it-row').allTextContents();
  const names = rows.map(r => /^(.*?), [\d.]+ h/.exec(r)?.[1]).filter((n): n is string => !!n);
  const drives = (await page.locator('.days .tline-txt').allTextContents()).map(flat);
  expect(names.length, 'activities on screen').toBeGreaterThan(8);
  expect(drives.length, 'drive lines on screen').toBeGreaterThan(2);

  await page.emulateMedia({ media: 'print' });
  for (const format of ['A4', 'Letter'] as const) {
    const file = path.join(OUT, `group-${format}.pdf`);
    fs.writeFileSync(file, await page.pdf({ format }));
    const pages = Number(/Pages:\s+(\d+)/.exec(run('pdfinfo', [file]))![1]);
    expect(pages, `${format} page count`).toBeGreaterThanOrEqual(1);
    expect(pages, `${format} page count`).toBeLessThanOrEqual(8);
    const text = flat(run('pdftotext', [file, '-']));
    expect(text).toContain('Sri Lanka itinerary');
    expect(text).toContain('Group itinerary');
    expect(text).toContain('Day 1');
    expect(text).toContain('Bookings');
    for (const n of names) expect(text, `${format}: ${n}`).toContain(flat(n));
    for (const d of drives) expect(text, `${format}: ${d}`).toContain(d);
    for (const chrome of ['Menu', 'Picks', 'Suggest', 'Guide', 'Profile', 'Group trip', 'Save itinerary as PDF', 'Full details']) {
      expect(text, `${format}: app chrome "${chrome}" in the file`).not.toContain(chrome);
    }
    run('pdftoppm', ['-r', '60', '-png', file, path.join(OUT, `group-${format}`)]);
  }
});

test('my own plan saves as My itinerary, with no provisional note', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await openGroupTrip(page, 390);
  await page.getByRole('button', { name: 'My trip', exact: true }).click();
  await expect(page.getByText(/Your best 9 days/)).toBeVisible();
  await page.getByRole('button', { name: 'Save itinerary as PDF' }).click();
  await page.emulateMedia({ media: 'print' });
  const file = path.join(OUT, 'mine-A4.pdf');
  fs.writeFileSync(file, await page.pdf({ format: 'A4' }));
  const text = flat(run('pdftotext', [file, '-']));
  expect(text).toContain('My itinerary');
  expect(text).not.toContain('Group itinerary');
  expect(text).not.toContain('Provisional');
  expect(text).toContain('Day 9');
  expect(text).not.toContain('Menu');
});

for (const w of [320, 390, 1280]) {
  test(`an expanded plan row fits and does not collide at ${w}px`, async ({ page }) => {
    await openGroupTrip(page, w);
    const row = page.locator('.days .it-row').first();
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    const box = await row.boundingBox();
    expect(box!.height, 'tap target height').toBeGreaterThanOrEqual(44);
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('.days .it-panel');
    await expect(panel).toHaveCount(1);
    const m = await panel.evaluate(p => {
      const day = p.closest('.day')!, line = p.closest('.timeline')!, r = (e: Element) => e.getBoundingClientRect();
      const kids = [...p.querySelectorAll('*')].map(r).filter(b => b.width > 0);
      const next = p.closest('.entry')!.nextElementSibling;
      const sc = [day, line, p, ...p.querySelectorAll('*')].map(e => e.scrollWidth - e.clientWidth).filter(d => d > 1);
      return {
        panel: r(p).toJSON(), day: r(day).toJSON(), line: r(line).toJSON(), kidRight: Math.max(...kids.map(b => b.right)), kidLeft: Math.min(...kids.map(b => b.left)),
        nextTop: next ? r(next).top : null, overflowing: sc.length, doc: [document.documentElement.scrollWidth, innerWidth],
      };
    });
    expect(m.kidRight, 'child past the day card').toBeLessThanOrEqual(m.day.right + 0.5);
    expect(m.kidLeft, 'child before the day card').toBeGreaterThanOrEqual(m.day.left - 0.5);
    expect(m.panel.bottom, 'panel past the day card').toBeLessThanOrEqual(m.day.bottom + 0.5);
    if (m.nextTop !== null) expect(m.panel.bottom, 'panel overlaps the next row').toBeLessThanOrEqual(m.nextTop + 0.5);
    expect(m.overflowing, 'elements wider than their box').toBe(0);
    expect(m.doc[0], 'page scrolls sideways').toBeLessThanOrEqual(m.doc[1]);
    await page.screenshot({ path: path.join(OUT, `expanded-${w}.png`) });
    // Full details opens the sheet for the same place and closes again.
    const name = (await row.textContent())!.split(',')[0];
    await panel.getByRole('button', { name: 'Full details' }).click();
    await expect(page.getByRole('dialog', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}
