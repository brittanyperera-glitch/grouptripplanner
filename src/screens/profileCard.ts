import { IMAGE_CM, LOOKS } from '../components/Avatar';
import type { Player } from '../types';
import profile from '../content/profile.json';

export interface CardStat { label: string; value: number }
export type Tier = 'lo' | 'mid' | 'hi';
export interface CardData {
  name: Player; no: number; total: number; title: string; stats: CardStat[]; heightCm: number; kit: string[];
  /** Rarity: always 5 stars, the top label. */
  stars: number; rarity: string;
  /** Brittany's one-line fun fact for the player, from profile.json. */
  fact: string | null;
}

export const CARD_W = 800;
export const CARD_H = 1056;

const GEAR = ['glasses', 'earrings', 'bangle', 'watch', 'ring'] as const;
export const kitFor = (name: Player): string[] => {
  const look = LOOKS[name];
  return GEAR.filter(g => look?.[g]).map(g => profile.gear[g]);
};

/** A card colour per player (dark ray, light ray), picked from the Postcard palette; a design choice, not data. */
export const PALETTE: Record<Player, [string, string]> = {
  Brittany: ['#a8301b', '#c9432a'],
  Alex: ['#17524f', '#1f6f6b'],
  Antek: ['#8a5a0c', '#a56a10'],
  Lazza: ['#6b2f55', '#853c69'],
  Saulie: ['#2d3f7a', '#3b4f94'],
  Tuktuk: ['#2f6b3a', '#43895a'],
  Aunty: ['#a02a5c', '#c24478'],
  Groom: ['#7a1c28', '#9c2c3a'],
};
const FALLBACK: [string, string] = PALETTE.Brittany;

// Tier colours for the stat rows: 8 and up red, 4 up to 8 gold, under 4 teal.
export const tierOf = (v: number): Tier => (v >= 8 ? 'hi' : v >= 4 ? 'mid' : 'lo');
export const TIER = { hi: { fill: '#bf3a22', ink: '#ffffff' }, mid: { fill: '#f2b632', ink: '#1e2a26' }, lo: { fill: '#1f6f6b', ink: '#ffffff' } };

/** Every card is 5 stars, the top rarity (Brittany 2026-10-16: "All the cards should be 5/5"). */
export function rarityOf(_stats: CardStat[]) {
  const stars = 5;
  return { stars, rarity: profile.rarity[stars - 1] };
}

/** Everything the card shows, from the character select data. Stats with no label or a non-number are dropped, as on the select screen. */
export function cardData(name: Player, no: number, total: number, card?: { title?: string; stats?: CardStat[] }): CardData {
  const stats = (card?.stats ?? []).filter(s => s.label && Number.isFinite(s.value)).map(s => ({ label: s.label, value: Math.max(0, s.value) }));
  return { name, no, total, title: card?.title ?? '', stats, heightCm: IMAGE_CM[name], kit: kitFor(name), ...rarityOf(stats), fact: (profile.facts as Record<string, string>)[name] ?? null };
}

export const cardNo = (d: Pick<CardData, 'no' | 'total'>) =>
  profile.cardNo.replace('{n}', String(d.no).padStart(2, '0')).replace('{total}', String(d.total).padStart(2, '0'));
export const kitText = (d: Pick<CardData, 'kit'>) => (d.kit.length ? d.kit.join(', ') : profile.noKit);

// The Postcard tokens from src/styles.css, repeated: a canvas cannot read the stylesheet's variables.
const C = { ink: '#1e2a26', gold: '#f2b632', cream: '#fffaf0', track: '#e9e1d1', white: '#ffffff', stamp: '#bf3a22' };
const HEAD = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = 'Manrope, system-ui, sans-serif';

/** Loads an image; null on failure so the card can fall back instead of failing the whole export. */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadFonts() {
  const fonts = document.fonts;
  if (!fonts) return;
  await Promise.all([fonts.load(`800 40px ${HEAD}`), fonts.load(`800 24px ${BODY}`), fonts.load(`700 24px ${BODY}`)]).catch(() => undefined);
  await fonts.ready;
}

type Ctx = CanvasRenderingContext2D;
const deg = (d: number) => (d * Math.PI) / 180;

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Greedy word wrap at the context's current font. */
function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) { lines.push(line); line = w; } else line = next;
  }
  return line ? [...lines, line] : lines;
}

/** Draws text at the largest size from `size` down to `min` that fits `maxW`. */
function fitText(ctx: Ctx, text: string, x: number, y: number, maxW: number, weight: number, size: number, min: number, family: string) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
  ctx.fillText(text, x, y, maxW);
}

