import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { IconClock, IconDown, IconExternal, IconLeft, IconPin, IconRight, IconSun, IconThumb, IconTicket, IconUp, IconWarn } from '../components/Icons';
import { buzz, motion, MOTION } from '../components/motion';
import { Cover } from '../components/PhotoCard';
import TukTuk from '../components/TukTuk';
import type { Copy } from '../state';
import type { Item, Tier } from '../types';
import { FLING, tierFor, useSwipe } from './useSwipe';
import './Rate.css';

const LABEL: Record<Tier, string> = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip' };
// Within this many px of the bottom counts as having seen the whole card.
const MORE_SLACK_PX = 24;
// Left to right the buttons mirror the swipe: left is Skip, right is Must.
const ORDER: Tier[] = ['skip', 'meh', 'keen', 'must'];
const ARROW: Record<Tier, ReactNode> = { must: <IconRight size={16} />, keen: <IconUp size={16} />, meh: <IconDown size={16} />, skip: <IconLeft size={16} /> };
const KEYS: Record<string, Tier> = { ArrowRight: 'must', ArrowUp: 'keen', ArrowDown: 'meh', ArrowLeft: 'skip' };

export { FLING, tierFor };
// One-time nudge of the first card in each direction, so a new player sees what the swipes do.
const DEMO_KEY = 'tp:swipe-demo';
const DEMO_ORDER: Tier[] = ['must', 'keen', 'skip', 'meh'];
const DEMO_STEP = 650;
const DEMO_PX = 44;
const DEMO_DIR: Record<Tier, [number, number]> = { must: [1, 0], keen: [0, -1], skip: [-1, 0], meh: [0, 1] };
const demoSeen = () => { try { return localStorage.getItem(DEMO_KEY) !== null; } catch { return true; } };

export function factPills(item: Item): [ReactNode, string][] {
  const out: [ReactNode, string][] = [[<IconClock size={14} />, `${item.hours} h`]];
  if (item.fee) out.push([<IconTicket size={14} />, item.fee]);
  if (item.when) out.push([<IconSun size={14} />, item.when]);
  return out;
}

