import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// Brittany 2026-10-16: the "you've done everything" message on Open items must be big and dominate the page.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const b = { name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [[ids[0]]], keen: [], meh: [ids.slice(1)], skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
// Changed deliberately (Brittany 2026-10-16): Bingo is now a to-do, so the member with nothing to do holds one card.
const card = { id: 'b1', title: 't', squares: Array.from({ length: 9 }, () => ({ text: 's', ticked: false })), createdAt: '' };
const crew = { name: 'Brittany', prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [card], updatedAt: '2026-10-14T00:00:00Z' };

for (const w of [320, 390, 1280]) {
  test(`the all-done message is big and fits at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await seenWalkthroughToday(page);
    await page.goto('/');
    await page.evaluate(([f, c]) => { localStorage.clear(); localStorage.setItem('tp:resp:Brittany', JSON.stringify(f)); localStorage.setItem('tp:stays:Brittany', JSON.stringify(c)); localStorage.setItem('tp:me', 'Brittany'); }, [b, crew] as const);
    await page.reload();
    await page.getByRole('button', { name: /^Open items/ }).or(page.getByRole('button', { name: 'Menu' })).first().click();
    await page.getByRole('button', { name: /^Open items/ }).click();
    const h = page.getByRole('heading', { name: 'All done.' });
    await expect(h).toBeVisible();
    const m = await h.evaluate(e => { const r = e.getBoundingClientRect(); return { font: parseFloat(getComputedStyle(e).fontSize), w: r.width, h: r.height, l: r.left, r: r.right, sw: e.scrollWidth, cw: e.clientWidth, vw: innerWidth }; });
    expect(m.font, 'headline font size').toBeGreaterThanOrEqual(64);
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    expect(m.l).toBeGreaterThanOrEqual(0);
    expect(m.r).toBeLessThanOrEqual(m.vw + 0.5);
    await expect(page.getByText('Nothing to do. Enjoy the planning.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to my trip' })).toBeVisible();
    // The page-filling flex column must not stretch the button: a button is a button-sized thing.
    const btn = await page.getByRole('button', { name: 'Back to my trip' }).boundingBox();
    expect(btn!.height, 'button height').toBeLessThanOrEqual(80);
    expect(btn!.height, 'button height').toBeGreaterThanOrEqual(44);
  });
}
