import type { ReactNode } from 'react';
import type { Person } from '../types';

// Flat full-body characters, drawn on a 100 x 220 grid with the feet on y = 214 and a slight 3/4 turn
// to the right. Each friend is built from Brittany's description; height scales the whole figure from the feet.
type Hair = 'curly-shoulder' | 'short-swept' | 'curly-mullet' | 'high-ponytail' | 'short-light';
type Legs = 'wide' | 'straight' | 'flared' | 'camo';
type Shoes = 'chunky' | 'af1' | 'loafer' | 'flat';
interface Look {
  height: number; build: number; skin: string; hair: string; hairStyle: Hair;
  top: string; longSleeves?: boolean; legs: Legs; denim: string; shoes: Shoes;
  glasses?: boolean; narrowEyes?: boolean; earrings?: boolean; bangle?: boolean; watch?: boolean; ring?: boolean;
  bg: [string, string];
}

export const LOOKS: Record<Person, Look> = {
  Brittany: { height: 164, build: 0.96, skin: '#8D5A3B', hair: '#22150E', hairStyle: 'curly-shoulder', top: '#F4F1EA', legs: 'wide', denim: '#5B7DB1', shoes: 'chunky', earrings: true, bangle: true, bg: ['#FF7A1A', '#FF4D6D'] },
  Alex: { height: 200, build: 0.9, skin: '#C9A27A', hair: '#3B2416', hairStyle: 'short-swept', narrowEyes: true, top: '#1F2F5C', legs: 'camo', denim: '#CDB98F', shoes: 'af1', bg: ['#2BB673', '#1B6E8F'] },
  Antek: { height: 189, build: 1.1, skin: '#EBC3A0', hair: '#4A3020', hairStyle: 'curly-mullet', top: '#F4F1EA', legs: 'wide', denim: '#17181C', shoes: 'loafer', glasses: true, watch: true, ring: true, bg: ['#4FB3E8', '#6A4CE0'] },
  Lazza: { height: 181, build: 0.88, skin: '#E6BC97', hair: '#4B2E1C', hairStyle: 'high-ponytail', top: '#F2EEE8', longSleeves: true, legs: 'flared', denim: '#4E6E9E', shoes: 'flat', bg: ['#FFC15E', '#FF7A1A'] },
  Saulie: { height: 191, build: 1, skin: '#F0CDB0', hair: '#9C6B42', hairStyle: 'short-light', top: '#F4F1EA', legs: 'straight', denim: '#3E5F94', shoes: 'af1', glasses: true, bg: ['#B07CFF', '#FF4D6D'] },
};

// Friends whose generated full-body PNG is in public/img/players/<lowercase name>.png. Add a name here once
// the file is committed; a static list means no request is made to probe for a missing file.
export const IMAGE_AVATARS: ReadonlySet<Person> = new Set<Person>(['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie']);
// Real heights in cm for the PNG figures, measured from each figure's own pixel height (the crops differ).
export const IMAGE_CM: Record<Person, number> = { Alex: 188, Saulie: 183, Antek: 178, Lazza: 170, Brittany: 160 };
// Top of the SVG figure's head above the feet at 200 cm, in grid units; the PNG is fitted to the same height.
const FIGURE_H = 211;

const HEAD_SCALE = 1.3;
const BODY_WIDEN = 1.2;
// Same frame for everyone so a row of tiles shows their real height differences.
const FULL_BOX = '10 -10 84 228';
// A little wider for the PNGs: Antek's laptop and Lazza's flag push their figures past 84 units at true height.
const IMAGE_FULL_BOX = '6 -10 92 228';

const EDGE = { stroke: 'rgba(11, 13, 16, .35)', strokeWidth: 1, strokeLinejoin: 'round' as const };

function hairBack(l: Look): ReactNode {
  if (l.hairStyle === 'curly-shoulder') {
    return <g fill={l.hair} data-part="long-hair">{[[36, 30], [34, 42], [35, 54], [40, 62], [66, 30], [69, 42], [68, 54], [63, 62], [38, 20], [66, 20]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="8" />)}</g>;
  }
  if (l.hairStyle === 'high-ponytail') {
    return <path data-part="long-hair" d="M58 14c10-6 18 0 17 10-1 10-4 20-2 32 1 6-3 8-6 4-4-8-3-20-4-30-1-6-3-10-5-12z" fill={l.hair} />;
  }
  if (l.hairStyle === 'curly-mullet') {
    return <g fill={l.hair}>{[[40, 50], [45, 54], [63, 49], [58, 54]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />)}</g>;
  }
  return null;
}

