import type { ReactNode } from 'react';
import type { Pace as PaceT } from '../types';
import './Rate.css';

// Simple scenes for each pace: a busy zigzag route, a sun over one stop, a hammock under a palm.
const ART: Record<PaceT, ReactNode> = {
  0: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path className="pa-route" d="M6 50 L18 22 L30 44 L42 14 L58 38" />
      {[[6, 50], [18, 22], [30, 44], [42, 14], [58, 38]].map(([x, y]) => <circle key={x} className="pa-dot" cx={x} cy={y} r="4" />)}
    </svg>
  ),
  1: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle className="pa-sun" cx="40" cy="22" r="9" />
      <path className="pa-ray" d="M40 6v4M40 34v4M24 22h4M52 22h4M29 11l3 3M48 30l3 3M51 11l-3 3" />
      <path className="pa-route" d="M4 52 C18 40 30 58 60 44" />
      <circle className="pa-dot" cx="16" cy="46" r="4" />
    </svg>
  ),
  2: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path className="pa-trunk" d="M14 58 C16 40 18 28 22 16" />
      <path className="pa-leaf" d="M22 16 C14 10 6 14 4 20 M22 16 C26 8 36 8 40 12 M22 16 C30 14 38 20 38 26" />
      <path className="pa-hammock" d="M18 40 C30 52 44 52 56 40" />
      <path className="pa-trunk" d="M56 40 L58 58" />
      <path className="pa-wave" d="M2 60 C14 56 26 62 38 58 S56 56 62 60" />
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
