import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

// All five have submitted and saved the same Finalize list, so the plan is locked with no head to heads.
// ?quips=1 turns motion back on under webdriver, so the full reveal plays.
const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const PEOPLE = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
// South: the usual loop. North: reaches Jaffna at the top edge and Nuwara Eliya, whose name sits above its dot.
const ROUTES: Record<string, { musts: string[]; days: number }> = {
  south: { musts: ['sigiriya', 'tooth', 'ninearch', 'galle'], days: 9 },
  north: { musts: ['jaffna', 'nainativu', 'sigiriya', 'tea', 'horton', 'ellarock'], days: 14 },
};
const rowsFor = (route: string) => {
  const { musts, days } = ROUTES[route];
  const ranking = { must: musts.map(m => [m]), keen: [], meh: [ids.filter(i => !musts.includes(i))], skip: [] };
  return PEOPLE.map(name => ({ name, days, flex: false, pace: 1, ranking, final: ranking, rated: ids, submitted: true, updatedAt: '2026-10-15T00:00:00Z' }));
};
const SHOTS = process.env.REVEAL_SHOTS;

async function openReveal(page: Page, w: number, h: number, quips: boolean, route = 'south') {
  const rows = rowsFor(route);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(quips ? '/?quips=1' : '/');
  // The north route asks North or South first; everyone votes North so the plan can lock.
  const votes = route === 'north' ? PEOPLE.map(name => ({ forkId: 'region:north', name, choice: 'a' })) : [];
  await page.evaluate(([rs, vs]) => {
    localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); localStorage.setItem('tp:votes', JSON.stringify(vs));
    for (const r of rs as { name: string }[]) localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
  }, [rows, votes] as const);
  await page.reload();
  await page.getByRole('tab', { name: 'Group' }).click();
  await page.getByRole('button', { name: 'Play route reveal' }).click();
  return page.getByRole('dialog', { name: 'Route reveal' });
}

type R = { left: number; right: number; top: number; bottom: number; width: number; height: number };
const hits = (a: R, b: R) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const inside = (a: R, b: R, slack = 1) => a.left >= b.left - slack && a.right <= b.right + slack && a.top >= b.top - slack && a.bottom <= b.bottom + slack;