/** Alternating 6 degree wedges from (cx, cy), the same as the CSS repeating-conic-gradient behind the card. */
function rays(ctx: Ctx, cx: number, cy: number, a: string, b: string) {
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = i % 2 ? b : a;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 1800, deg(i * 6 - 90), deg(i * 6 - 84));
    ctx.closePath(); ctx.fill();
  }
}

// The picture window, the room above it for the head to break the frame, and the foil: shared with the CSS in Profile.css.
const WIN = { x: 48, y: 170, w: 704, h: 390, border: 8, pop: 80 };

/** Draws the whole card onto a CARD_W x CARD_H context. `selfie` and `art` may be null; the picture then falls back to the character art, then an initial. */
export function drawCard(ctx: Ctx, d: CardData, selfie: HTMLImageElement | null, art: HTMLImageElement | null) {
  const pal = PALETTE[d.name] ?? FALLBACK;
  ctx.textBaseline = 'alphabetic';

  // Gold foil frame, then the player's colour with sunrays.
  const gold = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  [[0, '#f8dc86'], [.35, '#c98a10'], [.6, '#f8dc86'], [1, '#a86d0a']].forEach(([o, c]) => gold.addColorStop(o as number, c as string));
  rrect(ctx, 0, 0, CARD_W, CARD_H, 56); ctx.fillStyle = gold; ctx.fill();
  ctx.save();
  rrect(ctx, 16, 16, CARD_W - 32, CARD_H - 32, 42); ctx.clip();
  ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, CARD_W, CARD_H);
  rays(ctx, CARD_W / 2, 16 + 0.33 * (CARD_H - 32), pal[0], pal[1]);
  ctx.restore();

  // Top row: card number and rarity stars.
  ctx.fillStyle = C.white; ctx.textAlign = 'left'; ctx.font = `800 24px ${BODY}`;
  ctx.fillText(cardNo(d).toUpperCase(), 52, 72);
  ctx.textAlign = 'right'; ctx.font = `400 36px ${BODY}`;
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i < d.stars ? C.gold : 'rgba(255,255,255,.3)'; ctx.fillText('★', CARD_W - 52 - (4 - i) * 40, 76); }

  // Picture window: lighter rays and a spotlight, a cream border.
  const { x: wx, y: wy, w: ww, h: wh, border: bd, pop } = WIN;
  ctx.save();
  rrect(ctx, wx, wy, ww, wh, 24); ctx.clip();
  ctx.fillStyle = pal[1]; ctx.fillRect(wx, wy, ww, wh);
  rays(ctx, CARD_W / 2, wy + 0.7 * wh, 'rgba(255,255,255,.28)', 'rgba(255,255,255,.1)');
  const spot = ctx.createRadialGradient(CARD_W / 2, wy + 0.7 * wh, 0, CARD_W / 2, wy + 0.7 * wh, wh * 0.62);
  spot.addColorStop(0, 'rgba(255,255,255,.5)'); spot.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spot; ctx.fillRect(wx, wy, ww, wh);
  ctx.restore();
  rrect(ctx, wx + bd / 2, wy + bd / 2, ww - bd, wh - bd, 20); ctx.lineWidth = bd; ctx.strokeStyle = C.cream; ctx.stroke();

  // The picture stands in the window and breaks the top border: clipped at the sides and bottom, open above.
  const ix = wx + bd, iw = ww - 2 * bd, top = wy + bd - pop, bottom = wy + wh - bd, r = 16;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ix, top); ctx.lineTo(ix + iw, top); ctx.lineTo(ix + iw, bottom - r);
  ctx.arcTo(ix + iw, bottom, ix + iw - r, bottom, r); ctx.lineTo(ix + r, bottom); ctx.arcTo(ix, bottom, ix, bottom - r, r);
  ctx.closePath(); ctx.clip();
  const pic = selfie ?? art;
  if (pic) {
    const h = bottom - top, w = (pic.width * h) / pic.height;
    ctx.drawImage(pic, CARD_W / 2 - w / 2, top, w, h);
  } else {
    ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.font = `800 240px ${HEAD}`;
    ctx.fillText(d.name.charAt(0), CARD_W / 2, bottom - 40);
  }
  ctx.restore();

  // Rarity stamp, angled on the window's top right corner.
  ctx.save();
  ctx.translate(160, 204); ctx.rotate(deg(-9));
  rrect(ctx, -112, -32, 224, 64, 8); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = C.stamp; ctx.stroke();
  ctx.fillStyle = C.stamp; ctx.textAlign = 'center';
  fitText(ctx, d.rarity.toUpperCase(), 0, 14, 192, 800, 40, 24, HEAD);
  ctx.restore();

  // Name ribbon over the bottom of the picture, then the title.
  rrect(ctx, 30, 510, 740, 90, 12); ctx.fillStyle = C.ink; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = C.gold; ctx.stroke();
  ctx.fillStyle = C.white; ctx.textAlign = 'center';
  fitText(ctx, d.name.toUpperCase(), CARD_W / 2, 580, 680, 800, 80, 48, HEAD);
  if (d.title) { ctx.fillStyle = C.white; fitText(ctx, d.title.toUpperCase(), CARD_W / 2, 650, 704, 800, 44, 26, HEAD); }

  // Stats: a number badge and a segmented bar in the tier colour.
  const n = Math.max(d.stats.length, 1);
  const rh = Math.min(74, 222 / n);
  const py = 664;
  rrect(ctx, 40, py, 720, n * rh + 20, 28); ctx.fillStyle = C.cream; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke();
  d.stats.forEach((s, i) => {
    const y = py + 10 + i * rh, t = TIER[tierOf(s.value)];
    const bx = 58, bw = 86, bh = rh - 16;
    rrect(ctx, bx, y + 8, bw, bh, 14); ctx.fillStyle = t.fill; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = s.value > 10 ? C.gold : C.ink; ctx.stroke();
    ctx.fillStyle = t.ink; ctx.textAlign = 'center';
    fitText(ctx, String(s.value), bx + bw / 2, y + 8 + bh / 2 + 17, bw - 14, 800, 48, 26, HEAD);
    const lx = bx + bw + 20, lw = 742 - lx;
    ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    fitText(ctx, s.label.toUpperCase(), lx, y + 33, lw, 800, 27, 15, BODY);
    const by = y + 40;
    rrect(ctx, lx, by, lw, 26, 8); ctx.fillStyle = C.track; ctx.fill();
    ctx.save(); rrect(ctx, lx, by, lw, 26, 8); ctx.clip();
    ctx.fillStyle = t.fill; ctx.fillRect(lx, by, (lw * Math.min(10, s.value)) / 10, 26);
    ctx.fillStyle = C.cream;
    for (let k = 1; k < 10; k++) ctx.fillRect(lx + (lw * k) / 10 - 2, by, 4, 26);
    ctx.restore();
    rrect(ctx, lx, by, lw, 26, 8); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
  });

  // Fun fact: a tag and up to two lines, shrunk until it fits so it is never clipped.
  const fy = 916;
  rrect(ctx, 40, fy, 720, 80, 16); ctx.fillStyle = C.ink; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = C.gold; ctx.stroke();
  if (d.fact) {
    rrect(ctx, 62, fy + 18, 120, 44, 10); ctx.fillStyle = C.gold; ctx.fill();
    ctx.fillStyle = C.ink; ctx.textAlign = 'center';
    fitText(ctx, profile.funFact.toUpperCase(), 122, fy + 48, 104, 800, 20, 12, BODY);
    let size = 28, lines = [d.fact];
    for (; size >= 16; size -= 2) {
      ctx.font = `800 ${size}px ${HEAD}`;
      lines = wrap(ctx, d.fact, 540);
      if (lines.length <= 2) break;
    }
    ctx.fillStyle = C.white; ctx.textAlign = 'left';
    const lh = size * 1.05, first = fy + 40 - ((lines.length - 1) * lh) / 2 + size * 0.35;
    lines.forEach((l, i) => ctx.fillText(l, 198, first + i * lh));
  }

  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.textAlign = 'center';
  fitText(ctx, `${profile.height} ${d.heightCm} cm  |  ${profile.kit} ${kitText(d)}`.toUpperCase(), CARD_W / 2, 1026, 720, 700, 22, 12, BODY);

  // Foil: a static rainbow sheen across the face (it sweeps on screen).
  ctx.save();
  rrect(ctx, 16, 16, CARD_W - 32, CARD_H - 32, 42); ctx.clip();
  const foil = ctx.createLinearGradient(0, CARD_H * 0.15, CARD_W, CARD_H * 0.85);
  [[0.25, 'rgba(255,255,255,0)'], [0.36, 'rgba(255,80,160,.14)'], [0.45, 'rgba(255,220,80,.17)'], [0.54, 'rgba(80,255,200,.14)'], [0.64, 'rgba(100,140,255,.13)'], [0.75, 'rgba(255,255,255,0)']]
    .forEach(([o, c]) => foil.addColorStop(o as number, c as string));
  ctx.fillStyle = foil; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();
}

export const selfieSrc = (n: Player) => `/img/players/${n.toLowerCase()}-selfie.png`;
export const artSrc = (n: Player) => `/img/players/${n.toLowerCase()}.png`;

/** Renders the card to a PNG, after the fonts and both pictures have loaded so none is missing from the file. */
export async function renderCardBlob(d: CardData): Promise<Blob> {
  const [, selfie, art] = await Promise.all([loadFonts(), loadImage(selfieSrc(d.name)), loadImage(artSrc(d.name))]);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  drawCard(ctx, d, selfie, art);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('empty png'))), 'image/png'));
}
