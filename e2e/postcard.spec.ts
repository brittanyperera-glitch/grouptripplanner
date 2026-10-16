import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { seenWalkthroughToday } from './helpers';

// Postcard theme, wave 1: the opening's sub line reads over every cover photo, and the key movements run on the one motion scale.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const PEOPLE = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
const MUSTS = ['sigiriya', 'tooth', 'ninearch', 'galle'];
const ranking = { must: MUSTS.map(m => [m]), keen: [], meh: [ids.filter(i => !MUSTS.includes(i))], skip: [] };

/** Seconds or milliseconds as the browser prints them ("0.48s", "480ms") to ms. */
const toMs = (v: string) => (v.trim().endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000);
const scale = (page: Page) => page.evaluate(() => {
  const s = getComputedStyle(document.documentElement);
  return { fast: s.getPropertyValue('--dur-fast'), base: s.getPropertyValue('--dur'), slow: s.getPropertyValue('--dur-slow'), ease: s.getPropertyValue('--ease').trim() };
});

test('the opening sub line reaches 4.5:1 over every cover photo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await seenWalkthroughToday(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const sub = page.locator('.intro-sub');
  await expect(sub).toBeVisible();
  const ink = await sub.evaluate(el => getComputedStyle(el).color);
  const n = await page.locator('.slides img').count();
  expect(n).toBeGreaterThan(1);
  const worst: number[] = [];
  for (let i = 0; i < n; i++) {
    // Show cover i alone, settled, with the words hidden so the screenshot is the ground they sit on.
    await page.evaluate(k => {
      document.querySelectorAll<HTMLImageElement>('.slides img').forEach((im, j) => { im.style.transition = 'none'; im.style.opacity = j === k ? '1' : '0'; });
      const s = document.querySelector<HTMLElement>('.intro-sub')!;
      s.style.visibility = 'hidden';
    }, i);
    await page.locator('.slides img').nth(i).evaluate((im: HTMLImageElement) => im.decode());
    const box = (await sub.boundingBox())!;
    const png = await page.screenshot({ clip: box });
    worst.push(await page.evaluate(async ([b64, color]) => {
      const im = new Image();
      im.src = `data:image/png;base64,${b64}`;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const g = c.getContext('2d')!;
      g.drawImage(im, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      const [r, gg, b, a = 1] = color.match(/[\d.]+/g)!.map(Number);
      const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      const lum = (R: number, G: number, B: number) => 0.2126 * lin(R) + 0.7152 * lin(G) + 0.0722 * lin(B);
      const ratios: number[] = [];
      for (let k = 0; k < px.length; k += 4) {
        const bg = lum(px[k], px[k + 1], px[k + 2]);
        const fg = lum(a * r + (1 - a) * px[k], a * gg + (1 - a) * px[k + 1], a * b + (1 - a) * px[k + 2]);
        ratios.push((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05));
      }
      ratios.sort((x, y) => x - y);
      return ratios[Math.floor(ratios.length * 0.05)]; // 95% of the ground behind the words meets this
    }, [png.toString('base64'), ink] as const));
    await page.evaluate(() => { document.querySelector<HTMLElement>('.intro-sub')!.style.visibility = ''; });
  }
  expect(Math.min(...worst), `per cover: ${worst.map(w => w.toFixed(2)).join(', ')}`).toBeGreaterThanOrEqual(4.5);
});