async function measureStop(page: Page) {
  return page.evaluate(() => {
    const r = (el: Element | null) => { const b = el!.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
    const card = document.querySelector('[aria-label="Day card"] .rv-card');
    return {
      vw: document.documentElement.clientWidth, vh: window.innerHeight,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      card: r(card), tuk: r(document.querySelector('.rv-tuk')), label: r(document.querySelector('.rv-stop.on .rv-label')),
      bubble: r(document.querySelector('.rv-bubble')), paper: r(document.querySelector('.rv-paper')),
      btn: r(document.querySelector('.rv-actions .rv-btn')),
      labels: [...document.querySelectorAll('.rv-label')].map(r),
      cardClipped: card ? (card as HTMLElement).scrollWidth > (card as HTMLElement).clientWidth + 1 : true,
      place: card?.querySelector('h2')?.textContent ?? '',
    };
  });
}

for (const [w, h, route] of [[390, 844, 'south'], [390, 667, 'south'], [1280, 800, 'south'], [390, 667, 'north'], [1280, 800, 'north']] as const) {
  test(`plays the ${route} reveal stop to stop to Mission Complete at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(120_000);
    const big = w === 390 && h === 844;
    const dlg = await openReveal(page, w, h, true, route);
    await expect(dlg).toHaveAttribute('data-stage', 'intro');
    await expect(dlg.getByText('THE PLAN IS IN.')).toBeVisible();
    // The dark intro is never blank: HUD and title are fully in within the first second.
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => ['.rv-title', '.rv-hud-line', '.rv-hud-line.gold'].map(q => getComputedStyle(document.querySelector(q)!).opacity))).toEqual(['1', '1', '1']);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.rv-hud-line.gold')!).clipPath)).toMatch(/^(none|inset\(0(px|%)?( 0(px|%)?){0,3}\))$/);
    if (big && SHOTS) await page.screenshot({ path: `${SHOTS}/1-intro.png` });

    await expect(dlg).toHaveAttribute('data-stage', 'drive', { timeout: 6000 });
    if (big && SHOTS) { await page.waitForTimeout(450); await page.screenshot({ path: `${SHOTS}/2-drive.png` }); }

    const places: string[] = [];
    for (let guard = 0; guard < 12; guard++) {
      await expect(dlg).toHaveAttribute('data-stage', /stop|complete/, { timeout: 6000 });
      if ((await dlg.getAttribute('data-stage')) === 'complete') break;
      const next = dlg.getByRole('button', { name: 'Next stop' });
      if (!(await next.isVisible())) { await expect(dlg).toHaveAttribute('data-stage', 'complete', { timeout: 6000 }); break; }
      await page.waitForTimeout(650); // card slam and bubble pop settle
      if (big && SHOTS && places.length === 0) await page.screenshot({ path: `${SHOTS}/3-bubble.png` });
      if (big && SHOTS && places.length === 1) await page.screenshot({ path: `${SHOTS}/4-daycard.png` });
      const m = await measureStop(page);
      places.push(m.place);
      expect(m.overflowX, 'no horizontal scroll').toBeLessThanOrEqual(0);
      expect(hits(m.card, m.tuk), `card covers the tuk-tuk at ${m.place}`).toBe(false);
      expect(hits(m.card, m.label), `card covers the ${m.place} label`).toBe(false);
      expect(hits(m.card, m.bubble), `card covers the bubble at ${m.place}`).toBe(false);
      expect(m.labels.filter(l => hits(l, m.bubble)), `bubble covers a stop name at ${m.place}: ${JSON.stringify(m.bubble)}`).toEqual([]);
      expect(m.cardClipped, `card text clipped at ${m.place}`).toBe(false);
      expect(inside(m.bubble, m.paper, 4), `bubble inside the map at ${m.place}`).toBe(true);
      expect(inside(m.tuk, m.paper, 4), `tuk-tuk inside the map at ${m.place}`).toBe(true);
      for (const [k, b] of Object.entries({ card: m.card, btn: m.btn, paper: m.paper })) {
        expect(inside(b, { left: 0, top: 0, right: m.vw, bottom: m.vh, width: m.vw, height: m.vh }), `${k} inside the viewport at ${m.place}`).toBe(true);
      }
      await next.click();
    }
    expect(places.length).toBeGreaterThanOrEqual(3);
    expect(new Set(places).size).toBe(places.length);
    if (route === 'north') expect(places).toEqual(expect.arrayContaining(['Jaffna', 'Nuwara Eliya']));

    const done = dlg.getByRole('region', { name: 'Mission complete' });
    await expect(done.getByText('MISSION COMPLETE')).toBeVisible();
    await expect(done.getByRole('img', { name: / selfie$/ })).toHaveCount(5);
    // All five on screen once the stagger has played, not just in the DOM.
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.rv-crew figure')].map(f => getComputedStyle(f).opacity)), { timeout: 4000 })
      .toEqual(['1', '1', '1', '1', '1']);
    if (big && SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/5-mission-complete.png` }); }
    const crew = await page.evaluate(() => [...document.querySelectorAll('.rv-crew figure')].map(f => f.getBoundingClientRect().right));
    expect(Math.max(...crew)).toBeLessThanOrEqual(w);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await dlg.getByRole('button', { name: 'See the poster' }).click();
    await expect(dlg.getByRole('button', { name: 'Save poster' })).toBeVisible();
  });
}

test('Skip jumps straight to Mission Complete', async ({ page }) => {
  const dlg = await openReveal(page, 390, 844, true);
  await dlg.getByRole('button', { name: 'Skip' }).click();
  await expect(dlg).toHaveAttribute('data-stage', 'complete');
  await expect(dlg.getByRole('region', { name: 'Mission complete' })).toBeVisible();
});

test('with motion off the whole reveal shows at once, day cards then Mission Complete', async ({ page }) => {
  const dlg = await openReveal(page, 390, 667, false);
  await expect(dlg).toHaveAttribute('data-stage', 'complete');
  const cards = dlg.getByRole('list', { name: 'Day cards' }).locator(':scope > li');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  await expect(dlg.getByRole('region', { name: 'Mission complete' })).toBeVisible();
  await expect(dlg.locator('[data-tuktuk][data-driving="true"]')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/6-motion-off.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
