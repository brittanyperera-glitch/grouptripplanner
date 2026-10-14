import { useState } from 'react';

const MIN = 5;
const MAX = 21;

export default function Days({ days, flex, onPick }: {
  days: number | null; flex: boolean; onPick: (days: number, flex: boolean) => void;
}) {
  const [custom, setCustom] = useState(days !== null && !flex && days !== 9 && days !== 14);
  const [n, setN] = useState(days !== null && days >= MIN && days <= MAX ? days : 11);
  const fixed = (v: number) => !custom && !flex && days === v;
  const opts: [string, string, boolean, () => void][] = [
    ['9 days', '', fixed(9), () => onPick(9, false)],
    ['14 days', '', fixed(14), () => onPick(14, false)],
    ['Flexible', 'either works', flex, () => onPick(14, true)],
    ['My own number', 'from 5 to 21', custom, () => setCustom(true)],
  ];
  return (
    <div className="body">
      <div className="big">How many days can you do?</div>
      <div className="sub">Landing to take-off. Flexible counts as 14.</div>
      {opts.map(([label, hint, on, go]) => (
        <button key={label} className="choice" aria-pressed={on} onClick={go}><b>{label}</b><span>{hint}</span></button>
      ))}
      {custom && (
        <>
          <div className="stepper">
            <button aria-label="Fewer days" disabled={n <= MIN} onClick={() => setN(v => Math.max(MIN, v - 1))}>-</button>
            <output aria-label="Number of days">{n}</output>
            <button aria-label="More days" disabled={n >= MAX} onClick={() => setN(v => Math.min(MAX, v + 1))}>+</button>
          </div>
          <button className="cta" style={{ flex: 'none' }} onClick={() => onPick(n, false)}>Continue</button>
        </>
      )}
    </div>
  );
}
