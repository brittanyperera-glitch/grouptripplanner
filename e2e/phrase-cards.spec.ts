import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const brittany = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1)], skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
const SHOT = process.env.PHRASE_SHOT_DIR;

async function openCards(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/');
  await seenWalkthroughToday(page);
  await page.evaluate(f => { localStorage.clear(); localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f)); localStorage.setItem('tp:me', f.name); }, brittany);
  await page.reload();
  await page.getByRole('tab', { name: 'Group' }).click();
  await page.getByRole('button', { name: 'Open the guide' }).click();
  await page.getByRole('button', { name: 'Phrases' }).click();
  await page.getByRole('button', { name: 'Flash cards' }).click();
  await expect(page.locator('.pc-card')).toBeVisible();
}

const box = (page: Page, sel: string) => page.locator(sel).first().evaluate(e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; });

for (const [w, h] of [[320, 640], [390, 844], [1280, 800]] as const) {
  test(`phrase flash cards fit at ${w}x${h}`, async ({ page }) => {
    await openCards(page, w, h);
    // Longest English and longest Sinhala: walk the whole deck, both faces.
    for (let i = 0; i < 20; i++) {
      for (const flipped of [false, true]) {
        if (flipped) await page.locator('.pc-card').click();
        const m = await page.evaluate(() => {
          const r = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
          const face = document.querySelector('.pc-card')!;
          const texts = Array.from(document.querySelectorAll('.pc-en, .pc-si, .pc-say')).filter(e => getComputedStyle(e).visibility !== 'hidden');
          return {
            card: r(face),
            clip: texts.map(t => ({ sw: t.scrollWidth, cw: t.clientWidth, l: r(t).l, rr: r(t).r })),
            faceClip: Array.from(document.querySelectorAll('.pc-face')).filter(e => getComputedStyle(e).visibility !== 'hidden').map(e => e.scrollWidth - e.clientWidth),
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            vw: window.innerWidth,
          };
        });
        expect(m.card.l).toBeGreaterThanOrEqual(0);
        expect(m.card.r).toBeLessThanOrEqual(m.vw);
        expect(m.overflow).toBeLessThanOrEqual(0);
        for (const c of m.clip) { expect(c.sw).toBeLessThanOrEqual(c.cw + 1); expect(c.l).toBeGreaterThanOrEqual(m.card.l); expect(c.rr).toBeLessThanOrEqual(m.card.r); }
        for (const f of m.faceClip) expect(f).toBeLessThanOrEqual(1);
      }
      await page.getByRole('button', { name: 'Next' }).click();
    }
    // Controls are in the viewport and do not overlap each other or the card.
    const prev = await box(page, 'button:has-text("Prev")');
    const shuf = await box(page, 'button:has-text("Shuffle")');
    const next = await box(page, 'button:has-text("Next")');
    const card = await box(page, '.pc-card');
    expect(prev.r).toBeLessThanOrEqual(shuf.l);
    expect(shuf.r).toBeLessThanOrEqual(next.l);
    expect(next.r).toBeLessThanOrEqual(w);
    expect(prev.l).toBeGreaterThanOrEqual(0);
    expect(card.b).toBeLessThanOrEqual(prev.t);
    expect(next.b).toBeLessThanOrEqual(h + 400);
  });
}

test('front and back screenshots at 390x844', async ({ page }) => {
  test.skip(!SHOT, 'set PHRASE_SHOT_DIR to capture');
  await openCards(page, 390, 844);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.screenshot({ path: `${SHOT}/phrase-card-front.png` });
  await page.locator('.pc-card').click();
  await page.screenshot({ path: `${SHOT}/phrase-card-back.png` });
});
