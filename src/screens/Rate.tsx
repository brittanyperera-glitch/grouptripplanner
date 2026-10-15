import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react';
import { IconClock, IconDown, IconExternal, IconLeft, IconPin, IconRight, IconSun, IconThumb, IconTicket, IconUp, IconWarn } from '../components/Icons';
import { buzz, motion, MOTION } from '../components/motion';
import { Cover } from '../components/PhotoCard';
import TukTuk from '../components/TukTuk';
import type { Copy } from '../state';
import type { Item, Tier } from '../types';

const LABEL: Record<Tier, string> = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip' };
// Left to right the buttons mirror the swipe: left is Skip, right is Must.
const ORDER: Tier[] = ['skip', 'meh', 'keen', 'must'];
const ARROW: Record<Tier, ReactNode> = { must: <IconRight size={16} />, keen: <IconUp size={16} />, meh: <IconDown size={16} />, skip: <IconLeft size={16} /> };
const KEYS: Record<string, Tier> = { ArrowRight: 'must', ArrowUp: 'keen', ArrowDown: 'meh', ArrowLeft: 'skip' };

// A drag this far along one axis rates the card; a quick flick counts from FLICK_MIN at FLICK_SPEED px/ms.
export const FLING = 100;
// One-time nudge of the first card in each direction, so a new player sees what the swipes do.
const DEMO_KEY = 'tp:swipe-demo';
const DEMO_ORDER: Tier[] = ['must', 'keen', 'skip', 'meh'];
const DEMO_STEP = 650;
const DEMO_PX = 44;
const DEMO_DIR: Record<Tier, [number, number]> = { must: [1, 0], keen: [0, -1], skip: [-1, 0], meh: [0, 1] };
const demoSeen = () => { try { return localStorage.getItem(DEMO_KEY) !== null; } catch { return true; } };
const FLICK_MIN = 40;
const FLICK_SPEED = 0.5;

export function tierFor(dx: number, dy: number): Tier {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'must' : 'skip';
  return dy < 0 ? 'keen' : 'meh';
}

export function factPills(item: Item): [ReactNode, string][] {
  const out: [ReactNode, string][] = [[<IconClock size={14} />, `${item.hours} h`]];
  if (item.fee) out.push([<IconTicket size={14} />, item.fee]);
  if (item.when) out.push([<IconSun size={14} />, item.when]);
  return out;
}

// Reviews end in "(Name, Google review)": the source becomes the citation line.
function splitReview(r: string): [string, string | null] {
  const m = r.match(/^([\s\S]*\S)\s*\(([^()]+)\)\s*$/);
  return m ? [m[1], m[2]] : [r, null];
}

