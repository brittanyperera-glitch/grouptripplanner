import { forwardRef, useRef, useState } from 'react';
import Avatar from '../components/Avatar';
import { PEOPLE } from '../types';
import type { Area } from '../types';

// One SVG, so the same markup is the on-screen poster and the file we save (no screenshotting the DOM).
const W = 360, H = 640;
const AVATAR_H = 170, AVATAR_W = (AVATAR_H * 84) / 228, GAP = 2;
const FEET_Y = 436;
const ROUTE_LINE_CHARS = 26;
const HEAD = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';
const BODY = 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Greedy wrap of "A → B → C" at arrow boundaries so no line runs past the poster. */
export function routeLines(areas: Area[]): string[] {
  const lines: string[] = [];
  let cur = '';
  areas.forEach((a, i) => {
    const part = i < areas.length - 1 ? `${a} →` : a;
    if (cur && `${cur} ${part}`.length > ROUTE_LINE_CHARS) { lines.push(cur); cur = part; } else cur = cur ? `${cur} ${part}` : part;
  });
  if (cur) lines.push(cur);
  return lines;
}

// The saved PNG is an SVG drawn as an image, which cannot see the page's CSS variables, so these are the Postcard tokens' values.
const INK = '#1e2a26', PAPER = '#f4ede0', RED = '#d6452c', RED_INK = '#b8381f', MUTED = '#56615c';

const UP = { textTransform: 'uppercase' } as const;

export const PosterArt = forwardRef<SVGSVGElement, { areas: Area[] }>(function PosterArt({ areas }, ref) {
  const total = PEOPLE.length * AVATAR_W + (PEOPLE.length - 1) * GAP;
  const x0 = (W - total) / 2;
  const lines = routeLines(areas);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Sri Lanka poster" className="poster-art">
      <rect width={W} height={H} fill={PAPER} />
      <text x={W / 2} y="96" textAnchor="middle" fontFamily={HEAD} fontWeight="800" fontSize="64" letterSpacing="2" fill={INK}>SRI LANKA</text>
      <rect x={W / 2 - 62} y="112" width="124" height="28" rx="4" fill="none" stroke={RED} strokeWidth="1.5" strokeDasharray="5 3" />
      <text x={W / 2} y="132" textAnchor="middle" fontFamily={HEAD} fontWeight="800" fontSize="20" letterSpacing="4" fill={RED_INK}>DEC 2026</text>
      <rect x="14" y="226" width={W - 28} height={FEET_Y + 12 - 226} fill="#fff" />
      <rect x="14" y="14" width={W - 28} height={H - 28} rx="10" fill="none" stroke={RED} strokeWidth="1.5" strokeDasharray="6 4" />
      {PEOPLE.map((p, i) => (
        <g key={p} transform={`translate(${x0 + i * (AVATAR_W + GAP)} ${FEET_Y - AVATAR_H * (224 / 228)})`}>
          <Avatar name={p} size={AVATAR_H} crop="full" />
        </g>
      ))}
      <line x1="40" y1={FEET_Y + 34} x2={W - 40} y2={FEET_Y + 34} stroke={RED} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
      <text textAnchor="middle" fontFamily={HEAD} fontWeight="800" fontSize="22" letterSpacing="1" fill={INK} style={UP}>
        {lines.map((l, i) => <tspan key={i} x={W / 2} y={FEET_Y + 66 + i * 26}>{l}</tspan>)}
      </text>
      <text x={W / 2} y={H - 34} textAnchor="middle" fontFamily={BODY} fontWeight="700" fontSize="10" letterSpacing="1.5" fill={MUTED}>
        {`starring ${PEOPLE.map(p => p.toUpperCase()).join(' ')}`}
      </text>
    </svg>
  );
});

const SCALE = 3;

const toDataUrl = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