for (const [w, h] of [[320, 640], [390, 844], [1280, 800]] as const) {
  test(`front page title, stamp and button fit without clipping at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await seenWalkthroughToday(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'The Homecoming.' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
      const t = document.querySelector<HTMLElement>('.intro-title')!;
      return { intro: r('.intro'), title: r('.intro-title'), sub: r('.intro-sub'), kicker: r('.intro-kicker'), pill: r('.intro-pill'), over: t.scrollWidth - t.clientWidth, font: getComputedStyle(t).fontFamily };
    });
    expect(m.font).toMatch(/Barlow Condensed/);
    expect(m.over).toBeLessThanOrEqual(0);
    for (const k of ['title', 'sub', 'kicker', 'pill'] as const) {
      expect(m[k].left, k).toBeGreaterThanOrEqual(m.intro.left);
      expect(m[k].right, k).toBeLessThanOrEqual(m.intro.right);
    }
    expect(m.sub.bottom).toBeLessThan(m.pill.top);
    expect(m.kicker.bottom).toBeLessThan(m.title.top);
  });
}

for (const [w, h] of [[390, 844], [1280, 800]] as const) {
  test(`Mission Complete itinerary: a loaded photo per day on a drawn red dashed route, at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    const rows = PEOPLE.map(name => ({ name, days: 9, flex: false, pace: 1, ranking, final: ranking, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z' }));
    await seenWalkthroughToday(page);
    await page.evaluate(rs => {
      localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:votes', JSON.stringify(['Antek', 'Lazza', 'Saulie'].map(name => ({ forkId: 'ko:scuba', name, choice: 'b' })))); localStorage.setItem('tp:reveal-mine', '1');
      for (const r of rs) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
    }, rows);
    await page.reload();
    await page.getByRole('tab', { name: 'My trip' }).click();
    await page.getByRole('button', { name: 'Group trip' }).click();
    await page.getByRole('button', { name: 'Play route reveal' }).click();
    const list = page.getByRole('list', { name: 'Itinerary' });
    await list.scrollIntoViewIfNeeded();
    const line = await list.evaluate(el => { const c = getComputedStyle(el, '::before'); return [c.borderLeftStyle, parseFloat(c.borderLeftWidth), c.borderLeftColor]; });
    expect(line).toEqual(['dashed', 2, 'rgb(214, 69, 44)']);
    const days = list.locator(':scope > li');
    const n = await days.count();
    expect(n).toBe(9);
    for (let i = 0; i < n; i++) {
      const day = days.nth(i);
      await day.scrollIntoViewIfNeeded();
      const place = await day.locator('.rv-itin-place').textContent();
      const img = day.locator('img');
      if (place === 'Fly home') { await expect(img).toHaveCount(0); continue; }
      await expect.poll(() => img.evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth), { message: `day ${i + 1} photo` }).toBeGreaterThan(100);
      const r = await day.evaluate(el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, vw: innerWidth }; });
      expect(r.l).toBeGreaterThanOrEqual(0);
      expect(r.r).toBeLessThanOrEqual(r.vw);
    }
  });
}

test('key movements run on the motion scale: character sheet, swipe card, Mission Complete title', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?quips=1');
  await seenWalkthroughToday(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const s = await scale(page);
  expect([toMs(s.fast), toMs(s.base), toMs(s.slow)]).toEqual([160, 280, 480]);

  await page.getByRole('button', { name: 'Choose your character' }).click();
  const sheet = await page.locator('.select').evaluate(el => getComputedStyle(el).animationDuration);
  expect(toMs(sheet)).toBe(toMs(s.slow));

  await seenWalkthroughToday(page);
  await page.evaluate(() => {
    localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:swipe-demo', '1');
    localStorage.setItem('tp:resp:Brittany', JSON.stringify({ name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z' }));
  });
  await page.reload();
  const card = page.locator('.deck .card:not(.ghost)');
  await expect(card).toBeVisible();
  const [move, enter] = await card.evaluate(el => [getComputedStyle(el).transitionDuration, getComputedStyle(el).animationDuration]);
  expect(toMs(move)).toBe(toMs(s.slow));
  expect(toMs(enter)).toBe(toMs(s.base));
  // Brittany 2026-10-15: the name in the top bar uses the card's place-name face, sized to fit the bar.
  const face = (sel: string) => page.locator(sel).first().evaluate(el => { const c = getComputedStyle(el); return [c.fontFamily, c.fontWeight, c.textTransform].join(' | '); });
  expect(await face('.top .who b')).toBe(await face('.deck .card:not(.ghost) .title'));
  expect(await face('.title')).toMatch(/^"?Barlow Condensed"?.* \| 800 \| uppercase$/);
  const bar = await page.locator('.top').evaluate(el => { const b = el.querySelector('.who b')!.getBoundingClientRect(), t = el.getBoundingClientRect(); return { top: b.top - t.top, bottom: t.bottom - b.bottom }; });
  expect(bar.top).toBeGreaterThanOrEqual(0);
  expect(bar.bottom).toBeGreaterThanOrEqual(0);

  const rows = PEOPLE.map(name => ({ name, days: 9, flex: false, pace: 1, ranking, final: ranking, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z' }));
  await seenWalkthroughToday(page);
  await page.evaluate(rs => {
    localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:votes', JSON.stringify(['Antek', 'Lazza', 'Saulie'].map(name => ({ forkId: 'ko:scuba', name, choice: 'b' })))); localStorage.setItem('tp:reveal-mine', '1');
    for (const r of rs) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
  }, rows);
  await page.reload();
  await page.getByRole('tab', { name: 'My trip' }).click();
  await page.getByRole('button', { name: 'Group trip' }).click();
  await page.getByRole('button', { name: 'Play route reveal' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  const title = page.getByRole('region', { name: 'Mission complete' }).locator('.rv-done-title');
  await expect(title).toBeVisible();
  const [dur, ease, name] = await title.evaluate(el => { const c = getComputedStyle(el); return [c.animationDuration, c.animationTimingFunction, c.animationName]; });
  expect(toMs(dur)).toBe(toMs(s.slow));
  expect(name).not.toMatch(/slam/);
  expect(ease.replace(/\s/g, '')).toBe(s.ease.replace(/\s/g, '').replace(/(^|[(,])\./g, '$10.'));
});
