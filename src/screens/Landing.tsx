import { useEffect, useState } from 'react';
import { motion } from '../components/motion';
import type { Item } from '../types';
import './Landing.css';

const SLIDE_MS = 6000;

/** Entry screen: the cover slideshow behind two big cards. Slideshow markup and CSS (.intro, .slides) are Name's. */
export default function Landing({ covers = [], onTrip, onGuest }: { covers?: Item[]; onTrip(): void; onGuest(): void }) {
  const [mode] = useState(motion);
  const [slide, setSlide] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const shots = covers.filter(c => c.photo && !broken.has(c.id)).slice(0, 6);
  const current = shots.length ? shots[slide % shots.length] : undefined;

  useEffect(() => {
    if (mode !== 'full' || shots.length < 2) return;
    const t = setInterval(() => setSlide(s => s + 1), SLIDE_MS);
    return () => clearInterval(t);
  }, [mode, shots.length]);

  return (
    <div className="intro landing">
      <div className="slides" aria-hidden="true">
        {shots.map(c => (
          <img key={c.id} src={`/img/${c.photo}.jpg`} alt="" className={c === current ? 'on' : ''}
            onError={() => setBroken(b => new Set(b).add(c.id))} />
        ))}
      </div>
      <div className="landing-scrim" />
      <main className="landing-body">
        <h1 className="landing-title">The Homecoming</h1>
        <div className="landing-cards">
          <button type="button" className="landing-card primary" onClick={onTrip}>
            <span className="landing-h">I'm on the trip</span>
            <span className="landing-sub">Use your trip password</span>
          </button>
          <button type="button" className="landing-card" onClick={onGuest}>
            <span className="landing-h">Try it as a guest</span>
            <span className="landing-sub">Look around. Nothing you do is saved.</span>
          </button>
        </div>
      </main>
    </div>
  );
}
