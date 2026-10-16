import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs';

const PLAYERS = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'] as const;
const SIZES = [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 800 }];
type View = 'card' | 'character';
const FACTS: Record<string, string> = {
  Saulie: 'HE HAS BANGS NOW',
  Alex: 'LOVES TO CARPE DIEM IN THEORY',
  Lazza: 'IS NOT A PERMANENT RESIDENT OF GREAT BRITAIN & NORTHERN IRELAND',
  Antek: 'IS NEARLY FLUENT IN ENGLISH',
  Brittany: '34TH IN LINE TO THE SRI LANKAN THRONE',
};

async function open(page: Page, who: string, size: { width: number; height: number }, view: View = 'card', query = '') {
  await page.setViewportSize(size);
  await page.goto('/');
  await page.evaluate(([w, v]) => {
    localStorage.clear();
    localStorage.setItem('tp:me', w);
    localStorage.setItem('tp:howto-seen', '1');
    localStorage.setItem('tp:profile-view', v);
    localStorage.setItem(`tp:resp:${w}`, JSON.stringify({ name: w, days: 9, flex: false, pace: 1, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z' }));
  }, [who, view]);
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: `${who}, view your profile` }).click();
  await expect(page.locator('.pf-screen')).toBeVisible();
}

const eps = 0.5;

for (const who of PLAYERS) {
  for (const size of SIZES) {
    test(`${who} card view: fits, nothing clipped or overlapping at ${size.width}x${size.height}`, async ({ page }) => {
      await open(page, who, size);
      await expect(page.getByRole('article', { name: `${who} trip card` })).toBeVisible();
      await page.waitForTimeout(700);

      const m = await page.evaluate(() => {
        const r = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const q = (s: string) => [...document.querySelectorAll<HTMLElement>(s)];
        const one = (s: string) => r(document.querySelector(s)!);
        const btns = q('.pf-actions > button');
        return {
          vw: innerWidth, vh: innerHeight, scrollY, app: one('.app'), header: one('header.top'),
          card: one('.pf-card'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          pageOverflow: document.documentElement.scrollHeight - innerHeight,
          actions: one('.pf-actions'),
          btns: btns.map(b => ({ ...r(b), clipped: b.scrollWidth > b.clientWidth + 1, text: b.textContent })),
          clipped: q('.pf-c-name, .pf-c-title, .pf-c-label, .pf-c-fact > b, .pf-c-fact > span, .pf-c-meta > span, .pf-c-no, .pf-c-stamp').filter(e => e.scrollWidth > e.clientWidth + 1).map(e => `${e.className}:${e.textContent}`),
          stats: q('.pf-c-stat').map(s => ({ val: r(s.querySelector('.pf-c-val')!), label: r(s.querySelector('.pf-c-label')!), bar: r(s.querySelector('.pf-c-bar')!) })),
          panel: one('.pf-c-stats'), fact: one('.pf-c-fact'), factText: one('.pf-c-fact > b'), factTag: one('.pf-c-fact > span'), factLines: Math.round((document.querySelector('.pf-c-fact > b') as HTMLElement).getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('.pf-c-fact > b')!).lineHeight)), factWords: document.querySelector('.pf-c-fact > b')!.textContent, meta: one('.pf-c-meta'), name: one('.pf-c-name'), title: one('.pf-c-title'),
          art: one('.pf-c-art img'), plate: one('.pf-c-plate'), stamp: one('.pf-c-stamp'), stars: one('.pf-c-stars'), no: one('.pf-c-no'),
          artLoaded: (document.querySelector('.pf-c-art img') as HTMLImageElement).naturalWidth > 0,
          artSrc: (document.querySelector('.pf-c-art img') as HTMLImageElement).getAttribute('src'),
          scrollables: q('.pf-screen *').filter(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1 && !e.closest('.pf-card')).length,
          cardW: (document.querySelector('.pf-card') as HTMLElement).offsetWidth,
        };
      });
      // Inside the viewport and the app column, below the sticky header, without scrolling.
      expect(m.card.l).toBeGreaterThanOrEqual(Math.max(0, m.app.l) - eps);
      expect(m.card.r).toBeLessThanOrEqual(Math.min(m.vw, m.app.r) + eps);
      expect(m.card.t).toBeGreaterThanOrEqual(m.header.b - eps);
      expect(m.card.b).toBeLessThanOrEqual(m.vh + eps);
      expect(m.btns.length).toBeGreaterThanOrEqual(1);
      for (const b of m.btns) expect(b.b).toBeLessThanOrEqual(m.vh + eps);
      expect(m.overflow).toBeLessThanOrEqual(0);
      expect(m.artLoaded).toBe(true);
      expect(m.artSrc).toBe(`/img/players/${who.toLowerCase()}.png`);
      expect(m.clipped).toEqual([]);
      expect(m.scrollables).toBe(0);
      // Readable: the card is wide enough that its smallest text stays legible.
      expect(m.cardW).toBeGreaterThanOrEqual(300);
      // Buttons: inside their row and the viewport, none overlapping, none clipping its own label.
      for (const b of m.btns) {
        expect(b.clipped, b.text ?? '').toBe(false);
        expect(b.l).toBeGreaterThanOrEqual(m.actions.l - eps);
        expect(b.r).toBeLessThanOrEqual(m.actions.r + eps);
        expect(b.r).toBeLessThanOrEqual(m.vw + eps);
      }
      for (let i = 1; i < m.btns.length; i++) expect(m.btns[i].l).toBeGreaterThanOrEqual(m.btns[i - 1].r - eps);
      // Inside the card, top to bottom: stars and number, the full-body art standing on the plate, name, title, stats, fun fact and meta.
      const inside = (b: { l: number; t: number; r: number; b: number }) => {
        expect(b.l).toBeGreaterThanOrEqual(m.card.l - eps); expect(b.r).toBeLessThanOrEqual(m.card.r + eps);
        expect(b.t).toBeGreaterThanOrEqual(m.card.t - eps); expect(b.b).toBeLessThanOrEqual(m.card.b + eps);
      };
      [m.art, m.plate, m.stamp, m.stars, m.no, m.name, m.title, m.panel, m.fact, m.meta].forEach(inside);
      expect(m.stars.l).toBeGreaterThanOrEqual(m.no.r - eps);
      // The art is the hero: over half the card tall, feet over the plate's top edge, the name below the feet.
      expect(m.art.b - m.art.t).toBeGreaterThan((m.card.b - m.card.t) * 0.5);
      expect(m.art.b).toBeGreaterThan(m.plate.t);
      expect(m.name.t).toBeGreaterThanOrEqual(m.art.b - eps);
      expect(m.name.b).toBeLessThanOrEqual(m.title.t + eps + 2);
      expect(m.title.b).toBeLessThanOrEqual(m.panel.t + eps);
      // One compact row per stat: label, then bar, then number, left to right, rows stacked without overlap.
      m.stats.forEach((s, i) => {
        expect(s.label.r).toBeLessThanOrEqual(s.bar.l + eps);
        expect(s.bar.r).toBeLessThanOrEqual(s.val.l + eps);
        expect(s.val.r).toBeLessThanOrEqual(m.panel.r + eps);
        expect(s.bar.t).toBeGreaterThanOrEqual(s.label.t - eps); expect(s.bar.b).toBeLessThanOrEqual(s.label.b + eps);
        expect(s.val.t).toBeGreaterThanOrEqual(m.panel.t - eps); expect(s.val.b).toBeLessThanOrEqual(m.panel.b + eps);
        if (i > 0) expect(s.label.t).toBeGreaterThanOrEqual(m.stats[i - 1].label.b - eps);
      });
      // The fun fact is the exact line, sits wholly inside its box beside the tag, in at most two lines.
      expect(m.factWords).toBe(FACTS[who]);
      expect(m.fact.t).toBeGreaterThanOrEqual(m.panel.b - eps);
      expect(m.factTag.r).toBeLessThanOrEqual(m.factText.l + eps);
      expect(m.factText.r).toBeLessThanOrEqual(m.fact.r + eps);
      expect(m.factText.t).toBeGreaterThanOrEqual(m.fact.t - eps);
      expect(m.factText.b).toBeLessThanOrEqual(m.fact.b + eps);
      expect(m.factLines).toBeLessThanOrEqual(2);
      expect(m.meta.t).toBeGreaterThanOrEqual(m.fact.b - eps);
    });

    test(`${who} character view: the art, name and title fit at ${size.width}x${size.height}`, async ({ page }) => {
      await open(page, who, size, 'character');
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const r = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const one = (s: string) => r(document.querySelector(s)!);
        return {
          vw: innerWidth, vh: innerHeight, app: one('.app'), header: one('header.top'), stage: one('.pf-stage'), art: one('.pf-stage svg'),
          name: one('.pf-char-name'), title: one('.pf-char-title'), top: one('.pf-top'),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          pageOverflow: document.documentElement.scrollHeight - innerHeight,
          articles: document.querySelectorAll('.pf-card').length, actions: document.querySelectorAll('.pf-actions').length,
          img: (document.querySelector('.pf-stage svg image') as SVGImageElement | null)?.getAttribute('href'),
        };
      });
      expect(m.articles).toBe(0);
      expect(m.actions).toBe(0);
      expect(m.img).toBe(`/img/players/${who.toLowerCase()}.png`);
      expect(m.overflow).toBeLessThanOrEqual(0);
      for (const b of [m.stage, m.art, m.name, m.title]) {
        expect(b.l).toBeGreaterThanOrEqual(Math.max(0, m.app.l) - eps);
        expect(b.r).toBeLessThanOrEqual(Math.min(m.vw, m.app.r) + eps);
        expect(b.b).toBeLessThanOrEqual(m.vh + eps);
      }
      expect(m.stage.t).toBeGreaterThanOrEqual(m.top.b - eps);
      expect(m.name.t).toBeGreaterThanOrEqual(m.stage.b - eps);
      expect(m.title.t).toBeGreaterThanOrEqual(m.name.b - eps);
      // As big as fits: the figure uses most of the height left under the header.
      expect(m.art.h).toBeGreaterThan((m.vh - m.header.b) * 0.5);
      expect(m.pageOverflow).toBeLessThanOrEqual(0);
    });
  }
}

