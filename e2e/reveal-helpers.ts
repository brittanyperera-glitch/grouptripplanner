import type { Page } from '@playwright/test';

// Measurements shared by the reveal specs: day card, tuk-tuk, stop names, bubble, map and button, in CSS px.
export type R = { left: number; right: number; top: number; bottom: number; width: number; height: number };
export const hits = (a: R, b: R) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
export const inside = (a: R, b: R, slack = 1) => a.left >= b.left - slack && a.right <= b.right + slack && a.top >= b.top - slack && a.bottom <= b.bottom + slack;

export async function measureStop(page: Page) {
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
