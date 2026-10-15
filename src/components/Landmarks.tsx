import type { CSSProperties, ReactNode } from 'react';
import './Landmarks.css';
import type { Hub } from '../types';

// Palette from TukTuk.tsx and the reveal map (docs/theme-postcard.md): ink outline, red/teal fills, a little ochre and sage.
const INK = '#1e2a26', RED = '#d6452c', TEAL = '#1f6f6b', WHITE = '#fff', TAN = '#cf9a73', GREEN = '#8fb07c', GOLD = '#e3b04b', SEA = '#dce6e6', GREY = '#a9b3b0', SKIN = '#e8c3a0';

/** A landmark's box in map units. Art is drawn in a 40 x 44 box and shown at ART_SCALE. */
export const LANDMARK_W = 36, LANDMARK_H = 40;
const ART_SCALE = LANDMARK_W / 40;
// Past this distance from its pin a landmark gets a dotted leader back to it.
const LEADER_FROM = 46;

export type Box = { l: number; t: number; r: number; b: number };
export interface Placed { box: Box; dx: number; dy: number }

/** One cartoon per hub, each for what the place is known for. */
export const LANDMARKS: Record<Hub, { label: string; art: ReactNode }> = {
  AIR: {
    label: 'Plane',
    art: (
      <g transform="rotate(-14 20 24)">
        <path d="M16 26L9 37H16L26 27Z" fill={TEAL} />
        <path d="M3 24Q3 19 10 19H30Q37 19 38 23Q37 28 30 28H10Q3 28 3 24Z" fill={WHITE} />
        <path d="M7 20L3 9H10L16 19Z" fill={RED} />
        <path d="M18 20L15 12H20L26 19Z" fill={TEAL} />
        <path d="M31 19.5Q35 19.5 36.8 22.5H31Z" fill="#d9ece8" />
        <g fill={TEAL} stroke="none"><circle cx="14" cy="23.5" r="1.4" /><circle cx="19" cy="23.5" r="1.4" /><circle cx="24" cy="23.5" r="1.4" /></g>
      </g>
    ),
  },
  Colombo: {
    label: 'Lotus Tower',
    art: (
      <>
        <rect x="11" y="38.5" width="18" height="4.5" rx="1.2" fill={WHITE} />
        <path d="M18.2 38.5L19.2 17H20.8L21.8 38.5Z" fill={WHITE} />
        <ellipse cx="20" cy="27" rx="3.6" ry="1.7" fill={TEAL} />
        <path d="M20 3Q28 8 27 14.5Q26 19.5 20 19.5Q14 19.5 13 14.5Q12 8 20 3Z" fill={RED} />
        <path d="M20 5Q16 11 20 19.5M20 5Q24 11 20 19.5" fill="none" stroke={WHITE} strokeWidth="1" opacity=".75" />
        <path d="M20 3V.8" />
      </>
    ),
  },
  Jaffna: {
    label: 'Palmyra palm',
    art: (
      <>
        <path d="M18 43Q19 31 18.6 16H21.6Q21 31 22.6 43Z" fill="#c9985f" />
        <path d="M18.8 37h3.4M18.7 31h3.2M18.7 25h3M18.7 20h3" fill="none" strokeWidth="1" />
        {[-72, -36, 0, 36, 72].map(a => <ellipse key={a} cx="20" cy="8.5" rx="3.3" ry="8" transform={`rotate(${a} 20 16)`} fill={GREEN} />)}
        <circle cx="18.2" cy="17.5" r="1.7" fill="#7a5a3a" /><circle cx="22" cy="17.8" r="1.7" fill="#7a5a3a" />
      </>
    ),
  },
  Trincomalee: {
    label: 'Whale tail',
    art: (
      <>
        <path d="M17.4 38Q18 29 18.6 23H21.4Q22 29 22.6 38Z" fill={TEAL} />
        <path d="M20 24Q13 24 6 15Q5 12 8 13Q14 15 20 20Q26 15 32 13Q35 12 34 15Q27 24 20 24Z" fill={TEAL} />
        <path d="M1 35Q6 30 11 35T21 35T31 35T39 34V43H1Z" fill={WHITE} />
        <path d="M1 40Q6 36 11 40T21 40T31 40T39 39" fill="none" stroke={TEAL} strokeWidth="1" opacity=".6" />
        <g fill={SEA} strokeWidth="1"><circle cx="11" cy="22" r="1.2" /><circle cx="29" cy="21" r="1.2" /><circle cx="8" cy="27" r=".9" /></g>
      </>
    ),
  },
  Sigiriya: {
    label: 'Lion Rock',
    art: (
      <>
        <path d="M3 43L9 21Q10 12 18 11H29Q34 12 35 20L38 43Z" fill={TAN} />
        <path d="M12 12Q12 6 17 8Q19 3 24 7Q29 5 31 10Q32 12 31 12Z" fill={GREEN} />
        <path d="M7 31Q20 27 35 31" fill="none" strokeWidth="1" opacity=".55" />
        <path d="M14.5 43V36Q14.5 32 20 32Q25.5 32 25.5 36V43Z" fill="#b5784f" />
        <path d="M17.2 43v-4.5M20 43v-4.5M22.8 43v-4.5" fill="none" strokeWidth="1" />
      </>
    ),
  },
  Kandy: {
    label: 'Seated Buddha',
    art: (
      <>
        <circle cx="20" cy="14" r="10" fill="none" stroke={RED} strokeWidth="1.2" strokeDasharray="2.5 2.5" />
        <path d="M5 40Q20 46 35 40Q31 35 20 36Q9 35 5 40Z" fill="#f3b6a8" />
        <path d="M9 38Q8 27 14.5 23H25.5Q32 27 31 38Q20 40 9 38Z" fill={GOLD} />
        <circle cx="20" cy="14" r="6" fill={GOLD} />
        <path d="M17 9Q20 1 23 9Z" fill={GOLD} />
        <path d="M16.6 13q1.3 1.1 2.6 0M20.8 13q1.3 1.1 2.6 0M19 16.6q1 .8 2 0" fill="none" strokeWidth="1" />
        <path d="M9.5 36Q20 33 30.5 36" fill="none" strokeWidth="1.2" />
        <ellipse cx="20" cy="32" rx="6" ry="2.6" fill="#f0c56a" strokeWidth="1.2" />
        <path d="M14 24.5Q20 29 26 24.5" fill="none" strokeWidth="1.2" />
      </>
    ),
  },
  Kitulgala: {
    label: 'River raft',
    art: (
      <>
        <path d="M18 17L8 6M23 17L33 4" fill="none" strokeWidth="1.5" />
        <ellipse cx="7" cy="5" rx="2.2" ry="3.6" transform="rotate(35 7 5)" fill={WHITE} />
        <ellipse cx="34" cy="3.5" rx="2.2" ry="3.6" transform="rotate(-35 34 3.5)" fill={WHITE} />
        <path d="M10.5 25V19.5Q14 17.5 17.5 19.5V25ZM23.5 25V19.5Q27 17.5 30.5 19.5V25Z" fill={GOLD} />
        <circle cx="14" cy="14.5" r="3.8" fill={SKIN} /><circle cx="27" cy="14.5" r="3.8" fill={SKIN} />
        <path d="M10 14.2Q10 10 14 10T18 14.2ZM23 14.2Q23 10 27 10T31 14.2Z" fill={TEAL} />
        <path d="M3 29Q3 24 9 24H31Q37 24 37 29Q37 34 31 34H9Q3 34 3 29Z" fill={RED} />
        <path d="M8 27.5H32" fill="none" stroke={WHITE} strokeWidth="1.2" opacity=".55" />
        <path d="M1 36Q6 32 11 36T21 36T31 36T39 35V43H1Z" fill={WHITE} />
        <path d="M1 40Q6 37 11 40T21 40T31 40T39 39" fill="none" stroke={TEAL} strokeWidth="1" opacity=".6" />
      </>
    ),
  },
  'Nuwara Eliya': {
    label: 'Tea bush and cup',
    art: (
      <>
        <path d="M1 40Q0 25 11 22Q16 19 21 24Q27 27 27 40Z" fill={GREEN} />
        <path d="M4.5 33q3-3 6 0M11 28q3-3 6 0M14 36q3-3 6 0" fill="none" stroke="#5f8a4d" strokeWidth="1.1" />
        <path d="M10 22Q8 16 12 14Q13 19 10 22Z" fill="#b3cfa0" />
        <ellipse cx="26.5" cy="40.5" rx="11" ry="2.6" fill={WHITE} />
        <path d="M35 30Q40 30 39.5 34Q39 37.5 34 37" fill="none" strokeWidth="1.6" />
        <path d="M17 28H36Q36 40 26.5 40Q17 40 17 28Z" fill={WHITE} />
        <ellipse cx="26.5" cy="28" rx="9.5" ry="2" fill="#c47a42" />
        <path d="M17.6 33.5H35.4" fill="none" stroke={RED} strokeWidth="2.2" />
        <path d="M22 24Q20 21 22 18Q24 15 22 12M29 24Q27 21 29 18Q31 15 29 12" fill="none" stroke="#56615c" strokeWidth="1.2" opacity=".8" />
      </>
    ),
  },
  Ella: {
    label: 'Nine Arch bridge',
    art: (
      <>
        <path d="M2 23H38V42H2Z" fill="#e2d2b0" />
        {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M${5.2 + i * 6.4} 42V33.5Q${5.2 + i * 6.4} 29.5 ${7.6 + i * 6.4} 29.5Q${10 + i * 6.4} 29.5 ${10 + i * 6.4} 33.5V42Z`} fill={GREEN} />)}
        <rect x="1" y="21" width="38" height="3" fill="#d2c09a" />
        <rect x="4" y="12.5" width="9" height="7.5" rx="1.3" fill={TEAL} />
        <rect x="14.5" y="12.5" width="9" height="7.5" rx="1.3" fill={TEAL} />
        <path d="M25 20V13.5Q25 12.5 26 12.5H35Q36.5 12.5 36.5 14V20Z" fill={RED} />
        <rect x="31" y="8.5" width="3.2" height="4" fill={INK} />
        <g fill={WHITE} stroke="none"><rect x="6" y="14.5" width="5" height="3" /><rect x="16.5" y="14.5" width="5" height="3" /><rect x="27" y="14.5" width="3.4" height="3" /></g>
        <g fill={WHITE} strokeWidth="1"><circle cx="33" cy="5.2" r="2.1" /><circle cx="36.5" cy="2.6" r="1.6" /></g>
        <g fill={INK} stroke="none"><circle cx="8" cy="20.2" r="1.2" /><circle cx="18.5" cy="20.2" r="1.2" /><circle cx="29" cy="20.2" r="1.2" /></g>
      </>
    ),
  },
  Tissa: {
    label: 'Leopard',
    art: (
      <>
        <path d="M1 29.5Q20 32 39 28.5" fill="none" stroke={INK} strokeWidth="4.6" strokeLinecap="round" />
        <path d="M1 29.5Q20 32 39 28.5" fill="none" stroke="#8a5f3a" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M7 22Q-1 25 2 36" fill="none" stroke={INK} strokeWidth="4.4" strokeLinecap="round" />
        <path d="M7 22Q-1 25 2 36" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M10 26V34M23 26V33" fill="none" stroke={INK} strokeWidth="4.6" strokeLinecap="round" />
        <path d="M10 26V34M23 26V33" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M5 24Q5 15 15 15H25Q30 15 30 22Q30 27 25 27H11Q5 27 5 24Z" fill={GOLD} />
        <path d="M26 10L26.5 4.5L31 8ZM33 8L37.5 4.8L38 10.5Z" fill={GOLD} />
        <circle cx="32" cy="14" r="6.2" fill={GOLD} />
        <ellipse cx="33" cy="16.8" rx="3.2" ry="2.3" fill={WHITE} stroke="none" />
        <g fill={INK} stroke="none"><circle cx="30" cy="13" r="1" /><circle cx="35.2" cy="13" r="1" /><path d="M32 15.4h2.2l-1.1 1.3z" /></g>
        <g fill="#8a5a22" stroke="none"><circle cx="10" cy="20" r="1.3" /><circle cx="15" cy="23" r="1.3" /><circle cx="19" cy="19" r="1.3" /><circle cx="24" cy="23" r="1.3" /><circle cx="13" cy="17.5" r="1" /><circle cx="22" cy="17.5" r="1" /></g>
      </>
    ),
  },
  Udawalawe: {
    label: 'Elephant',
    art: (
      <>
        <path d="M5 23Q5 31 8 31M5 23Q4 28 5.5 30" fill="none" strokeWidth="1.2" />
        <rect x="12" y="28" width="5.4" height="12.5" rx="2.2" fill="#8f9b97" />
        <rect x="26" y="28" width="5.4" height="12.5" rx="2.2" fill="#8f9b97" />
        <ellipse cx="19" cy="24" rx="14" ry="10.5" fill={GREY} />
        <rect x="6" y="28" width="5.4" height="12.5" rx="2.2" fill={GREY} />
        <rect x="21" y="28" width="5.4" height="12.5" rx="2.2" fill={GREY} />
        <circle cx="30.5" cy="16" r="8" fill={GREY} />
        <path d="M34.5 21.5Q39.5 26 37 33.5Q35.8 36 34.2 34.3Q36 29 33 25.5Z" fill={GREY} />
        <path d="M33.5 21.5Q37 22 38.5 27" fill="none" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
        <path d="M33.5 21.5Q37 22 38.5 27" fill="none" stroke={WHITE} strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx="25.5" cy="17" rx="5.5" ry="8" fill="#97a29e" />
        <circle cx="33" cy="14.3" r="1.1" fill={INK} stroke="none" />
      </>
    ),
  },
  Weligama: {
    label: 'Surfboard',
    art: (
      <>
        <path d="M3 43Q20 33 37 43Z" fill="#ead9b3" />
        <g transform="rotate(12 20 22)">
          <path d="M20 1Q30 14 29 30Q28 40 20 41Q12 40 11 30Q10 14 20 1Z" fill={WHITE} />
          <path d="M20 4V38" fill="none" stroke={RED} strokeWidth="3" />
          <path d="M16.5 38.5L20 44L23.5 38.5Z" fill={TEAL} />
        </g>
        <path d="M0 41Q3 38 6 41M34 41Q37 38 40 41" fill="none" stroke={TEAL} strokeWidth="1.2" />
      </>
    ),
  },
};

export interface Obstacle { box: Box; what: string }

const hit = (a: Box, b: Box, m = 0) => a.l - m < b.r && b.l - m < a.r && a.t - m < b.b && b.t - m < a.b;
const around = (cx: number, cy: number): Box => ({ l: cx - LANDMARK_W / 2, r: cx + LANDMARK_W / 2, t: cy - LANDMARK_H / 2, b: cy + LANDMARK_H / 2 });
// The island's middle: a landmark pointing away from it sits over sea, where the card has the most room.
const ISLAND_C: [number, number] = [150, 250];
const STAGES: [number, number[]][] = [[5, [30, 38, 48]], [2, [30, 38, 48, 60]], [5, [60, 74, 90]], [2, [74, 90]], [0, [30, 38, 48, 60, 74, 90]]];

/**
 * Puts one landmark beside each pin, in the open spot around it: never on a hard obstacle (stop names, pins, parked tuk-tuks,
 * other landmarks), off the route line where it can, and out toward the sea / the card edge, which is where the pop-up sits.
 * `bounds` is the room the map leaves (the card plus a small bleed); `track` is points along the route line.
 */
export function placeLandmarks(pins: { hub: Hub; x: number; y: number }[], obstacles: Obstacle[], track: [number, number][], bounds: Box, card: Box): Record<string, Placed> {
  const placed: Record<string, Placed> = {};
  const taken: Box[] = [];
  for (const { hub, x, y } of pins) {
    const [ox, oy] = [x - ISLAND_C[0], y - ISLAND_C[1]];
    const on = Math.hypot(ox, oy) || 1;
    type Pick = { cost: number; box: Box; cx: number; cy: number };
    let best: Pick | null = null, fallback: Pick | null = null;
    // Roomy and close first, then tighter or further (with a leader), and last any spot with the fewest clashes. The pop overshoots by ~10%, hence the 5.
    for (const [margin, radii] of STAGES) {
      for (const R of radii) {
        for (let k = 0; k < 36; k++) {
          const a = (k / 36) * Math.PI * 2;
          const cx = x + Math.cos(a) * R, cy = y + Math.sin(a) * R * 0.92;
          const box = around(cx, cy);
          if (box.l < bounds.l || box.r > bounds.r || box.t < bounds.t || box.b > bounds.b) continue;
          const clash = obstacles.filter(o => hit(box, o.box, margin)).length + taken.filter(t => hit(box, t, margin)).length;
          const onLine = track.filter(([tx, ty]) => hit(box, { l: tx, r: tx, t: ty, b: ty }, 3)).length;
          const out = (Math.cos(a) * ox + Math.sin(a) * oy) / on;
          const bleed = box.l < card.l || box.r > card.r || box.t < card.t || box.b > card.b ? 1 : 0;
          const cost = R * 0.4 + onLine * 6 - out * 7 - bleed * 5;
          if (clash === 0) { if (!best || cost < best.cost) best = { cost, box, cx, cy }; }
          else if (!fallback || clash * 1000 + cost < fallback.cost) fallback = { cost: clash * 1000 + cost, box, cx, cy };
        }
        if (best) break;
      }
      if (best) break;
    }
    const pick = best ?? fallback;
    if (!pick) continue;
    taken.push(pick.box);
    placed[hub] = { box: pick.box, dx: x - pick.cx, dy: y - pick.box.b };
  }
  return placed;
}

/** The landmark for `hub` at `placed`, standing on its box. It springs up from the pin when `pop` is on. */
export function Landmark({ hub, placed, pop, delay }: { hub: Hub; placed: Placed; pop: boolean; delay: number }) {
  const { label, art } = LANDMARKS[hub];
  return (
    <g transform={`translate(${placed.box.l.toFixed(1)} ${placed.box.t.toFixed(1)})`} className="lm" data-landmark={hub} data-kind={label} aria-hidden="true">
      {Math.hypot(placed.dx, placed.dy) > LEADER_FROM && <path className="lm-lead" data-pop={pop ? 'on' : undefined} style={{ '--lm-delay': `${delay}ms` } as CSSProperties} d={`M${LANDMARK_W / 2} ${LANDMARK_H}L${LANDMARK_W / 2 + placed.dx} ${LANDMARK_H + placed.dy}`} />}
      <g className="lm-pop" data-pop={pop ? 'on' : undefined} style={{ '--lm-dx': `${placed.dx.toFixed(1)}px`, '--lm-dy': `${placed.dy.toFixed(1)}px`, '--lm-delay': `${delay}ms` } as CSSProperties}>
        <rect width={LANDMARK_W} height={LANDMARK_H} fill="none" />
        <g transform={`scale(${ART_SCALE})`} stroke={INK} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
          <ellipse cx="20" cy="43" rx="14" ry="2.2" fill={INK} stroke="none" opacity=".16" />
          {art}
        </g>
      </g>
    </g>
  );
}