// Shared-element name: the rated card's photo morphs into the same place's compare card.
export const vtName = (id: string) => `pic-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;

function Palm() {
  return (
    <svg viewBox="0 0 28 28" width="24" height="24">
      <path d="M2 25c6-3 18-3 24 0" stroke="#FFC15E" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M14 24c0-6 1-11 3-15" stroke="#C98B4E" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M17 9c-3-3-8-3-10 0M17 9c1-4 6-6 9-4M17 9c4-1 8 2 8 5M17 9c-2 2-3 5-2 8" stroke="#2BB673" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

interface Drag { dx: number; dy: number }
interface Ghost { item: Item; tier: Tier; dx: number; dy: number; k: number }

export default function Rate({ item, next, n, total, copy, onTier }: {
  item: Item; next?: Item; n: number; total: number; copy: Copy; onTier: (t: Tier) => void;
}) {
  const extra = copy.items[item.id] ?? {};
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const last = useRef<{ x: number; y: number; t: number; vx: number; vy: number } | null>(null);

  const [playDemo] = useState(() => n === 1 && motion() === 'full' && !demoSeen());
  const [demo, setDemo] = useState<number | null>(playDemo ? 0 : null);
  const demoOn = useRef(playDemo);
  useEffect(() => {
    if (!playDemo) return;
    try { localStorage.setItem(DEMO_KEY, '1'); } catch { /* storage unavailable: the demo may replay */ }
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      if (!demoOn.current || i >= DEMO_ORDER.length) { clearInterval(t); demoOn.current = false; setDemo(null); } else setDemo(i);
    }, DEMO_STEP);
    return () => clearInterval(t);
  }, [playDemo]);

  const commit = useCallback((tier: Tier, dx = 0, dy = 0) => {
    demoOn.current = false;
    setDemo(null);
    buzz(tier);
    start.current = null;
    setDrag(null);
    setGhost({ item, tier, dx, dy, k: Date.now() });
    onTier(tier);
  }, [item, onTier]);

  useEffect(() => {
    if (!ghost) return;
    const t = setTimeout(() => setGhost(null), MOTION.slow);
    return () => clearTimeout(t);
  }, [ghost]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || el?.closest('input, select, textarea')) return;
      const tier = KEYS[e.key];
      if (!tier) return;
      e.preventDefault();
      commit(tier);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commit]);

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a, button')) return;
    demoOn.current = false;
    setDemo(null);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    last.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, vx: 0, vy: 0 };
    setDrag({ dx: 0, dy: 0 });
  };
  const moveTo = (e: RPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const l = last.current;
    if (l) {
      const dt = e.timeStamp - l.t;
      last.current = dt > 0 ? { x: e.clientX, y: e.clientY, t: e.timeStamp, vx: (e.clientX - l.x) / dt, vy: (e.clientY - l.y) / dt } : { ...l, x: e.clientX, y: e.clientY };
    }
    setDrag({ dx: e.clientX - s.x, dy: e.clientY - s.y });
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const tier = tierFor(dx, dy);
    const horizontal = tier === 'must' || tier === 'skip';
    const dist = Math.abs(horizontal ? dx : dy);
    const speed = Math.abs(horizontal ? last.current?.vx ?? 0 : last.current?.vy ?? 0);
    if (dist >= FLING || (dist >= FLICK_MIN && speed >= FLICK_SPEED)) commit(tier, dx, dy);
    else { start.current = null; setDrag(null); }
  };
  const cancel = () => { start.current = null; setDrag(null); };

  const dragLead = drag && (drag.dx !== 0 || drag.dy !== 0) ? tierFor(drag.dx, drag.dy) : null;
  const demoTier = demo !== null ? DEMO_ORDER[demo] : null;
  const lead = dragLead ?? demoTier;
  const leadAmount = drag && dragLead ? Math.min(1, Math.abs(dragLead === 'must' || dragLead === 'skip' ? drag.dx : drag.dy) / FLING) : demoTier ? 0.9 : 0;
  const [ddx, ddy] = demoTier ? DEMO_DIR[demoTier] : [0, 0];
  const cardStyle: CSSProperties | undefined = drag
    ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.05}deg)` }
    : demoTier ? { transform: `translate(${ddx * DEMO_PX}px, ${ddy * DEMO_PX}px) rotate(${ddx * 2}deg)` } : undefined;
  const [quote, cite] = extra.review ? splitReview(extra.review) : ['', null];

  return (
    <>
      <div className="body flush rate">
        <div className="road" role="progressbar" aria-label="Places rated" aria-valuemin={0} aria-valuemax={total} aria-valuenow={n - 1}>
          <span className="road-line" aria-hidden="true" />
          <span className="tuktuk" aria-hidden="true" style={{ '--p': (n - 1) / Math.max(1, total) } as CSSProperties}><TukTuk width={34} idle /></span>
          <span className="palm" aria-hidden="true"><Palm /></span>
        </div>
        <div className="deck">
          {next && (
            <div className="peek scene" aria-hidden="true">
              <Cover item={next} className="peek-photo" named={false} />
            </div>
          )}
          {ghost && (
            <div key={ghost.k} className={`card ghost scene fly-${ghost.tier}`} aria-hidden="true"
              style={{ '--gx': `${ghost.dx}px`, '--gy': `${ghost.dy}px`, '--gr': `${ghost.dx * 0.05}deg` } as CSSProperties}>
              <Cover item={ghost.item} className="ghost-photo" named={false}><div className="scrim" /></Cover>
              <span className={`stamp ${ghost.tier}`}>{LABEL[ghost.tier]}</span>
            </div>
          )}
          <div key={item.id} className={`card scene${drag ? ' dragging' : ''}`} style={{ viewTransitionName: vtName(item.id), ...cardStyle }}
            onPointerDown={down} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={cancel}>
            <Cover item={item} className="photo" named={false} credit>
              <div className="scrim" />
              <span className="count">{n} of {total}</span>
              {(['must', 'keen', 'meh', 'skip'] as Tier[]).map(t => (
                <span key={t} className={`stamp ${t}`} aria-hidden="true" style={{ opacity: lead === t ? leadAmount : 0 }}>{LABEL[t]}</span>
              ))}
              <div className="caption">
                <span className="area-tag"><IconPin size={13} />{item.category ? `${item.area} · ${item.category}` : item.area}</span>
                <h2 className="title">{item.name}</h2>
              </div>
            </Cover>
          </div>
        </div>
        <div className="info">
          <div className="pills">
            {factPills(item).map(([icon, text]) => <span key={text} className="pill">{icon}<span>{text}</span></span>)}
          </div>
          {item.about && <p className="about">{item.about}</p>}
          {item.warn && <div className="fact-warn"><IconWarn size={16} /><span><b>Heads up:</b> {item.warn}</span></div>}
          {extra.review && (
            <blockquote className="review">
              <p>{extra.reviewUrl ? <a href={extra.reviewUrl} target="_blank" rel="noopener noreferrer">{quote}</a> : quote}</p>
              {cite && <cite>{cite}</cite>}
            </blockquote>
          )}
          {extra.take && <div className="take"><b>Brittany:</b> {extra.take}</div>}
          {extra.approved && (
            <div className="approved">
              <span className="approved-stamp"><IconThumb size={15} className="icon-thumb" />Brittany approved</span>
              <div className="approved-note">Only because I've been and can vouch for it. The others aren't necessarily bad.</div>
            </div>
          )}
          {item.google && (
            <a className="gr" href={item.google.url} target="_blank" rel="noopener noreferrer">See it on Google Maps<IconExternal size={15} /></a>
          )}
        </div>
      </div>
      <div className="tiers">
        {ORDER.map(t => (
          <button key={t} className={`t ${t}`} onClick={() => commit(t)}>
            <span className="t-ico">{ARROW[t]}</span>{LABEL[t]}
          </button>
        ))}
      </div>
    </>
  );
}
