import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const cat = JSON.parse(fs.readFileSync('src/data/catalogue.json', 'utf8')) as { items: { id: string }[] };
const ids = cat.items.map(i => i.id);
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

function friend(name: string, must: string[]) {
  const rest = ids.filter(i => !must.includes(i));
  const meh = rest.reduce<string[][]>((l, x, i) => (i % 3 ? l[l.length - 1].push(x) : l.push([x]), l), []);
  return { name, days: 9, flex: false, pace: 1, ranking: { must: must.map(m => [m]), keen: [], meh, skip: [] }, rated: ids, submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
}
const NORTH = ['jaffna', 'delft', 'nainativu'];
const SOUTH = ['sigiriya', 'yala', 'galle'];
const FRIENDS = [friend('Brittany', NORTH), friend('Alex', NORTH), friend('Antek', SOUTH), friend('Lazza', SOUTH), friend('Saulie', SOUTH)];

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 1280, height: 800 }];

for (const vp of VIEWPORTS) {
  const tag = `${vp.width}x${vp.height}`;

  test(`lock-in name fits the screen ${tag}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.emulateMedia({ colorScheme: 'dark' });
    // ?quips=1 turns the motion mode back on under webdriver, which is what shows the lock-in.
    await page.goto('/?quips=1');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Choose your character' }).click();
    await page.getByRole('button', { name: 'Brittany', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Brittany', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'Select', exact: true }).dispatchEvent('click');
    const name = page.locator('.flash-name');
    await expect(name).toBeVisible();
    await page.waitForTimeout(700);
    // Measure against the visible app column, not the window: on desktop the overlay spans the window but the column clips it.
    const b = await name.evaluate(e => { const r = e.getBoundingClientRect(); const c = (e.closest('.app') ?? document.body).getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, colLeft: c.left, colRight: c.right }; });
    console.log(`lockin ${tag}`, JSON.stringify(b));
    await shot(page, `lockin-${tag}`);
    expect(b.left).toBeGreaterThanOrEqual(b.colLeft);
    expect(b.right).toBeLessThanOrEqual(b.colRight);
  });

  test(`picks rows do not squeeze or overlap ${tag}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(vp);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await page.evaluate((fr) => { localStorage.clear(); for (const f of fr) if (f.name !== 'Brittany') localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f)); }, FRIENDS);
    await page.reload();
    await page.getByRole('button', { name: 'Choose your character' }).click();
    await page.getByRole('button', { name: 'Brittany', exact: true }).click();
    await page.getByRole('button', { name: /^9 days/ }).click();
    await page.getByRole('button', { name: /^Balanced/ }).click();
    const submit = page.getByRole('button', { name: 'Done, submit' });
    for (let guard = 0; guard < 400 && !(await submit.isVisible()); guard++) {
      await page.getByRole('button', { name: guard % 3 === 0 ? 'Must' : 'Meh', exact: true }).click();
    }
    const region = page.getByRole('region', { name: 'Your picks' });
    await expect(region).toBeVisible();
    await shot(page, `picks-${tag}`);
    const rows = await region.locator('.item').evaluateAll(els => els.map(el => {
      const th = el.querySelector('.th')!.getBoundingClientRect();
      const nm = el.querySelector('.nm')!.getBoundingClientRect();
      const row = el.getBoundingClientRect();
      return { th: [th.left, th.right], nm: [nm.left, nm.right], w: nm.width, rowRight: row.right, label: el.querySelector('.nm')!.textContent };
    }));
    console.log(`picks ${tag}`, rows.length, 'rows; min name width', Math.min(...rows.map(r => r.w)));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.nm[0], r.label ?? '').toBeGreaterThanOrEqual(r.th[1]);
      expect(r.w, r.label ?? '').toBeGreaterThanOrEqual(120);
      expect(r.nm[1], r.label ?? '').toBeLessThanOrEqual(r.rowRight);
    }
  });

  test(`north/south lines sit inside their card ${tag}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await page.evaluate(fr => { localStorage.clear(); for (const f of fr) localStorage.setItem(`tp:resp:${f.name}`, JSON.stringify(f)); localStorage.setItem('tp:me', 'Brittany'); }, FRIENDS);
    await page.reload();
    await page.getByRole('tab', { name: 'Group' }).click();
    await page.getByRole('button', { name: /Group knockouts/ }).click();
    const ko = page.getByRole('group', { name: /North or South/i });
    await expect(ko).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, `northsouth-${tag}`);
    const res = await ko.evaluate(el => {
      const out: { text: string; l: number; r: number; t: number; b: number; cl: number; cr: number; ct: number; cb: number; vw: number; sw: number; cw: number; vsHit: boolean }[] = [];
      const vs = el.querySelector('.vs')?.getBoundingClientRect();
      el.querySelectorAll('.pick').forEach(card => {
        const c = card.getBoundingClientRect();
        card.querySelectorAll('b.line').forEach(line => {
          const r = line.getBoundingClientRect();
          out.push({ text: line.textContent ?? '', l: r.left, r: r.right, t: r.top, b: r.bottom, cl: c.left, cr: c.right, ct: c.top, cb: c.bottom, vw: window.innerWidth, sw: line.scrollWidth, cw: line.clientWidth,
            vsHit: !!vs && r.left < vs.right && r.right > vs.left && r.top < vs.bottom && r.bottom > vs.top });
        });
      });
      return out;
    });
    console.log(`northsouth ${tag}`, res.length, 'lines; worst left overhang', Math.max(...res.map(x => x.cl - x.l)), 'right', Math.max(...res.map(x => x.r - x.cr)), 'top', Math.max(...res.map(x => x.ct - x.t)));
    expect(res.length).toBeGreaterThan(0);
    for (const x of res) {
      expect(x.l, x.text).toBeGreaterThanOrEqual(x.cl - 0.5);
      expect(x.r, x.text).toBeLessThanOrEqual(x.cr + 0.5);
      expect(x.t, x.text).toBeGreaterThanOrEqual(x.ct - 0.5);
      expect(x.b, x.text).toBeLessThanOrEqual(x.cb + 0.5);
      expect(x.vsHit, `${x.text} sits under the VS badge`).toBe(false);
      expect(x.sw, x.text).toBeLessThanOrEqual(x.cw + 1);
      expect(x.l, x.text).toBeGreaterThanOrEqual(0);
      expect(x.r, x.text).toBeLessThanOrEqual(x.vw);
    }
  });
}
