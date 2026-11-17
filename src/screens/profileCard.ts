// The canvas twin of the DOM card in Profile.tsx/Profile.css: both read cardLayout, cardColours and textSize from here, so Save image draws the same card.
import { IMAGE_CM, LOOKS } from '../components/Avatar';
import type { Person, Player, Ranking } from '../types';
import profile from '../content/profile.json';

export interface CardStat { label: string; value: number }
export type CardFriend = { name: Person; pct: number } | null;
export interface CardFriends { twin: CardFriend; clash: CardFriend }
/** The labels the Group stats page (Friends.tsx) uses for the same two numbers; a test keeps them equal. */
export const FRIEND_LABELS = { twin: 'Travel twin', clash: 'Biggest clash' };
export type Tier = 'lo' | 'mid' | 'hi';
export interface CardData {
  name: Player; no: number; total: number; title: string; stats: CardStat[]; /** Real counts from the trip (Musts and how many are in the plan): chips under the bars, since the bars are a 0 to 10 joke scale. */ trip: CardStat[]; heightCm: number; kit: string[];
  /** Rarity: always 5 stars, the top label. */
  stars: number; rarity: string;
  /** Brittany's one-line fun fact for the player, from profile.json. */
  fact: string | null;
  /** The viewer's travel twin and biggest clash, once all five have submitted; null for guests and before that. */
  friends: CardFriends | null;
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

export const tierOf = (v: number): Tier => (v >= 8 ? 'hi' : v >= 4 ? 'mid' : 'lo');

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
/** Mixes hex colour `a` toward `b` by t (0 to 1). */
export const mix = (a: string, b: string, t: number) =>
  `#${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two hex colours. */
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** The player's colours beyond the rays: a deep plate, a light tint for the title, an opaque meta grey, and the bar fills by tier. */
export function cardColours(name: Player) {
  const [a, b] = PALETTE[name] ?? FALLBACK;
  const plate = mix(a, '#000000', 0.45);
  return {
    a, b, plate, tint: mix(b, '#ffffff', 0.62), meta: mix(plate, '#ffffff', 0.74),
    fill: { hi: mix(b, '#ffffff', 0.62), mid: mix(b, '#ffffff', 0.4), lo: mix(b, '#ffffff', 0.18) } as Record<Tier, string>,
  };
}

/** Every card is 5 stars, the top rarity (Brittany 2026-10-16: "All the cards should be 5/5"). */
export function rarityOf(_stats: CardStat[]) {
  const stars = 5;
  return { stars, rarity: profile.rarity[stars - 1] };
}

/** Everything the card shows, from the character select data. Stats with no label or a non-number are dropped, as on the select screen. */
export function cardData(name: Player, no: number, total: number, card?: { title?: string; stats?: CardStat[]; trip?: CardStat[] }, friends?: CardFriends | null): CardData {
  const stats = (card?.stats ?? []).filter(s => s.label && Number.isFinite(s.value)).map(s => ({ label: s.label, value: Math.max(0, s.value) }));
  const trip = (card?.trip ?? []).filter(s => s.label && Number.isFinite(s.value)).map(s => ({ label: s.label, value: Math.max(0, Math.round(s.value)) }));
  return { name, no, total, title: card?.title ?? '', stats, trip, heightCm: IMAGE_CM[name], kit: kitFor(name), ...rarityOf(stats), fact: (profile.facts as Record<string, string>)[name] ?? null,
    friends: friends && (friends.twin || friends.clash) ? friends : null };
}

export const cardNo = (d: Pick<CardData, 'no' | 'total'>) =>
  profile.cardNo.replace('{n}', String(d.no).padStart(2, '0')).replace('{total}', String(d.total).padStart(2, '0'));
export const kitText = (d: Pick<CardData, 'kit'>) => (d.kit.length ? d.kit.join(', ') : profile.noKit);
export const metaText = (d: Pick<CardData, 'heightCm' | 'kit'>) => [`${profile.height} ${d.heightCm} cm`, `${profile.kit} ${kitText(d)}`];

/** Real trip numbers for the card: the Musts someone rated and, when a plan is released, how many of them are in it. */
export function tripStats(ranking: Ranking, planned?: readonly string[]): CardStat[] {
  const musts = ranking.must.flat();
  const stats = [{ label: profile.tripMusts, value: musts.length }];
  if (planned) stats.push({ label: profile.tripInPlan, value: musts.filter(id => planned.includes(id)).length });
  return stats;
}

// Card geometry in canvas pixels (800 x 1056). The face is inset 16; the figure stands on the plate, feet over its gold top edge.
export const FACE = 16;
export const FIG_TOP = 84;
export const ROW_H = 36;
export const FEET_ON_PLATE = 34;
export const STAMP = { cx: 134, cy: 124, w: 176, h: 48, rot: -8, size: 30 };
export const STAT_X = { label: 56, labelW: 422, bar: 494, barW: 170, barH: 14, val: 744 };
export const FACT_X = { tag: 56, text: 190, textW: 554, size: 28 };
/** No text on the card is drawn under this many canvas pixels: 28 is 11 CSS px on the narrowest phone column (about 320 wide). */
export const MIN_TEXT = 28;
export const FRIEND = { half: 336, gap: 16, dot: 48 };
// Avatar.tsx's bust crop, repeated so the PNG frames the friend's head the same way: figure height 211 of a 214 baseline, 72 unit square.
const BUST = { figure: 211, base: 214, box: 72, left: 16, centre: 52, above: 6 };
export interface Box { y: number; h: number }
export interface CardLayout { figTop: number; figBottom: number; plateTop: number; rayY: number; name: Box; title: Box | null; stats: Box | null; trip: Box | null; friends: Box | null; fact: Box | null; meta: Box }

/** Stacks the plate from the bottom up, so a card with no fun fact or no stats gives the figure the room instead of leaving a gap. */
export function cardLayout(d: Pick<CardData, 'title' | 'stats' | 'fact'> & { friends?: CardFriends | null; trip?: CardStat[] }): CardLayout {
  let y = CARD_H - FACE - 10;
  const take = (h: number, gap = 0): Box => { y -= h; const b = { y, h }; y -= gap; return b; };
  const meta = take(30, 6);
  const fact = d.fact ? take(62, 6) : null;
  const friends = d.friends ? take(64, 8) : null;
  const trip = d.trip?.length ? take(ROW_H, 8) : null;
  const stats = d.stats.length ? take(d.stats.length * ROW_H, 8) : null;
  const title = d.title ? take(44) : null;
  const name = take(100);
  const figBottom = name.y;
  return { figTop: FIG_TOP, figBottom, plateTop: figBottom - FEET_ON_PLATE, rayY: FIG_TOP + 0.78 * (figBottom - FIG_TOP), name, title, stats, trip, friends, fact, meta };
}

/** Font size that keeps a line of condensed capitals inside the card width: `max` px, smaller for long text (about 0.47em a letter). */
export const textSize = (text: string, max: number, width: number) => Math.max(MIN_TEXT, Math.min(max, Math.floor(width / (Math.max(text.length, 1) * 0.47))));

// The Postcard tokens from src/styles.css, repeated: a canvas cannot read the stylesheet's variables.
const C = { gold: '#f2b632', cream: '#fffaf0', white: '#ffffff' };
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

// Baseline of a line of capitals centred in a box: CSS centres the em box, so the baseline sits about 0.36em below the middle.
const mid = (b: Box, size: number) => b.y + b.h / 2 + size * 0.36;

/** Draws the whole card onto a CARD_W x CARD_H context. `art` may be null; the figure then falls back to the initial. */
export function drawCard(ctx: Ctx, d: CardData, art: HTMLImageElement | null, friendArt: Partial<Record<Person, HTMLImageElement | null>> = {}) {
  const col = cardColours(d.name);
  const L = cardLayout(d);
  const inner = CARD_W - 2 * FACE;
  ctx.textBaseline = 'alphabetic';

  // Gold foil frame, then the player's rays across the whole face, centred behind the figure.
  const gold = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  [[0, '#f8dc86'], [.35, '#c98a10'], [.6, '#f8dc86'], [1, '#a86d0a']].forEach(([o, c]) => gold.addColorStop(o as number, c as string));
  rrect(ctx, 0, 0, CARD_W, CARD_H, 56); ctx.fillStyle = gold; ctx.fill();
  ctx.save();
  rrect(ctx, FACE, FACE, inner, CARD_H - 2 * FACE, 42); ctx.clip();
  ctx.fillStyle = col.a; ctx.fillRect(0, 0, CARD_W, CARD_H);
  rays(ctx, CARD_W / 2, L.rayY, col.a, col.b);
  // The plate in the player's deep colour, with a gold top edge.
  ctx.fillStyle = col.plate; ctx.fillRect(0, L.plateTop, CARD_W, CARD_H);
  ctx.fillStyle = C.gold; ctx.fillRect(0, L.plateTop, CARD_W, 5);
  ctx.restore();

  // The figure, full height, feet over the plate's edge.
  const figH = L.figBottom - L.figTop;
  if (art) {
    const w = Math.min(inner, (art.width * figH) / art.height);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowOffsetY = 10; ctx.shadowBlur = 16;
    ctx.drawImage(art, CARD_W / 2 - w / 2, L.figTop, w, figH);
    ctx.restore();
  } else {
    ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.font = `800 320px ${HEAD}`;
    ctx.fillText(d.name.charAt(0), CARD_W / 2, L.figBottom - 60);
  }

  // Top row: card number and rarity stars, then the small rarity stamp in the player's colour.
  ctx.fillStyle = C.white; ctx.textAlign = 'left'; ctx.font = `800 ${MIN_TEXT}px ${HEAD}`;
  ctx.fillText(cardNo(d).toUpperCase(), 52, 72);
  ctx.textAlign = 'right'; ctx.font = `400 32px ${BODY}`;
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i < d.stars ? C.gold : 'rgba(255,255,255,.3)'; ctx.fillText('★', CARD_W - 52 - (4 - i) * 36, 72); }
  ctx.save();
  ctx.translate(STAMP.cx, STAMP.cy); ctx.rotate(deg(STAMP.rot));
  rrect(ctx, -STAMP.w / 2, -STAMP.h / 2, STAMP.w, STAMP.h, 8); ctx.fillStyle = C.cream; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = col.plate; ctx.stroke();
  ctx.fillStyle = col.plate; ctx.textAlign = 'center';
  fitText(ctx, d.rarity.toUpperCase(), 0, STAMP.size * 0.36, STAMP.w - 24, 800, STAMP.size, 18, HEAD);
  ctx.restore();

  // Name and title as display type on the plate.
  ctx.textAlign = 'center';
  const nameSize = textSize(d.name, 120, 720);
  ctx.fillStyle = C.white;
  fitText(ctx, d.name.toUpperCase(), CARD_W / 2, mid(L.name, nameSize), 720, 800, nameSize, 48, HEAD);
  if (L.title) {
    const s = textSize(d.title, 46, 720);
    ctx.fillStyle = col.tint;
    fitText(ctx, d.title.toUpperCase(), CARD_W / 2, mid(L.title, s), 720, 800, s, MIN_TEXT, HEAD);
  }

  // Stats: a compact strip, one row each: label, a segmented bar in the player's tint, the number.
  if (L.stats) {
    d.stats.forEach((s, i) => {
      const row = { y: L.stats!.y + i * ROW_H, h: ROW_H }, over = s.value > 10;
      ctx.fillStyle = C.white; ctx.textAlign = 'left';
      fitText(ctx, s.label.toUpperCase(), STAT_X.label, mid(row, 28), STAT_X.labelW, 800, 28, MIN_TEXT, HEAD);
      const by = row.y + (ROW_H - STAT_X.barH) / 2, { bar: bx, barW: bw, barH: bh } = STAT_X;
      ctx.save(); rrect(ctx, bx, by, bw, bh, bh / 2); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = over ? C.gold : col.fill[tierOf(s.value)]; ctx.fillRect(bx, by, (bw * Math.min(10, s.value)) / 10, bh);
      ctx.fillStyle = col.plate;
      for (let k = 1; k < 10; k++) ctx.fillRect(bx + (bw * k) / 10 - 1.5, by, 3, bh);
      ctx.restore();
      ctx.fillStyle = over ? C.gold : C.white; ctx.textAlign = 'right';
      fitText(ctx, String(s.value), STAT_X.val, mid(row, 34), 64, 800, 34, 20, HEAD);
    });
  }

  // Trip numbers: two count chips under the bars, aligned with the friendship strip's columns.
  if (L.trip) {
    d.trip.slice(0, 2).forEach((t, i) => {
      const x0 = STAT_X.label + i * (FRIEND.half + FRIEND.gap), row = L.trip!, w = FRIEND.half;
      ctx.fillStyle = 'rgba(255,255,255,.14)'; rrect(ctx, x0, row.y + 2, w, row.h - 4, (row.h - 4) / 2); ctx.fill();
      ctx.fillStyle = col.tint; ctx.textAlign = 'left';
      fitText(ctx, t.label.toUpperCase(), x0 + 20, mid(row, 28), w - 100, 800, 28, MIN_TEXT, HEAD);
      ctx.fillStyle = C.white; ctx.textAlign = 'right';
      fitText(ctx, String(t.value), x0 + w - 20, mid(row, 34), 64, 800, 34, 20, HEAD);
    });
  }

  // Friendship strip: the travel twin on the left, the biggest clash on the right, each a head in their colour, label, name and %.
  if (L.friends && d.friends) {
    ([['twin', 0], ['clash', 1]] as const).forEach(([k, i]) => {
      const f = d.friends![k];
      if (!f) return;
      const x0 = STAT_X.label + i * (FRIEND.half + FRIEND.gap), cy = L.friends!.y + L.friends!.h / 2, r = FRIEND.dot / 2;
      ctx.save();
      ctx.beginPath(); ctx.arc(x0 + r, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      ctx.fillStyle = (PALETTE[f.name] ?? FALLBACK)[1]; ctx.fillRect(x0, cy - r, FRIEND.dot, FRIEND.dot);
      const img = friendArt[f.name];
      if (img) {
        const s = IMAGE_CM[f.name] / 200, u = FRIEND.dot / BUST.box, h = BUST.figure * s, w = (img.width * h) / img.height;
        ctx.drawImage(img, x0 + (BUST.centre - w / 2 - BUST.left) * u, cy - r + BUST.above * u, w * u, h * u);
      }
      ctx.restore();
      const tx = x0 + FRIEND.dot + 12;
      ctx.textAlign = 'left'; ctx.fillStyle = col.tint;
      fitText(ctx, FRIEND_LABELS[k].toUpperCase(), tx, L.friends!.y + 26, FRIEND.half - FRIEND.dot - 88, 800, 28, MIN_TEXT, HEAD);
      ctx.fillStyle = C.white;
      fitText(ctx, f.name.toUpperCase(), tx, L.friends!.y + 56, FRIEND.half - FRIEND.dot - 88, 800, 28, MIN_TEXT, HEAD);
      ctx.textAlign = 'right';
      fitText(ctx, `${f.pct}%`, x0 + FRIEND.half, mid(L.friends!, 34), 76, 800, 34, 20, HEAD);
    });
  }

  // Fun fact, only when there is one: a gold tag and up to two lines, shrunk until it fits so it is never clipped.
  if (L.fact && d.fact) {
    ctx.fillStyle = C.gold; ctx.textAlign = 'left';
    fitText(ctx, profile.funFact.toUpperCase(), FACT_X.tag, mid(L.fact, 28), FACT_X.text - FACT_X.tag - 12, 800, 28, MIN_TEXT, HEAD);
    let size = FACT_X.size, lines = [d.fact];
    for (; size >= MIN_TEXT; size -= 2) {
      ctx.font = `800 ${size}px ${HEAD}`;
      lines = wrap(ctx, d.fact, FACT_X.textW);
      if (lines.length <= 2) break;
    }
    ctx.fillStyle = C.white;
    const lh = size * 1.05, first = L.fact.y + L.fact.h / 2 - ((lines.length - 1) * lh) / 2 + size * 0.36;
    lines.forEach((l, i) => ctx.fillText(l, FACT_X.text, first + i * lh));
  }

  ctx.fillStyle = col.meta; ctx.textAlign = 'center';
  fitText(ctx, metaText(d).join('  |  ').toUpperCase(), CARD_W / 2, mid(L.meta, 28), 720, 700, 28, MIN_TEXT, HEAD);

  // Foil: a static rainbow sheen across the face (it sweeps on screen).
  ctx.save();
  rrect(ctx, FACE, FACE, inner, CARD_H - 2 * FACE, 42); ctx.clip();
  const foil = ctx.createLinearGradient(0, CARD_H * 0.15, CARD_W, CARD_H * 0.85);
  [[0.25, 'rgba(255,255,255,0)'], [0.36, 'rgba(255,80,160,.14)'], [0.45, 'rgba(255,220,80,.17)'], [0.54, 'rgba(80,255,200,.14)'], [0.64, 'rgba(100,140,255,.13)'], [0.75, 'rgba(255,255,255,0)']]
    .forEach(([o, c]) => foil.addColorStop(o as number, c as string));
  ctx.fillStyle = foil; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();
}

export const selfieSrc = (n: Player) => `/img/players/${n.toLowerCase()}-selfie.png`;
export const artSrc = (n: Player) => `/img/players/${n.toLowerCase()}.png`;

/** Renders the card to a PNG, after the fonts and every picture (the player, then any friends) have loaded so none is missing from the file. */
export async function renderCardBlob(d: CardData): Promise<Blob> {
  const others = d.friends ? [d.friends.twin, d.friends.clash].flatMap(f => (f ? [f.name] : [])) : [];
  const [, art, ...more] = await Promise.all([loadFonts(), loadImage(artSrc(d.name)), ...others.map(n => loadImage(artSrc(n)))]);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  drawCard(ctx, d, art, Object.fromEntries(others.map((n, i) => [n, more[i]])));
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('empty png'))), 'image/png'));
}