/** An SVG drawn as an image cannot fetch files, so every <image> is inlined as a data URL first. */
async function inlineImages(svg: SVGSVGElement) {
  await Promise.all([...svg.querySelectorAll('image')].map(async im => {
    const href = im.getAttribute('href');
    if (!href || href.startsWith('data:')) return;
    try {
      const res = await fetch(href);
      if (res.ok) im.setAttribute('href', await toDataUrl(await res.blob()));
    } catch { /* keep the link; the figure just will not show */ }
  }));
}

/** Text is drawn on the canvas, not inside the SVG image: an SVG image cannot see the page's web fonts (Barlow Condensed, Manrope). */
async function drawText(ctx: CanvasRenderingContext2D, texts: SVGTextElement[]) {
  await Promise.all(texts.map(t => document.fonts.load(`${t.getAttribute('font-weight')} ${t.getAttribute('font-size')}px ${t.getAttribute('font-family')}`, t.textContent ?? '')));
  for (const t of texts) {
    ctx.font = `${t.getAttribute('font-weight')} ${SCALE * Number(t.getAttribute('font-size'))}px ${t.getAttribute('font-family')}`;
    ctx.fillStyle = t.getAttribute('fill') ?? '#fff';
    ctx.textAlign = 'center';
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${SCALE * Number(t.getAttribute('letter-spacing') ?? 0)}px`;
    // On screen the route lines are uppercased by CSS; the canvas has no text-transform.
    const up = (x: string | null) => ((t.getAttribute('font-family') ?? '').includes('Barlow') ? (x ?? '').toUpperCase() : (x ?? ''));
    const spans = [...t.querySelectorAll('tspan')];
    if (spans.length) spans.forEach(sp => ctx.fillText(up(sp.textContent), SCALE * Number(sp.getAttribute('x')), SCALE * Number(sp.getAttribute('y'))));
    else ctx.fillText(up(t.textContent), SCALE * Number(t.getAttribute('x')), SCALE * Number(t.getAttribute('y')));
  }
}

export async function posterBlob(el: SVGSVGElement): Promise<Blob> {
  const clone = el.cloneNode(true) as SVGSVGElement;
  const texts = [...clone.querySelectorAll('text')];
  texts.forEach(t => t.parentNode?.removeChild(t));
  await inlineImages(clone);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    await drawText(ctx, texts);
    return await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('no png'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Share sheet with the PNG when the browser can share files, else a download. */
export async function savePoster(el: SVGSVGElement): Promise<'shared' | 'downloaded'> {
  return shareOrDownload(new File([await posterBlob(el)], 'sri-lanka-poster.png', { type: 'image/png' }));
}

export async function shareOrDownload(file: File): Promise<'shared' | 'downloaded'> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Sri Lanka, Dec 2026' }); return 'shared'; } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}

export const TRAVEL_POSTER = '/img/poster/homecoming.jpg';

/** The illustrated group poster, shown at the end of the route reveal. Save shares or downloads the same file. */
export function TravelPoster() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const save = async () => {
    setBusy(true); setErr(false);
    try {
      const blob = await (await fetch(TRAVEL_POSTER)).blob();
      await shareOrDownload(new File([blob], 'sri-lanka-the-homecoming.jpg', { type: 'image/jpeg' }));
    } catch { setErr(true); }
    setBusy(false);
  };
  return (
    <div className="poster-wrap">
      <img className="poster-art poster-photo" src={TRAVEL_POSTER} alt="Sri Lanka, The Homecoming: the crew on a tuk-tuk, a travel poster" />
      <button type="button" className="cta" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save poster'}</button>
      {err && <div className="sub warn" role="alert">Could not save. Try a screenshot.</div>}
    </div>
  );
}

export default function Poster({ areas }: { areas: Area[] }) {
  const art = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const save = async () => {
    setBusy(true); setErr(false);
    try { await savePoster(art.current!); } catch { setErr(true); }
    setBusy(false);
  };
  return (
    <div className="poster-wrap">
      <PosterArt ref={art} areas={areas} />
      <button type="button" className="cta" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save poster'}</button>
      {err && <div className="sub warn" role="alert">Could not save. Try a screenshot.</div>}
    </div>
  );
}