// Reviews end in "(Name, Google review)", "(Google review)" or "(Google AI Overview)": the last comma splits a person from the source.
export function parseReview(r: string): { quote: string; name: string | null; source: string | null } {
  const m = r.match(/^([\s\S]*\S)\s*\(([^()]+)\)\s*$/);
  if (!m) return { quote: r, name: null, source: null };
  const cite = m[2].trim();
  const i = cite.lastIndexOf(', ');
  return i < 0 ? { quote: m[1], name: null, source: cite } : { quote: m[1], name: cite.slice(0, i), source: cite.slice(i + 2) };
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

interface Ghost { item: Item; tier: Tier; dx: number; dy: number; k: number }

export default function Rate({ item, next, n, total, copy, onTier }: {
  item: Item; next?: Item; n: number; total: number; copy: Copy; onTier: (t: Tier) => void;
}) {
  const extra = copy.items[item.id] ?? {};
  const [ghost, setGhost] = useState<Ghost | null>(null);

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

  const swipe = useSwipe((tier, dx, dy) => commit(tier, dx, dy), () => { demoOn.current = false; setDemo(null); });
  const { drag, reset } = swipe;

  const commit = useCallback((tier: Tier, dx = 0, dy = 0) => {
    demoOn.current = false;
    setDemo(null);
    buzz(tier);
    reset();
    setGhost({ item, tier, dx, dy, k: Date.now() });
    onTier(tier);
  }, [item, onTier, reset]);

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

  const dragLead = drag && (drag.dx !== 0 || drag.dy !== 0) ? tierFor(drag.dx, drag.dy) : null;
  const demoTier = demo !== null ? DEMO_ORDER[demo] : null;
  const lead = dragLead ?? demoTier;
  const leadAmount = drag && dragLead ? Math.min(1, Math.abs(dragLead === 'must' || dragLead === 'skip' ? drag.dx : drag.dy) / FLING) : demoTier ? 0.9 : 0;
  const [ddx, ddy] = demoTier ? DEMO_DIR[demoTier] : [0, 0];
  const cardStyle: CSSProperties | undefined = drag
    ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.05}deg)` }
    : demoTier ? { transform: `translate(${ddx * DEMO_PX}px, ${ddy * DEMO_PX}px) rotate(${ddx * 2}deg)` } : undefined;
  const rv = extra.review ? parseReview(extra.review) : null;

  // "More below" until this card's bottom has been on screen once (Brittany 2026-10-15: people missed the reviews).
  const [more, setMore] = useState(false);
  useEffect(() => {
    let seen = false;
    const check = () => {
      const left = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      if (left <= MORE_SLACK_PX) seen = true;
      setMore(!seen && left > MORE_SLACK_PX);
    };
    check();
    // Photos load after the first check and lengthen the card, so watch the page height too (absent in jsdom).
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    ro?.observe(document.body);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { ro?.disconnect(); window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [item.id]);

  return (
    <>
      <div className="body flush rate">
        <div className="rate-meta"><span className="count">{n} of {total}</span></div>
        <div className="road" role="progressbar" aria-label="Places rated" aria-valuemin={0} aria-valuemax={total} aria-valuenow={n - 1}>
          <span className="road-line" aria-hidden="true" />
          <span className="tuktuk" aria-hidden="true" style={{ '--p': (n - 1) / Math.max(1, total) } as CSSProperties}><TukTuk width={34} idle /></span>
          <span className="palm" aria-hidden="true"><Palm /></span>
        </div>
        <div className="deck">
          {next && (
            <div className="peek" aria-hidden="true">
              <Cover item={next} className="peek-photo" named={false} />
            </div>
          )}
          {ghost && (
            <div key={ghost.k} className={`card ghost fly-${ghost.tier}`} aria-hidden="true"
              style={{ '--gx': `${ghost.dx}px`, '--gy': `${ghost.dy}px`, '--gr': `${ghost.dx * 0.05}deg` } as CSSProperties}>
              <Cover item={ghost.item} className="ghost-photo" named={false}><div className="scrim" /></Cover>
              <span className={`stamp ${ghost.tier}`}>{LABEL[ghost.tier]}</span>
            </div>
          )}
          <div key={item.id} className={`card${drag ? ' dragging' : ''}`} style={{ viewTransitionName: vtName(item.id), ...cardStyle }}
            {...swipe.bind}>
            <Cover item={item} className="photo" named={false} credit>
              <div className="scrim" />
              <span className="area-tag stamp-label solid"><IconPin size={13} />{item.category ? `${item.area} · ${item.category}` : item.area}</span>
              {(['must', 'keen', 'meh', 'skip'] as Tier[]).map(t => (
                <span key={t} className={`stamp ${t}`} aria-hidden="true" style={{ opacity: lead === t ? leadAmount : 0 }}>{LABEL[t]}</span>
              ))}
            </Cover>
            <div className="info">
              <h2 className="title">{item.name}</h2>
              <div className="pills">
                {factPills(item).map(([icon, text]) => <span key={text} className="pill">{icon}<span>{text}</span></span>)}
              </div>
              {item.about && <p className="about">{item.about}</p>}
              {item.warn && <div className="fact-warn"><IconWarn size={16} /><span><b>Heads up:</b> {item.warn}</span></div>}
              {rv && (
                <figure className="review">
                  <figcaption className="review-head">
                    {rv.name && <span className="review-badge" aria-hidden="true">{Array.from(rv.name)[0].toUpperCase()}</span>}
                    <span className="review-who">
                      {rv.name && <b className="review-name">{rv.name}</b>}
                      {rv.source && <span className="review-source">{rv.source}</span>}
                    </span>
                  </figcaption>
                  <blockquote className="review-quote">
                    {extra.reviewUrl ? <a href={extra.reviewUrl} target="_blank" rel="noopener noreferrer">{rv.quote}</a> : rv.quote}
                  </blockquote>
                </figure>
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
        </div>
      </div>
      <div className="tiers">
        {more && (
          <button className="rate-more" onClick={() => window.scrollBy({ top: window.innerHeight * 0.6, behavior: motion() === 'full' ? 'smooth' : 'auto' })}>
            More below<IconDown size={14} />
          </button>
        )}
        {ORDER.map(t => (
          <button key={t} className={`t ${t}`} onClick={() => commit(t)}>
            <span className="t-ico">{ARROW[t]}</span>{LABEL[t]}
          </button>
        ))}
      </div>
    </>
  );
}
