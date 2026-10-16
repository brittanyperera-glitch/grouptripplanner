import { useState } from 'react';
import copy from '../content/walkthrough.json';
import type { OpenItem } from '../lib/openItems';
import { buttonFor, fill, lineFor, segments, type Segment } from '../lib/walkthrough';
import './Rate.css';
import './HowTo.css';
import './Walkthrough.css';

const Big = ({ parts }: { parts: Segment[] }) => (
  <p className="hw-sentence wt-screen">
    {parts.map((s, i) => (s.accent ? <span key={i} className="wt-accent">{s.text}</span> : <span key={i}>{s.text}</span>))}
  </p>
);

interface Props { name: string; items: OpenItem[]; onGo(item: OpenItem): void; onDone(): void }

/** Opening screen, one screen per item in the order given, then a closing screen. Persisting "seen" is the caller's call. */
export default function Walkthrough({ name, items, onGo, onDone }: Props) {
  const [step, setStep] = useState(0);
  const last = items.length + 1;
  const item = step >= 1 && step <= items.length ? items[step - 1] : null;
  const next = () => setStep(s => Math.min(s + 1, last));

  return (
    <div className="body hw" data-testid="walkthrough">
      <div className="hw-top">
        <button className="link wt-link" onClick={onDone}>{copy.skip}</button>
      </div>
      <div className="hw-stage wt-stage" key={step}>
        {step === 0 && <Big parts={segments(fill(copy.open, name))} />}
        {item && <Big parts={lineFor(item, name)} />}
        {step === last && <Big parts={segments(fill(copy.close, name))} />}
      </div>
      <div className="wt-actions">
        {item ? (
          <>
            <button className="cta wt-cta" onClick={() => { onGo(item); onDone(); }}>{buttonFor(item)}</button>
            <button className="link wt-link" onClick={next}>{copy.next}</button>
          </>
        ) : step === last ? (
          <button className="cta wt-cta" onClick={onDone}>{copy.done}</button>
        ) : (
          <button className="cta wt-cta" onClick={next}>{copy.next}</button>
        )}
      </div>
    </div>
  );
}