function hairFront(l: Look): ReactNode {
  switch (l.hairStyle) {
    case 'curly-shoulder':
      return <g fill={l.hair}>{[[42, 22], [50, 19], [58, 20], [64, 25], [39, 29]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="7" />)}</g>;
    case 'short-swept':
      return <path d="M38 34c-2-14 6-22 16-22 9 0 15 5 15 13-5-4-10-4-15-2-5 2-10 3-13 8z" fill={l.hair} />;
    case 'curly-mullet':
      return <g fill={l.hair}>{[[42, 24], [48, 20], [55, 19], [62, 22], [66, 28], [39, 31]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5.5" />)}</g>;
    case 'high-ponytail':
      return <g fill={l.hair}><path d="M38 36c-1-14 6-21 15-21 9 0 15 6 15 15-6-6-14-8-22-6-4 2-6 6-8 12z" /><circle cx="61" cy="15" r="4" fill="#FF4D6D" /></g>;
    case 'short-light':
      return <path d="M38 32c0-12 7-19 16-19 8 0 14 5 15 13-6-3-12-4-18-3-5 1-9 4-13 9z" fill={l.hair} />;
  }
}

function legs(l: Look, id: string): ReactNode {
  const fill = l.legs === 'camo' ? `url(#${id}-camo)` : l.denim;
  if (l.legs === 'wide') return <path data-part="legs-wide" d="M37 110h31l3 86H54l-2-60-2 60H33z" fill={fill} {...EDGE} />;
  if (l.legs === 'flared') return <path data-part="legs-flared" d="M38 110h29l-1 50 5 36H54l-2-36-2 36H32l6-36z" fill={fill} {...EDGE} />;
  return <path data-part={`legs-${l.legs}`} d="M38 110h29l-1 86H54l-2-60-2 60H39z" fill={fill} {...EDGE} />;
}

function shoes(l: Look): ReactNode {
  if (l.shoes === 'loafer') {
    return <g data-part="loafers" fill="#5A3A24" {...EDGE}><path d="M33 197h17v5c0 3-2 4-4 4H31c-2 0-2-3 0-4z" /><path d="M54 197h15c4 0 8 3 9 7v2H54z" /><path d="M58 199h7" stroke="#C9A06A" strokeWidth="1.5" /></g>;
  }
  const h = l.shoes === 'chunky' ? 11 : l.shoes === 'flat' ? 6 : 9;
  const sole = l.shoes === 'flat' ? '#D8D2C8' : '#E9E4DA';
  return (
    <g data-part={`shoes-${l.shoes}`} {...EDGE}>
      <path d={`M32 ${206 - h}h19v${h - 2}c0 2-1 3-3 3H31c-2 0-2-2-2-3z`} fill="#FBFAF7" />
      <path d={`M54 ${206 - h}h15c5 0 10 3 11 ${h - 2}v2H54z`} fill="#FBFAF7" />
      <path d="M29 206h22M54 206h26" stroke={sole} strokeWidth="3" />
      {l.shoes === 'af1' && <path d="M58 200c4 0 8-1 11-3" stroke="#C9CDD2" strokeWidth="1.4" fill="none" />}
    </g>
  );
}

function body(l: Look, id: string): ReactNode {
  const sleeveEnd = l.longSleeves ? 114 : 82;
  return (
    <g>
      {/* arms first so the top covers the shoulders */}
      <path d={`M28 ${sleeveEnd - 4}l-1 ${122 - sleeveEnd}h9l1-${122 - sleeveEnd}z`} fill={l.skin} />
      <path d={`M72 ${sleeveEnd - 4}l2 ${120 - sleeveEnd}h-8l-2-${120 - sleeveEnd}z`} fill={l.skin} />
      <ellipse cx="31.5" cy="121" rx="5" ry="5.5" fill={l.skin} />
      <ellipse cx="70" cy="119" rx="5" ry="5.5" fill={l.skin} />
      {legs(l, id)}
      <path d="M35 58c6-4 28-5 34 0l-1 54H37z" fill={l.top} {...EDGE} />
      <path d={`M35 58l-8 ${sleeveEnd - 58}h8l4-${sleeveEnd - 70}z`} fill={l.top} {...EDGE} />
      <path d={`M69 58l5 ${sleeveEnd - 58}h-7l-3-${sleeveEnd - 70}z`} fill={l.top} {...EDGE} />
      {l.longSleeves && <path d="M37 106h31" stroke="rgba(11,13,16,.18)" strokeWidth="3" />}
      {l.bangle && <ellipse data-part="bangle" cx="31.5" cy="115" rx="4.4" ry="1.8" fill="none" stroke="#E2B23A" strokeWidth="2" />}
      {l.watch && <rect data-part="watch" x="27" y="112" width="9.5" height="4" rx="1" fill="#1A1A1A" />}
      {l.ring && <circle data-part="ring" cx="71" cy="123" r="1.6" fill="none" stroke="#D5D9DE" strokeWidth="1.4" />}
    </g>
  );
}

function head(l: Look): ReactNode {
  return (
    <g>
      {hairBack(l)}
      <rect x="47" y="46" width="9" height="13" fill={l.skin} />
      <ellipse cx="52" cy="35" rx="13" ry="15" fill={l.skin} />
      <ellipse cx="39.5" cy="37" rx="2.4" ry="3.4" fill={l.skin} />
      {hairFront(l)}
      <ellipse cx="48" cy="37" rx="1.6" ry={l.narrowEyes ? 1 : 1.6} fill="#101418" />
      <ellipse cx="58" cy="37" rx="1.6" ry={l.narrowEyes ? 1 : 1.6} fill="#101418" />
      <path d="M53 38c1 3 1 4-1 5" stroke="rgba(11,13,16,.35)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M48 45c3 2.5 7 2.5 10 0" stroke="#101418" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {l.glasses && (
        <g data-part="glasses" fill="none" stroke="#101418" strokeWidth="1.5">
          <rect x="43.5" y="33.5" width="8.5" height="7" rx="2.5" /><rect x="54" y="33.5" width="8.5" height="7" rx="2.5" /><path d="M52 36.5h2M43.5 36l-3-1" />
        </g>
      )}
      {l.earrings && <circle data-part="earrings" cx="39.5" cy="43.5" r="2.2" fill="none" stroke="#E2B23A" strokeWidth="1.6" />}
    </g>
  );
}

/**
 * A friend as a flat character. `crop="bust"` frames head and shoulders for small uses such as the header.
 * Decorative: the control beside it carries the name.
 */
export default function Avatar({ name, size = 80, crop = 'bust', bob = false, image = IMAGE_AVATARS.has(name) }: { name: Person; size?: number; crop?: 'bust' | 'full'; bob?: boolean; image?: boolean }) {
  const l = LOOKS[name] ?? LOOKS.Saulie;
  const cm = image ? IMAGE_CM[name] : l.height;
  const s = cm / 200;
  const id = `av-${name}-${crop}`;
  // Stylised proportions: a bigger head (scaled about the chin) and a wider body read better at tile size.
  const bodyT = `translate(52 214) scale(${(s * l.build * BODY_WIDEN).toFixed(3)} ${s.toFixed(3)}) translate(-52 -214)`;
  const headT = `translate(52 214) scale(${s.toFixed(3)}) translate(-52 -214) translate(52 50) scale(${HEAD_SCALE}) translate(-52 -50)`;
  const bust = crop === 'bust';
  const headY = image ? 214 - FIGURE_H * s : 214 - (214 - 30.5) * s;
  const top = headY - (image ? 6 : 30);
  const box = bust ? `16 ${top.toFixed(1)} 72 72` : image ? IMAGE_FULL_BOX : FULL_BOX;
  const [, , bw, bh] = box.split(' ').map(Number);
  return (
    <svg viewBox={box} width={(size * bw) / bh} height={size} aria-hidden="true" focusable="false"
      className={`avatar-art ${crop}`} data-person={name} data-height={cm}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={l.bg[0]} /><stop offset="1" stopColor={l.bg[1]} /></linearGradient>
        <pattern id={`${id}-camo`} width="22" height="22" patternUnits="userSpaceOnUse">
          <rect width="22" height="22" fill={l.denim} />
          <path d="M2 4c4-3 9 0 8 4s-7 4-9 1zM13 13c3-2 8 0 8 4-1 4-7 3-8 0zM3 15c2-1 5 0 4 3-1 2-4 1-4-1z" fill="#6E86A8" />
          <path d="M12 2c2-1 5 0 5 2s-3 3-5 1zM0 11c2-1 4 0 4 2s-3 2-4 1z" fill="#9A8660" />
        </pattern>
      </defs>
      {bust && <rect x="16" y={top} width="72" height="72" rx="18" fill={`url(#${id}-bg)`} />}
      <g className={bob ? 'bob' : undefined}>
        <ellipse cx="54" cy="208" rx="26" ry="4" fill="rgba(0,0,0,.28)" />
        {image ? (
          <image href={`/img/players/${name.toLowerCase()}.png`} x="-40" width="184" y={(214 - FIGURE_H * s).toFixed(1)} height={(FIGURE_H * s).toFixed(1)} preserveAspectRatio="xMidYMax meet" />
        ) : (
          <>
            <g transform={bodyT}>{body(l, id)}{shoes(l)}</g>
            <g transform={headT}>{head(l)}</g>
          </>
        )}
      </g>
    </svg>
  );
}
