import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Avatar from '../components/Avatar';
import { IconLeft, IconRight } from '../components/Icons';
import { motion, navigate } from '../components/motion';
import { CreditButton } from '../components/PhotoCard';
import type { Copy } from '../state';
import './Lockin.css';
import { PEOPLE } from '../types';
import type { Item, Player } from '../types';

const SLIDE_MS = 6000;
// Lock-in: ease in, stay readable, ease out, then continue.
export const FLASH = { in: 400, hold: 1700, out: 400 };
// Cover order on the opening: the most scenic first, the rest after.
const SCENIC = ['ninearch', 'sigiriya', 'coconut', 'galle', 'hiriketiya', 'train'];
const scenicRank = (id: string) => { const i = SCENIC.indexOf(id); return i < 0 ? SCENIC.length : i; };

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

// Sized from the real rendered width: the name shrinks until it fits the screen, whatever the name or font width.
function FlashName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    // Fit the visible app column: the fixed overlay spans the whole window on desktop, but the column clips it.
    const box = el?.closest<HTMLElement>('.app') ?? el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      el.style.fontSize = '';
      const avail = box.clientWidth - 32;
      const natural = el.offsetWidth;
      if (natural > avail) el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * avail / natural}px`;
    };
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [name]);
  return <span ref={ref} className="flash-name">{name}</span>;
}

export default function Name({ welcome, welcomeSub, covers = [], players = {}, roster = PEOPLE, onPick }: {
  welcome: string; welcomeSub?: string; covers?: Item[]; players?: Players; roster?: readonly Player[]; onPick: (p: Player) => void;
}) {
  const [mode] = useState(motion);
  const still = mode === 'still';
  const bobOk = mode === 'full';
  const [page, setPage] = useState<'intro' | 'select'>('intro');
  const [slide, setSlide] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState<Player | null>(null);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (lockTimer.current) clearTimeout(lockTimer.current); }, []);
  const [selfie, setSelfie] = useState(false);
  const lane = useRef<HTMLDivElement>(null);
  const shots = covers.filter(c => c.photo && !broken.has(c.id))
    .map((c, i) => ({ c, i })).sort((a, b) => scenicRank(a.c.id) - scenicRank(b.c.id) || a.i - b.i)
    .slice(0, 6).map(x => x.c);
  const chosen = roster[idx];

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
    const n = Math.max(0, Math.min(roster.length - 1, i));
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
  const go = (p: Player) => {
    if (flash) return;
    if (still) { onPick(p); return; }
    setFlash(p);
    lockTimer.current = setTimeout(() => finish(p), FLASH.in + FLASH.hold + FLASH.out);
  };
  // The selfie lock-in continues on its own, or straight away on a tap; onPick fires once either way.
  const finish = (p: Player) => {
    if (lockTimer.current === null) return;
    clearTimeout(lockTimer.current);
    lockTimer.current = null;
    onPick(p);
  };
  const tap = (p: Player, i: number) => {
    if (still || i === idx) go(p);
    else goTo(i);
  };
  const card = players[chosen];
  const stats = (card?.stats ?? [])
    .filter(st => st.label && Number.isFinite(st.value))
    .map(st => ({ label: st.label, value: Math.max(0, st.value) }));
  const current = shots.length ? shots[slide % shots.length] : undefined;

  return (
    <div className="welcome">
      {page === 'intro' ? (
        <div className="intro scene">
          <div className="slides" aria-hidden="true">
            {shots.map((c, i) => (
              <img key={c.id} src={`/img/${c.photo}.jpg`} alt="" className={c === current ? 'on' : ''}
                style={{ animationDelay: `${-i * 4}s` }}
                onError={() => setBroken(b => new Set(b).add(c.id))} />
            ))}
          </div>
          <div className="scrim" />
          <div className="intro-kicker">
            <span>Sri Lanka</span>
            <span>Dec 2026</span>
          </div>
          <div className="intro-copy">
            {welcome && <h1 className="intro-title">{welcome}</h1>}
            {welcome && welcomeSub && <div className="intro-sub">{welcomeSub}</div>}
          </div>
          <button className="intro-pill" onClick={() => navigate('fwd', () => setPage('select'))}>
            <span>Choose your character</span>
            <svg aria-hidden="true" width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6h19M15 1l5 5-5 5" /></svg>
          </button>
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
              {roster.map((n, i) => (
                <button key={n} className={`char${i === idx ? ' on' : ''}`} aria-label={n} aria-current={i === idx} onClick={() => tap(n, i)}
                  style={{ '--bop-delay': `${(i * 0.31).toFixed(2)}s` } as CSSProperties}>
                  <Avatar name={n} crop="stage" size={220} bob={bobOk} />
                </button>
              ))}
            </div>
            <button className="nav next" aria-label="Next character" disabled={idx === roster.length - 1} onClick={() => goTo(idx + 1)}><IconRight size={20} /></button>
          </div>
          <div className="player-card" key={chosen}>
            <div className="pc-id">
              <div className="pc-row">
                <h2 className="pc-name">{chosen}</h2>
                <button className="selfie-btn" onClick={() => setSelfie(true)}>Take a selfie</button>
              </div>
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
        <div className="flash lockin" role="dialog" aria-label={`${flash} selected`} onClick={() => finish(flash)}
          style={{ '--in': `${FLASH.in}ms`, '--hold': `${FLASH.hold}ms`, '--out': `${FLASH.out}ms` } as CSSProperties}>
          <span className="flash-polaroid"><img className="flash-selfie" src={`/img/players/${flash.toLowerCase()}-selfie.png`} alt={`${flash} selfie`} /></span>
          <span className="flash-kicker">Character selected</span>
          <FlashName name={flash} />
        </div>
      )}
    </div>
  );
}
