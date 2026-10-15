import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Avatar from '../components/Avatar';
import { IconDown } from '../components/Icons';
import { motion } from '../components/motion';
import type { Copy } from '../state';
import { PEOPLE } from '../types';
import type { Item, Person } from '../types';

// Placeholder until flights are booked: early December 2026.
export const DEPARTURE = '2026-12-05';
const SLIDE_MS = 4500;
const AUTO_OPEN_MS = 3600;
const FLASH_MS = 900;

export function daysUntil(date: string, now = new Date()): number {
  const [y, m, d] = date.split('-').map(Number);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

type Players = NonNullable<Copy['players']>;

export default function Name({ welcome, welcomeSub, covers = [], players = {}, onPick }: {
  welcome: string; welcomeSub?: string; covers?: Item[]; players?: Players; onPick: (p: Person) => void;
}) {
  const [still] = useState(() => motion() !== 'full');
  const [open, setOpen] = useState(still);
  const [slide, setSlide] = useState(() => (still ? 0 : Math.floor(Math.random() * 6)));
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Person | null>(null);
  const [flash, setFlash] = useState<Person | null>(null);
  const shots = covers.filter(c => c.photo && !broken.has(c.id));
  const left = daysUntil(DEPARTURE);

  useEffect(() => {
    if (still || shots.length < 2) return;
    const t = setInterval(() => setSlide(s => s + 1), SLIDE_MS);
    return () => clearInterval(t);
  }, [still, shots.length]);

  // The intro never blocks: it opens itself, and a tap, scroll or key opens it sooner.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => setOpen(true), AUTO_OPEN_MS);
    const reveal = (e: Event) => { if (!(e instanceof KeyboardEvent) || e.key !== 'Tab') setOpen(true); };
    window.addEventListener('wheel', reveal, { passive: true });
    window.addEventListener('keydown', reveal);
    return () => { clearTimeout(t); window.removeEventListener('wheel', reveal); window.removeEventListener('keydown', reveal); };
  }, [open]);

  // Under tests one tap picks and continues; people get a preview card first, then a second tap plays.
  const go = (p: Person) => {
    if (flash) return;
    if (still) { onPick(p); return; }
    setFlash(p);
    setTimeout(() => onPick(p), FLASH_MS);
  };
  const tap = (p: Person) => {
    if (motion() === 'still' || chosen === p) go(p);
    else setChosen(p);
  };
  const card = chosen ? players[chosen] : undefined;
  const stats = (card?.stats ?? [])
    .filter(st => st.label && Number.isFinite(st.value))
    .map(st => ({ label: st.label, value: Math.max(0, Math.min(10, st.value)) }));
  const current = shots.length ? shots[slide % shots.length] : undefined;
  const words = welcome.split(/\s+/).filter(Boolean);

  return (
    <div className={`welcome${open ? ' open' : ''}${flash ? ' shake' : ''}`}>
      <div className="intro scene" onPointerDown={() => setOpen(true)}>
        <div className="slides" aria-hidden="true">
          {shots.map((c, i) => (
            <img key={c.id} src={`/img/${c.photo}.jpg`} alt="" className={c === current ? 'on' : ''}
              style={{ animationDelay: `${-i * 3}s` }}
              onError={() => setBroken(b => new Set(b).add(c.id))} />
          ))}
        </div>
        <div className="warm" />
        <div className="scrim" />
        <div className="intro-copy">
          {left >= 0 && (
            <span className="countdown"><span className="live" aria-hidden="true" />{left === 0 ? 'Departing today' : `Departing in ${left} day${left === 1 ? '' : 's'}`}</span>
          )}
          {welcome && (
            <h1 className="big display">
              {words.flatMap((w, i) => {
                const word = <span key={i} className="w" style={{ '--i': i } as CSSProperties}>{w}</span>;
                return i === 0 ? [word] : [' ', word];
              })}
            </h1>
          )}
          {welcome && welcomeSub && <div className="sub" style={{ '--i': words.length } as CSSProperties}>{welcomeSub}</div>}
          {!open && <button className="cue" onClick={() => setOpen(true)}>Choose your player<IconDown size={18} /></button>}
        </div>
        {current?.credit && <span className="credit">Photo: {current.name}, {current.credit}</span>}
      </div>
      {open && (
        <div className="select">
          <div className="select-head">
            <h2 className="choose">Choose your player</h2>
            <div className="sub">One link for all five of us. Tap your name, no account or password.</div>
          </div>
          <div className="roster">
            {PEOPLE.map((n, i) => (
              <button key={n} className={`player${chosen === n ? ' on' : ''}`} aria-pressed={chosen === n} onClick={() => tap(n)}
                style={{ animationDelay: `${i * 60}ms` }}>
                <Avatar name={n} size={68} />
                <span className="player-name">{n}</span>
              </button>
            ))}
          </div>
          {chosen && (
            <div className="player-card" key={chosen}>
              <div className="pc-top">
                <Avatar name={chosen} size={60} />
                <div className="pc-id">
                  <span className="pc-name">{chosen}</span>
                  {card?.title && <span className="pc-title">{card.title}</span>}
                </div>
              </div>
              {stats.length > 0 && (
                <div className="stats">
                  {stats.map((st, i) => (
                    <div key={st.label} className="stat">
                      <span className="stat-label">{st.label}</span>
                      <span className="bar" role="meter" aria-label={st.label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={st.value}>
                        <span style={{ '--v': st.value / 10, '--i': i } as CSSProperties} />
                      </span>
                      <span className="stat-val">{st.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="cta play" onClick={() => go(chosen)}>Play as {chosen}</button>
            </div>
          )}
        </div>
      )}
      {flash && (
        <div className="flash" aria-hidden="true">
          <span className="flash-kicker">Player selected</span>
          <span className="flash-name">{flash}</span>
        </div>
      )}
    </div>
  );
}
