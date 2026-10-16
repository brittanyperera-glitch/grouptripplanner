import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const SIZES = [{ width: 360, height: 740 }, { width: 390, height: 844 }];
const FLOOR = 11;

async function openCard(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:howto-seen', '1');
    localStorage.setItem('tp:profile-view', 'card');
    localStorage.setItem('tp:resp:Brittany', JSON.stringify({ name: 'Brittany', days: 9, flex: false, pace: 1, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z' }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Brittany, view your profile' }).click();
  await expect(page.getByRole('article', { name: 'Brittany trip card' })).toBeVisible();
  await page.waitForTimeout(700);
}

for (const size of SIZES) {
  test(`card text never renders under ${FLOOR}px at ${size.width}`, async ({ page }) => {
    await openCard(page, size);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const w = document.createTreeWalker(document.querySelector('.pf-card')!, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const el = n.parentElement!;
        if (!n.textContent!.trim() || el.closest('[aria-hidden="true"]') || el.closest('svg')) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 11) out.push(`${el.className || el.tagName}:"${n.textContent!.trim().slice(0, 24)}" ${px.toFixed(1)}px`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });

  test(`voting-card titles do not split a word mid-word at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    // Fixture in the real card markup (Knockouts.tsx) so the app stylesheet decides the wrapping.
    const res = await page.evaluate(() => {
      const host = document.querySelector('.app') ?? document.body;
      const wrap = document.createElement('div');
      wrap.className = 'vs2 face';
      const side = (t: string) => `<div class="pick tall list"><span class="pick-copy"><span class="tag">Add</span><b>${t}</b></span></div>`;
      wrap.innerHTML = side('UNAWATUNA') + side('PIDURANGALA') + side('SCUBA DIVING, SOUTH COAST');
      host.prepend(wrap);
      return [...wrap.querySelectorAll('b')].map(b => {
        const text = b.firstChild!;
        const words = b.textContent!.split(/\s+/);
        const bad: string[] = [];
        let off = 0;
        for (const word of words) {
          const i = b.textContent!.indexOf(word, off); off = i + word.length;
          const r = document.createRange(); r.setStart(text, i); r.setEnd(text, i + word.length);
          const lines = new Set([...r.getClientRects()].map(q => Math.round(q.top)));
          // A word on more than one line is only acceptable when the browser hyphenated it.
          const hyph = getComputedStyle(b).hyphens === 'auto' && lines.size > 1;
          if (lines.size > 1 && !(hyph && getComputedStyle(b).overflowWrap !== 'anywhere')) bad.push(word);
        }
        return { text: b.textContent, bad, rects: Math.round(b.getBoundingClientRect().height) };
      });
    });
    for (const r of res) expect(r.bad, r.text ?? '').toEqual([]);
  });
}
