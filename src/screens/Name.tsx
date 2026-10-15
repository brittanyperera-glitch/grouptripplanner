import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Avatar from '../components/Avatar';
import { IconLeft, IconRight } from '../components/Icons';
import { motion, navigate } from '../components/motion';
import { CreditButton } from '../components/PhotoCard';
import type { Copy } from '../state';
import { PEOPLE } from '../types';
import type { Item, Person } from '../types';

const SLIDE_MS = 4500;
const FLASH_MS = 900;

type Players = NonNullable<Copy["players"]>;

function StatBars({ stats }: { stats: { label: string; value: number }[] }) {
  return (
    <div className="stats">
      {stats.map((st, i) => (
        <div key={st.label} className="stat">
          <span className="stat-label">{st.label}</span>
          {/* Joke stats can go past 10 ("ego 11", "president 100"): the bar fills, then breaks the scale. */}
          <span className={`bar${st.value > 10 ? ' over' : ''}`} role="meter" aria-label={st.label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.min(10, st.value)} aria-valuetext={String(st.value)}>
            <span style={{ '--v': Math.min(10, st.value) / 10, '--i': i } as CSSProperties} />
          </span>
          <span className="stat-val">{st.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Name({ welcome, welcomeSub, covers = [], players = {}, onPick }: {
  welcome: string; welcomeSub?: string; covers?: Item[]; players?: Players; onPick: (p: Person) => void;
}) {
  const [mode] = useState(motion);
  const still = mode === 'still';
  const bobOk = mode === 'full';
  const [page, setPage] = useState<'intro' | 'select'>('intro');
  const [slide, setSlide] = useState(() => (mode !== 'full' ? 0 : Math.floor(Math.random() * 6)));
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState<Person | null>(null);
  const [selfie, setSelfie] = useState(false);
  const lane = useRef<HTMLDivElement>(null);
  const shots = covers.filter(c => c.photo && !broken.has(c.id));
  const chosen = PEOPLE[idx];

  useEffect(() => {
    if (mode !== 'full' || shots.length < 2 || page !== 'intro') return;
    const t = setInterval(() => setSlide(s => s + 1), SLIDE_MS);
    return () => clearInterval(t);
  }, [mode, shots.length, page]);

  const centre = useCallback((i: number) => {
    const el = lane.current;
    const item = el?.children[i] as HTMLElement | undefined;
    if (!el || !item) return;
    el.scrollTo?.({ left: item.offsetLeft - (el.clientWidth - item.offsetWidth) / 2, behavior: bobOk ? 'smooth' : 'auto' });
  }, [bobOk]);
  const goTo = useCallback((i: number) => {
    const n = Math.max(0, Math.min(PEOPLE.length - 1, i));
    setIdx(n);
    centre(n);
  }, [centre]);

  useEffect(() => {
    if (page !== 'select') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(idx + 1);
      else if (e.key === 'ArrowLeft') goTo(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, idx, goTo]);

  // Swiping the carousel updates which character is centred.
  const onScroll = () => {
    const el = lane.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let gap = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const it = c as HTMLElement;
      const d = Math.abs(it.offsetLeft + it.offsetWidth / 2 - mid);
      if (d < gap) { gap = d; best = i; }
    });
    setIdx(best);
  };

  // Under tests one tap picks and continues; people centre a character first, then pick with Select.
  const go = (p: Person) => {
    if (flash) return;
    if (still) { onPick(p); return; }
    setFlash(p);
    setTimeout(() => onPick(p), FLASH_MS);
  };
  const tap = (p: Person, i: number) => {
    if (still || i === idx) go(p);
    else goTo(i);
  };
  const card = players[chosen];
  const stats = (card?.stats ?? [])
    .filter(st => st.label && Number.isFinite(st.value))
    .map(st => ({ label: st.label, value: Math.max(0, st.value) }));
  const current = shots.length ? shots[slide % shots.length] : undefined;
  const words = welcome.split(/\s+/).filter(Boolean);

  return (
    <div className={`welcome${flash ? ' shake' : ''}`}>
      {page === 'intro' ? (
        <div className="intro scene">
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
            {welcome && (
              <h1 className="big display">
                {words.flatMap((w, i) => {
                  const word = <span key={i} className="w" style={{ '--i': i } as CSSProperties}>{w}</span>;
                  return i === 0 ? [word] : [' ', word];
                })}
              </h1>
            )}
            {welcome && welcomeSub && <div className="sub" style={{ '--i': words.length } as CSSProperties}>{welcomeSub}</div>}
            <button className="cta intro-cta" onClick={() => navigate('fwd', () => setPage('select'))}>Choose your character</button>
          </div>
          {current?.credit && <CreditButton credit={current.credit} />}
        </div>
      ) : (
        <div className="select scene">
          <div className="select-head">
            <h2 className="choose">Choose your character</h2>
            <div className="sub">You kinda have to pick yourself or it won't work.</div>
          </div>
          <div className="carousel-wrap">
            <button className="nav prev" aria-label="Previous character" disabled={idx === 0} onClick={() => goTo(idx - 1)}><IconLeft size={20} /></button>
            <div className="carousel" ref={lane} onScroll={onScroll}>
              {PEOPLE.map((n, i) => (
                <button key={n} className={`char${i === idx ? ' on' : ''}`} aria-current={i === idx} onClick={() => tap(n, i)}
                  style={{ '--bop-delay': `${(i * 0.31).toFixed(2)}s` } as CSSProperties}>
                  <Avatar name={n} crop="stage" size={220} bob={bobOk} />
                  <span className="char-name">{n}</span>
                </button>
              ))}
            </div>
            <button className="nav next" aria-label="Next character" disabled={idx === PEOPLE.length - 1} onClick={() => goTo(idx + 1)}><IconRight size={20} /></button>
          </div>
          <button className="selfie-btn" onClick={() => setSelfie(true)}>Selfie</button>
          <div className="player-card" key={chosen}>
            <div className="pc-id">
              <h2 className="pc-name">{chosen}</h2>
              {card?.title && <span className="pc-title">{card.title}</span>}
            </div>
            {stats.length > 0 && <StatBars stats={stats} />}
          </div>
          <button className="cta play" onClick={() => go(chosen)}>Select</button>
        </div>
      )}
      {selfie && page === 'select' && (
        <div className="selfie-pop" role="dialog" aria-label={`${chosen} selfie`} onClick={() => setSelfie(false)}>
          <img src={`/img/players/${chosen.toLowerCase()}-selfie.png`} alt={`${chosen} selfie`} />
          <span>Tap to close</span>
        </div>
      )}
      {flash && (
        <div className="flash" aria-hidden="true">
          <span className="flash-kicker">Character selected</span>
          <span className="flash-name">{flash}</span>
        </div>
      )}
    </div>
  );
}
