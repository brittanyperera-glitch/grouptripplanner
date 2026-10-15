import { useState } from 'react';
import { motion } from '../components/motion';
import './PhraseCards.css';

export type Phrase = { english: string; sinhala: string; say: string };
type View = 'list' | 'cards';

const KEY = 'tp:phrase-view';
const readView = (): View => {
  try { return localStorage.getItem(KEY) === 'cards' ? 'cards' : 'list'; } catch { return 'list'; }
};
const saveView = (v: View) => { try { localStorage.setItem(KEY, v); } catch { /* storage blocked: the choice just won't stick */ } };

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function Deck({ phrases }: { phrases: Phrase[] }) {
  const [order, setOrder] = useState(() => phrases.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const n = order.length;
  const p = phrases[order[pos]];
  // Reduced motion and webdriver: an instant swap, no 3D (src/components/motion.ts).
  const flat = motion() !== 'full';
  const go = (d: number) => { setPos(i => (i + d + n) % n); setFlipped(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    setTouchX(null);
    if (Math.abs(dx) > 40) { e.preventDefault(); go(dx < 0 ? 1 : -1); }
  };
  return (
    <div className="pc-deck" onKeyDown={onKey}>
      <button
        type="button"
        className="pc-card"
        data-flipped={flipped}
        data-flat={flat}
        aria-label={flipped ? `${p.english}. Showing the Sinhala. Tap to flip back.` : `${p.english}. Tap to show the Sinhala.`}
        onClick={() => setFlipped(f => !f)}
        onTouchStart={e => setTouchX(e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
      >
        <span className="pc-inner">
          <span className="pc-face pc-front" aria-hidden={flipped}>
            <span className="pc-tag">English</span>
            <span className="pc-en">{p.english}</span>
            <span className="pc-hint">Tap to flip</span>
          </span>
          <span className="pc-face pc-back" aria-hidden={!flipped}>
            <span className="pc-tag">Sinhala</span>
            <span className="pc-si">{p.sinhala}</span>
            <span className="pc-say">{p.say}</span>
          </span>
        </span>
      </button>
      <p className="pc-count" aria-live="polite">{pos + 1} of {n}</p>
      <div className="pc-nav">
        <button type="button" className="pc-btn" onClick={() => go(-1)}>Prev</button>
        <button type="button" className="pc-btn" onClick={() => { setOrder(shuffled(n)); setPos(0); setFlipped(false); }}>Shuffle</button>
        <button type="button" className="pc-btn" onClick={() => go(1)}>Next</button>
      </div>
    </div>
  );
}

export default function PhrasePanel({ phrases }: { phrases: Phrase[] }) {
  const [view, setView] = useState<View>(readView);
  const pick = (v: View) => { setView(v); saveView(v); };
  return (
    <>
      <div className="pc-toggle" role="group" aria-label="Phrase view">
        <button type="button" aria-pressed={view === 'list'} onClick={() => pick('list')}>List</button>
        <button type="button" aria-pressed={view === 'cards'} onClick={() => pick('cards')}>Flash cards</button>
      </div>
      {view === 'cards' ? <Deck phrases={phrases} /> : (
        <ul className="guide-phrases">
          {phrases.map(p => (
            <li key={p.english}>
              <span className="gp-en">{p.english}</span>
              <span className="gp-si">{p.sinhala}</span>
              <span className="gp-say">{p.say}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
