import type { Pace as PaceT } from '../types';

const OPTIONS: [PaceT, string, string][] = [
  [0, 'Pack it in', 'early starts, move every 1 to 2 nights'],
  [1, 'Balanced', 'one big thing a day, some free afternoons'],
  [2, 'Slow', 'fewer stops, longer in each'],
];

export default function Pace({ pace, onPick, onBack }: { pace: PaceT | null; onPick: (p: PaceT) => void; onBack: () => void }) {
  return (
    <div className="body">
      <div className="big">How packed?</div>
      <div className="sub">It changes how much fits per day, not how long anything takes.</div>
      {OPTIONS.map(([p, label, hint]) => (
        <button key={p} className="choice" aria-pressed={pace === p} onClick={() => onPick(p)}><b>{label}</b><span>{hint}</span></button>
      ))}
      <button className="cta alt" style={{ flex: 'none' }} onClick={onBack}>Back</button>
    </div>
  );
}
