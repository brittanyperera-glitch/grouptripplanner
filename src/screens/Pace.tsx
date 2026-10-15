import type { ReactNode } from 'react';
import type { Pace as PaceT } from '../types';

// Simple scenes for each pace: a busy zigzag route, a sun over one stop, a hammock under a palm.
const ART: Record<PaceT, ReactNode> = {
  0: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M6 50 L18 22 L30 44 L42 14 L58 38" fill="none" stroke="#FFC15E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {[[6, 50], [18, 22], [30, 44], [42, 14], [58, 38]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill="#FF7A1A" />)}
    </svg>
  ),
  1: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="40" cy="22" r="9" fill="#FFC15E" />
      <path d="M40 6v4M40 34v4M24 22h4M52 22h4M29 11l3 3M48 30l3 3M51 11l-3 3" stroke="#FFC15E" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M4 52 C18 40 30 58 60 44" fill="none" stroke="#FF7A1A" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="46" r="4" fill="#FF7A1A" />
    </svg>
  ),
  2: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 58 C16 40 18 28 22 16" fill="none" stroke="#C98B4E" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 16 C14 10 6 14 4 20 M22 16 C26 8 36 8 40 12 M22 16 C30 14 38 20 38 26" fill="none" stroke="#2BB673" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 40 C30 52 44 52 56 40" fill="none" stroke="#FFC15E" strokeWidth="3" strokeLinecap="round" />
      <path d="M56 40 L58 58" stroke="#C98B4E" strokeWidth="3" strokeLinecap="round" />
      <path d="M2 60 C14 56 26 62 38 58 S56 56 62 60" fill="none" stroke="#7FD3FF" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
};

const OPTIONS: [PaceT, string, string][] = [
  [0, 'Pack it in', 'early starts, move every 1 to 2 nights'],
  [1, 'Balanced', 'one big thing a day, some free afternoons'],
  [2, 'Slow', 'fewer stops, longer in each'],
];

export default function Pace({ pace, onPick, onBack }: { pace: PaceT | null; onPick: (p: PaceT) => void; onBack: () => void }) {
  return (
    <div className="body">
      <div className="kicker">Step 2 of 3</div>
      <div className="big display">How packed?</div>
      <div className="sub">It changes how much fits per day, not how long anything takes.</div>
      <div className="paces">
        {OPTIONS.map(([p, label, hint]) => (
          <button key={p} className="pace" aria-pressed={pace === p} onClick={() => onPick(p)}>
            <span className="pace-art">{ART[p]}</span>
            <span className="pace-txt"><b>{label}</b> <span>{hint}</span></span>
          </button>
        ))}
      </div>
      <button className="cta alt" onClick={onBack}>Back</button>
    </div>
  );
}
