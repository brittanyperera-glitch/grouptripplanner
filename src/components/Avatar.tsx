import type { ReactNode } from 'react';
import { PEOPLE } from '../types';
import type { Person } from '../types';

// One look per friend, picked by roster position so it never changes between visits.
interface Look { bg: [string, string]; skin: string; hair: string; shirt: string; style: 'bun' | 'swoop' | 'curls' | 'buzz' | 'waves'; extra: 'shades' | 'cap' | 'headphones' | 'bucket' | 'flower' }
const LOOKS: Look[] = [
  { bg: ['#FF7A1A', '#FF4D6D'], skin: '#C98E6A', hair: '#2B1A12', shirt: '#FFE2B8', style: 'bun', extra: 'flower' },
  { bg: ['#2BB673', '#1B6E8F'], skin: '#F0C7A4', hair: '#7A4A22', shirt: '#14161C', style: 'swoop', extra: 'shades' },
  { bg: ['#4FB3E8', '#6A4CE0'], skin: '#E8B894', hair: '#D9A441', shirt: '#FF7A1A', style: 'buzz', extra: 'headphones' },
  { bg: ['#FFC15E', '#FF7A1A'], skin: '#F2CBA8', hair: '#5A3A24', shirt: '#2BB673', style: 'waves', extra: 'bucket' },
  { bg: ['#B07CFF', '#FF4D6D'], skin: '#D9A07A', hair: '#1A1410', shirt: '#F6F2EC', style: 'curls', extra: 'cap' },
];

function hair(l: Look): ReactNode {
  switch (l.style) {
    case 'bun': return <><circle cx="40" cy="15" r="7" fill={l.hair} /><path d="M24 34c0-11 7-17 16-17s16 6 16 17c-4-6-9-8-16-8s-12 2-16 8z" fill={l.hair} /></>;
    case 'swoop': return <path d="M23 33c0-12 8-18 18-18 8 0 15 5 15 14-6-5-13-3-20-7-3 4-8 7-13 11z" fill={l.hair} />;
    case 'buzz': return <path d="M25 31c0-9 7-14 15-14s15 5 15 14c-3-3-9-5-15-5s-12 2-15 5z" fill={l.hair} />;
    case 'waves': return <path d="M23 36c-2-13 6-20 17-20s19 7 17 20c-2-5-5-7-8-7-2 3-6 3-9 0-3 3-7 3-9 0-3 0-6 2-8 7z" fill={l.hair} />;
    case 'curls': return <g fill={l.hair}>{[[27, 26], [33, 20], [40, 18], [47, 20], [53, 26], [30, 31], [50, 31]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="6" />)}</g>;
  }
}

function extra(l: Look): ReactNode {
  switch (l.extra) {
    case 'shades': return <g><rect x="28" y="34" width="10" height="6" rx="2.5" fill="#101418" /><rect x="42" y="34" width="10" height="6" rx="2.5" fill="#101418" /><path d="M38 36h4" stroke="#101418" strokeWidth="1.6" /></g>;
    case 'cap': return <g><path d="M25 27c1-8 7-12 15-12s14 4 15 12z" fill="#FF7A1A" /><path d="M48 27h14c0 2-2 3-4 3H50z" fill="#E0600A" /></g>;
    case 'headphones': return <g fill="none" stroke="#101418" strokeWidth="3"><path d="M24 38c0-12 7-19 16-19s16 7 16 19" /><rect x="20" y="35" width="7" height="10" rx="3" fill="#FF4D6D" stroke="none" /><rect x="53" y="35" width="7" height="10" rx="3" fill="#FF4D6D" stroke="none" /></g>;
    case 'bucket': return <g><path d="M27 26c1-7 6-10 13-10s12 3 13 10z" fill="#FFF4E6" /><path d="M21 28h38c0 2-2 3-5 3H26c-3 0-5-1-5-3z" fill="#F2E3CF" /></g>;
    case 'flower': return <g><circle cx="54" cy="24" r="3" fill="#FFE27A" />{[0, 72, 144, 216, 288].map(a => <circle key={a} cx={54 + Math.cos((a * Math.PI) / 180) * 4} cy={24 + Math.sin((a * Math.PI) / 180) * 4} r="2.6" fill="#FF4D6D" />)}</g>;
  }
}

/** Stylised head-and-shoulders portrait; decorative, so the control beside it carries the name. */
export default function Avatar({ name, size = 80 }: { name: Person; size?: number }) {
  const l = LOOKS[Math.max(0, PEOPLE.indexOf(name)) % LOOKS.length];
  const id = `av-${name}`;
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden="true" focusable="false" className="avatar-art">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={l.bg[0]} /><stop offset="1" stopColor={l.bg[1]} /></linearGradient>
      </defs>
      <rect width="80" height="80" rx="20" fill={`url(#${id})`} />
      <path d="M12 80c2-15 13-22 28-22s26 7 28 22z" fill={l.shirt} />
      <path d="M35 50h10v9c0 3-10 3-10 0z" fill={l.skin} />
      <ellipse cx="40" cy="37" rx="14" ry="16" fill={l.skin} />
      {hair(l)}
      <circle cx="34.5" cy="38" r="1.8" fill="#101418" />
      <circle cx="45.5" cy="38" r="1.8" fill="#101418" />
      <path d="M35 45c3 3 7 3 10 0" stroke="#101418" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {extra(l)}
    </svg>
  );
}
