import { useState } from 'react';
import type { ReactNode } from 'react';
import { IconInfinity, IconMinus, IconPlus } from '../components/Icons';
import './Rate.css';

const MIN = 5;
const MAX = 21;

export default function Days({ days, flex, onPick }: {
  days: number | null; flex: boolean; onPick: (days: number, flex: boolean) => void;
}) {
  const [custom, setCustom] = useState(days !== null && !flex && days !== 9 && days !== 14);
  const [n, setN] = useState(days !== null && days >= MIN && days <= MAX ? days : 11);
  const fixed = (v: number) => !custom && !flex && days === v;
  // [big, label, hint, selected, action]: the big glyph is decorative so each tile's name starts with its label.
  const opts: [ReactNode, string, string, boolean, () => void][] = [
    ['9', '9 days', '', fixed(9), () => onPick(9, false)],
    ['14', '14 days', '', fixed(14), () => onPick(14, false)],
    [<IconInfinity size={44} />, 'Flexible', 'either works', flex, () => onPick(14, true)],
    [<span className="pm"><IconMinus size={22} /><IconPlus size={22} /></span>, 'My own number', `from ${MIN} to ${MAX}`, custom, () => setCustom(true)],
  ];
  return (
    <div className="body">
      <div className="kicker">Step 1 of 3</div>
      <div className="big display">How many days can you do?</div>
      <div className="sub">Landing to take-off. Flexible counts as 14.</div>
      <div className="tiles">
        {opts.map(([big, label, hint, on, go]) => (
          <button key={label} className="tile" aria-pressed={on} onClick={go}>
            <span className="tile-big" aria-hidden="true">{big}</span>
            <b>{label}</b>
            {hint && <span className="tile-hint">{hint}</span>}
          </button>
        ))}
      </div>
      {custom && (
        <div className="custom">
          <div className="stepper">
            <button aria-label="Fewer days" disabled={n <= MIN} onClick={() => setN(v => Math.max(MIN, v - 1))}><IconMinus /></button>
            <output aria-label="Number of days">{n}</output>
            <button aria-label="More days" disabled={n >= MAX} onClick={() => setN(v => Math.min(MAX, v + 1))}><IconPlus /></button>
          </div>
          <button className="cta" onClick={() => onPick(n, false)}>Continue</button>
        </div>
      )}
    </div>
  );
}
