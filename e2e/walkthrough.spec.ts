import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// A returning member with places still to rate gets the welcome-back walkthrough: every screen must fit the
// viewport, with the big line, the primary button and the skip link all inside it and nothing overlapping.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const brittany = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1, 6)], skip: [] }, rated: ids.slice(0, 6), submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
const SHOTS = process.env.SHOTS_DIR;

for (const scheme of ['light', 'dark'] as const) {
  for (const w of [320, 360, 390, 1280]) {
    test(`walkthrough fits at ${w}px, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: w, height: w >= 1280 ? 800 : 700 });
      await page.goto('/');
      await page.evaluate(f => { localStorage.clear(); localStorage.setItem('tp:resp:Brittany', JSON.stringify(f)); localStorage.setItem('tp:me', 'Brittany'); }, brittany);
      await page.reload();

      const wt = page.getByTestId('walkthrough');
      await expect(wt).toBeVisible();
      await expect(wt).toContainText('Greetings, Brittany');

      for (let screen = 0; screen < 6; screen++) {
        const box = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth, vh = window.innerHeight;
          const els = Array.from(document.querySelectorAll('[data-testid="walkthrough"] button, [data-testid="walkthrough"] p, [data-testid="walkthrough"] .hw-sentence')) as HTMLElement[];
          const rects = els.map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent ?? '').slice(0, 24), l: r.left, r: r.right, top: r.top, b: r.bottom, sw: e.scrollWidth, cw: e.clientWidth, tag: e.tagName }; });
          return { vw, vh, rects, scrollX: document.documentElement.scrollWidth - vw };
        });
        expect(box.scrollX, `sideways scroll on screen ${screen}`).toBeLessThanOrEqual(0);
        for (const r of box.rects) {
          expect(r.l, `${r.t} left`).toBeGreaterThanOrEqual(0);
          expect(r.r, `${r.t} right`).toBeLessThanOrEqual(box.vw + 0.5);
          expect(r.b, `${r.t} bottom`).toBeLessThanOrEqual(box.vh + 0.5);
          if (r.tag === 'BUTTON') expect(r.sw, `${r.t} clipped`).toBeLessThanOrEqual(r.cw + 1);
        }
        const buttons = box.rects.filter(r => r.tag === 'BUTTON');
        for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
          const a = buttons[i], b = buttons[j];
          const overlap = a.l < b.r && b.l < a.r && a.top < b.b && b.top < a.b;
          expect(overlap, `${a.t} overlaps ${b.t}`).toBe(false);
        }
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/walkthrough-${scheme}-${w}-${screen}.png` });
        const next = wt.getByRole('button', { name: /^(Next|Done)$/ });
        if (await next.count()) await next.first().click(); else break;
      }
    });
  }
}
