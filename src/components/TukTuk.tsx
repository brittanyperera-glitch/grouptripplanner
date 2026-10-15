import './TukTuk.css';
import { motion } from './motion';

// Postcard palette (docs/theme-postcard.md): red body, teal roof, white plate, ink wheels; the glass is a pale teal tint.
const RED = '#d6452c', TEAL = '#1f6f6b', WHITE = '#fff', INK = '#1e2a26', MUTED = '#56615c', GLASS = '#d9ece8';

/**
 * The app's tuk-tuk, faces right. `driving` wobbles and puffs, `idle` putters in place; both only with motion on.
 * `width` is in px; the height follows the 72 x 60 art.
 */
export default function TukTuk({ width = 72, driving = false, idle = false, className }: { width?: number; driving?: boolean; idle?: boolean; className?: string }) {
  const on = motion() === 'full';
  return (
    <svg viewBox="0 0 72 60" width={width} height={(width * 60) / 72} className={`tuk${className ? ` ${className}` : ''}`} aria-hidden="true"
      data-tuktuk="" data-driving={String(driving && on)} data-idle={String(idle && !driving && on)} overflow="visible">
      <ellipse cx="37" cy="55.5" rx="27" ry="3.4" fill={INK} opacity=".18" />
      <g className="tuk-puffs" fill={MUTED} opacity=".8">
        <circle cx="5" cy="44" r="2.6" /><circle cx="0" cy="40" r="2" /><circle cx="-4" cy="35" r="1.4" />
      </g>
      <g className="tuk-body">
        <path d="M31 10.5v3M41 10.5v3" stroke={INK} strokeWidth="1.6" />
        <rect x="24" y="2" width="24" height="9.5" rx="2" fill={WHITE} stroke={INK} strokeWidth="1.6" />
        <text x="36" y="9.6" textAnchor="middle" fontFamily="'Barlow Condensed', Archivo, sans-serif" fontWeight="800" fontSize="8.4" letterSpacing=".6" fill={RED}>TUK</text>
        <path d="M8 27Q8 13.5 22 13.5H50Q60 13.5 63 27Z" fill={TEAL} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <path d="M22 13.5Q16 20 16 27M36 13.5V27M50 13.5Q56 20 56 27" stroke={WHITE} strokeWidth="1.2" opacity=".35" fill="none" />
        <path d="M7 27H63L67 39Q67 46.5 60 46.5H13Q6 46.5 6 39Z" fill={RED} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <rect x="11" y="29" width="12" height="12" rx="2" fill={INK} />
        <rect x="26" y="29.5" width="17" height="8.5" rx="2" fill={GLASS} stroke={INK} strokeWidth="1.4" />
        <path d="M47 29.5H59.5L62.5 38H47Z" fill={GLASS} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M49 31.5l3 0M28 31.5h4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
        <rect x="7" y="41" width="59" height="2.6" fill={WHITE} />
        <circle cx="64.5" cy="34" r="2.6" fill={WHITE} stroke={INK} strokeWidth="1.4" />
      </g>
      {[18, 57].map(cx => (
        <g key={cx} className="tuk-wheel" style={{ transformOrigin: `${cx}px 48px` }}>
          <circle cx={cx} cy="48" r="7.2" fill={INK} stroke={INK} strokeWidth="1.2" />
          <circle cx={cx} cy="48" r="3.4" fill={WHITE} />
          <path d={`M${cx - 3.4} 48h6.8M${cx} 44.6v6.8`} stroke={RED} strokeWidth="1.3" />
        </g>
      ))}
    </svg>
  );
}