test('the character stands still, jumps once per tap, and never jumps with reduced motion', async ({ page, browser }) => {
  const jumps = (p: Page) => p.evaluate(() => document.getAnimations().filter(a => (a as CSSAnimation).animationName === 'pf-jump').length);
  const looping = (p: Page) => p.evaluate(() => document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity).length);
  await open(page, 'Alex', SIZES[1], 'character', '?quips=1');
  await page.waitForTimeout(1200);
  expect(await jumps(page)).toBe(0);
  expect(await looping(page)).toBe(0);
  await page.getByRole('button', { name: 'Make Alex jump' }).click();
  expect(await jumps(page)).toBe(1);
  await page.waitForTimeout(900);
  expect(await jumps(page)).toBe(0);
  await page.getByRole('button', { name: 'Make Alex jump' }).click();
  expect(await jumps(page)).toBe(1);
  await page.waitForTimeout(900);
  expect(await jumps(page)).toBe(0);
  expect(await looping(page)).toBe(0);
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: SIZES[1] });
  const p2 = await ctx.newPage();
  await open(p2, 'Alex', SIZES[1], 'character', '?quips=1');
  await p2.getByRole('button', { name: 'Make Alex jump' }).click();
  expect(await jumps(p2)).toBe(0);
  await ctx.close();
});

