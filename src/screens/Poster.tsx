import { forwardRef, useRef, useState } from 'react';
import Avatar from '../components/Avatar';
import { PEOPLE } from '../types';
import type { Area } from '../types';

// One SVG, so the same markup is the on-screen poster and the file we save (no screenshotting the DOM).
const W = 360, H = 640;
const AVATAR_H = 170, AVATAR_W = (AVATAR_H * 84) / 228, GAP = 6;
const FEET_Y = 436;
const ROUTE_LINE_CHARS = 26;
const FONT = 'Archivo, "Arial Black", system-ui, -apple-system, "Segoe UI", sans-serif';

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

export const PosterArt = forwardRef<SVGSVGElement, { areas: Area[] }>(function PosterArt({ areas }, ref) {
  const total = PEOPLE.length * AVATAR_W + (PEOPLE.length - 1) * GAP;
  const x0 = (W - total) / 2;
  const lines = routeLines(areas);
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Sri Lanka poster" className="poster-art">
      <defs>
        <linearGradient id="poster-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0A1A28" /><stop offset=".55" stopColor="#7A2E4D" /><stop offset=".8" stopColor="#FF7A1A" /><stop offset="1" stopColor="#FFC15E" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#poster-sky)" />
      <circle cx="180" cy="372" r="120" fill="#FFC15E" opacity=".35" />
      <text x={W / 2} y="92" textAnchor="middle" fontFamily={FONT} fontWeight="900" fontSize="48" letterSpacing="2" fill="#F5F1EA">SRI LANKA</text>
      <text x={W / 2} y="124" textAnchor="middle" fontFamily={FONT} fontWeight="800" fontSize="16" letterSpacing="7" fill="#FFC15E">DEC 2026</text>
      {PEOPLE.map((p, i) => (
        <g key={p} transform={`translate(${x0 + i * (AVATAR_W + GAP)} ${FEET_Y - AVATAR_H * (224 / 228)})`}>
          <Avatar name={p} size={AVATAR_H} crop="full" />
        </g>
      ))}
      <rect x="0" y={FEET_Y + 10} width={W} height={H - FEET_Y - 10} fill="#0B0D10" opacity=".82" />
      <text textAnchor="middle" fontFamily={FONT} fontWeight="800" fontSize="15" fill="#F5F1EA">
        {lines.map((l, i) => <tspan key={i} x={W / 2} y={FEET_Y + 44 + i * 22}>{l}</tspan>)}
      </text>
      <text x={W / 2} y={H - 22} textAnchor="middle" fontFamily={FONT} fontWeight="700" fontSize="9" letterSpacing="1.5" fill="#FFC15E">
        {`starring ${PEOPLE.map(p => p.toUpperCase()).join(' ')}`}
      </text>
    </svg>
  );
});

const SCALE = 3;

export async function posterBlob(el: SVGSVGElement): Promise<Blob> {
  const svg = new XMLSerializer().serializeToString(el);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('no png'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Share sheet with the PNG when the browser can share files, else a download. */
export async function savePoster(el: SVGSVGElement): Promise<'shared' | 'downloaded'> {
  const file = new File([await posterBlob(el)], 'sri-lanka-poster.png', { type: 'image/png' });
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
