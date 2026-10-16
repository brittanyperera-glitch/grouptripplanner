import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// Brittany 2026-10-15: on days with no photo (first and last) the area label was near-white on paper, because the strip
// still carried the photo surface's light text colours. Every label on a plain strip must pass WCAG AA contrast.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const MUSTS = ['sigiriya', 'tooth', 'ninearch', 'galle'];
const me = {
  name: 'Brittany', days: 9, flex: false, pace: 1, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z',
  ranking: { must: MUSTS.map(m => [m]), keen: [], meh: [ids.filter(i => !MUSTS.includes(i))], skip: [] },
};

test('day labels on photo-less days pass WCAG AA contrast', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seenWalkthroughToday(page);
  await page.evaluate(r => { localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:reveal-mine', '1'); localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r)); }, me);
  await page.reload();
  await expect(page.locator('.day').first()).toBeVisible();
  const found = await page.evaluate(() => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const blend = (fg: number[], bg: number[]) => (fg.length > 3 ? fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])) : fg);
    return [...document.querySelectorAll('.strip.plain')].flatMap(s => {
      const bg = rgb(getComputedStyle(s).backgroundColor);
      return [...s.querySelectorAll('.d, .day-area')].map(el => {
        const cs = getComputedStyle(el);
        const fg = blend(rgb(cs.color), bg);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        // WCAG AA: 4.5:1, or 3:1 for large text (24px+, or 18.66px+ bold).
        const px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
        return { text: el.textContent, ratio: (a + 0.05) / (b + 0.05), need: large ? 3 : 4.5 };
      });
    });
  });
  expect(found.length).toBeGreaterThan(0);
  expect(found.filter(f => f.ratio < f.need)).toEqual([]);
});