test('the card tilts toward the pointer, settles back, and the foil sweeps once; reduced motion does neither', async ({ page, browser }) => {
  await open(page, 'Alex', SIZES[1], 'card', '?quips=1');
  const tf = () => page.evaluate(() => getComputedStyle(document.querySelector('.pf-c-in')!).transform);
  await page.waitForTimeout(700);
  const rest = await tf();
  // Nothing on the card loops: the foil sweeps once and then waits for the pointer.
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity).length)).toBe(0);
  const box = (await page.locator('.pf-card').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
  await page.waitForTimeout(400);
  expect(await tf()).not.toBe(rest);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  expect(await tf()).toBe(rest);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.pf-c-foil')!).animationName)).toContain('pf-foil');
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: SIZES[1] });
  const p2 = await ctx.newPage();
  await open(p2, 'Alex', SIZES[1], 'card', '?quips=1');
  const b2 = (await p2.locator('.pf-card').boundingBox())!;
  await p2.mouse.move(b2.x + b2.width * 0.9, b2.y + b2.height * 0.1);
  await p2.waitForTimeout(400);
  expect(await p2.evaluate(() => getComputedStyle(document.querySelector('.pf-c-in')!).transform)).toBe(rest);
  expect(await p2.evaluate(() => getComputedStyle(document.querySelector('.pf-c-foil')!).animationName)).not.toContain('pf-foil');
  await ctx.close();
});

test('the switch changes view, remembers it across a reload, and Back and the Menu still work', async ({ page }) => {
  await open(page, 'Lazza', SIZES[1]);
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Lazza, view your profile' }).click();
  await expect(page.getByRole('region', { name: 'Lazza, full size' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.pf-screen')).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('group', { name: 'Menu' }).getByRole('button').first()).toHaveText('My profile');
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByRole('region', { name: 'Lazza, full size' })).toBeVisible();
});

test('screenshots: both views at 390x844 and the exported PNG', async ({ page }) => {
  fs.mkdirSync('docs/review', { recursive: true });
  await open(page, 'Brittany', SIZES[1], 'card');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/review/profile-card-view.png' });
  await page.screenshot({ path: 'docs/review/profile-390.png' });
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe('the-homecoming-brittany.png');
  await d.saveAs('docs/review/profile-card.png');
  const png = fs.readFileSync('docs/review/profile-card.png');
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([800, 1056]);
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/review/profile-character-view.png' });
});
