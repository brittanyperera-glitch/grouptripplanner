import './Premiere.css';
import './Reveal.css';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '../components/Avatar';
import { COAST, hubLabel, hubName, hubXY, px } from '../components/Map';
import { motion } from '../components/motion';
import { buildLegs, legD, tukHeight, tukTransform, useLegDrive, type Pt } from '../components/routeDrive';
import TukTuk from '../components/TukTuk';
import { compromises, MAX_CARDS, routeStops, type Compromise } from '../lib/compromises';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Hub, Item, Person, Plan } from '../types';
import Poster from './Poster';

export const INTRO_MS = 3000; // dark HUD, title, then the island fades in
export const HOLD_MS = 2500;  // each day card, unless Next stop is tapped
const HOME_MS = 1400;         // back at the airport, before Mission Complete

const NO_CARDS: Compromise[] = [];

export interface RevealStop { hub: Hub; name: string; days: number[]; items: string[]; notes: string[] }

/**
 * One stop per hub in route order (airport left out). A day counts for a stop when you do something there
 * or end the day there; an activity belongs to wherever you are when it starts, a train to where it takes you.
 */
export function revealStops(plan: Plan, items: Item[], cards: Compromise[]): RevealStop[] {
  const names = new Map(items.map(i => [i.id, i.name]));
  const days = new Map<Hub, Set<number>>();
  const things = new Map<Hub, string[]>();
  const mark = (h: Hub, n: number) => { if (h !== 'AIR') days.set(h, (days.get(h) ?? new Set<number>()).add(n)); };
  const put = (h: Hub, id: string | undefined, label: string) => {
    if (h === 'AIR' || !id) return;
    const l = things.get(h) ?? [];
    const name = names.get(id) ?? label;
    if (!l.includes(name)) things.set(h, [...l, name]);
  };
  let at: Hub = 'AIR';
  for (const d of plan.days) {
    for (const e of d.entries) {
      if ((e.kind === 'drive' || e.kind === 'train') && e.to) at = e.to;
      if (e.kind === 'activity' || e.kind === 'train') { put(at, e.itemId, e.label); mark(at, d.n); }
    }
    mark(at, d.n);
  }
  const notes = cards.slice(0, MAX_CARDS);
  return routeStops(plan.route).filter(h => h !== 'AIR').map(hub => ({
    hub, name: hubName(hub), days: [...(days.get(hub) ?? [])].sort((a, b) => a - b),
    items: things.get(hub) ?? [], notes: notes.filter(c => c.stop === hub).map(c => c.text),
  }));
}

const two = (n: number) => String(n).padStart(2, '0');
/** "DAY 01", "DAYS 02 TO 04", "DAYS 02 AND 05". */
export function dayTag(days: number[]): string {
  if (!days.length) return 'PASSING THROUGH';
  if (days.length === 1) return `DAY ${two(days[0])}`;
  const runs = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const last = two(days[days.length - 1]);
  return runs ? `DAYS ${two(days[0])} TO ${last}` : `DAYS ${days.slice(0, -1).map(two).join(', ')} AND ${last}`;
}

// What the tuk-tuk says when it pulls up. One short line each.
const QUIP: Record<Hub, string> = {
  AIR: 'Airport. Nobody cry.',
  Colombo: 'Traffic? I AM the traffic.',
  Jaffna: 'All the way up here? Fine.',
  Trincomalee: 'Whales. Allegedly.',
  Sigiriya: 'Rock climb? On holiday?',
  Kandy: 'Shoes off. Sacred tooth.',
  Kitulgala: 'Rafting? I will hold bags.',
  'Nuwara Eliya': 'Bring a jumper. Seriously.',
  Ella: 'More hills? My poor engine.',
  Tissa: 'Leopards. Windows up.',
  Udawalawe: 'Elephants have right of way.',
  Weligama: 'Surf is up. I am not.',
};

// ---------- map geometry (map space from Map.tsx: px(lat, lon)) ----------
const VB = { x: -62, y: -4, w: 360, h: 496 };
// The paper fills whatever box it gets; sea and texture run well past the viewBox so the letterbox is paper too.
const BG = { x: -1200, y: -1200, w: 2800, h: 2900 };
const TUK_W = 46, TUK_H = tukHeight(TUK_W);
// The tuk-tuk parks on the road above a stop, or below it where the stop's name sits on top.
const parkDy = (h: Hub) => (hubLabel(h).side === 't' || hubXY(h)[1] - 6 - TUK_H < VB.y + 2 ? TUK_H + 8 : -6);

interface Box { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function bubbleBox(at: Pt, text: string, below: boolean): Box {
  const w = text.length * 6.3 + 18, h = 23;
  return { x: Math.max(VB.x + 3, Math.min(VB.x + VB.w - 3 - w, at[0] - w / 2)), y: below ? at[1] + 9 : at[1] - h - 9, w, h };
}
/** Roughly where a stop's name is printed (14 px Barlow Condensed capitals), so a bubble can keep off it. */
function labelBox(h: Hub): Box {
  const l = hubLabel(h), w = hubName(h).length * 7.6;
  const x = l.anchor === 'end' ? l.x - 3 - w : l.anchor === 'start' ? l.x + 3 : l.x - w / 2;
  return { x, y: l.y + (l.side === 't' ? -3 : 1) - 12, w, h: 17 };
}

function Bubble({ at, text, below }: { at: Pt; text: string; below: boolean }) {
  const { x, y, w, h } = bubbleBox(at, text, below);
  const tx = Math.max(x + 8, Math.min(x + w - 8, at[0]));
  const tail = below ? `M${tx - 5} ${y + 0.5}L${tx} ${y - 7}L${tx + 5} ${y + 0.5}` : `M${tx - 5} ${y + h - 0.5}L${tx} ${y + h + 7}L${tx + 5} ${y + h - 0.5}`;
  return (
    <g className="rv-bubble" role="note" style={{ transformOrigin: `${tx}px ${below ? y : y + h}px` }}>
      <rect x={x} y={y} width={w} height={h} rx="6" fill="#fff5d9" stroke="#25372b" strokeWidth="2" />
      <path d={tail} fill="#fff5d9" stroke="#25372b" strokeWidth="2" strokeLinejoin="round" />
      <text x={x + w / 2} y={y + 15.4} textAnchor="middle" className="rv-bubble-text">{text}</text>
    </g>
  );
}

const ISLAND = COAST.map(([a, o]) => px(a, o).map(n => n.toFixed(1)).join(',')).join(' ');
const HIGHLANDS = 'M98 330C96 300 138 284 160 289C186 295 202 330 194 360C187 390 150 402 127 393C104 384 100 360 98 330Z';
const TREES: Pt[] = [
  [52, 176], [60, 186], [46, 190], [158, 204], [168, 212], [150, 214], [214, 276], [224, 285], [206, 288],
  [108, 418], [118, 426], [100, 428], [228, 410], [238, 418], [94, 230], [86, 240],
];

/** The illustrated island: paper, sea, terrain, highlands with contours and tea terraces, jungle and landmarks. */
function Island({ uid }: { uid: string }) {
  const contour = (k: number) => `translate(146 343) scale(${k}) translate(-146 -343)`;
  return (
    <>
      <defs>
        <pattern id={`paper${uid}`} width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="5" r=".7" fill="#25372b" opacity=".12" /><circle cx="17" cy="11" r=".5" fill="#25372b" opacity=".1" />
          <circle cx="9" cy="21" r=".6" fill="#25372b" opacity=".1" /><path d="M20 20l4 1.5" stroke="#25372b" strokeWidth=".5" opacity=".1" />
        </pattern>
        <pattern id={`waves${uid}`} width="30" height="16" patternUnits="userSpaceOnUse">
          <path d="M3 9q3.5-4 7 0t7 0" fill="none" stroke="#8ca978" strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
        </pattern>
        <pattern id={`tea${uid}`} width="9" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
          <path d="M0 4.5q4.5-3 9 0" fill="none" stroke="#3f6b45" strokeWidth="1.5" strokeLinecap="round" />
        </pattern>
        <filter id={`rough${uid}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="1.8" />
        </filter>
      </defs>
      <rect x={BG.x} y={BG.y} width={BG.w} height={BG.h} fill="#d6dfad" />
      <rect x={BG.x} y={BG.y} width={BG.w} height={BG.h} fill={`url(#waves${uid})`} />
      <polygon points={ISLAND} fill="none" stroke="#eef2d2" strokeWidth="14" strokeLinejoin="round" opacity=".8" />
      <polygon points={ISLAND} fill="#b9ce91" stroke="#25372b" strokeWidth="2.6" strokeLinejoin="round" filter={`url(#rough${uid})`} />
      <path d={HIGHLANDS} fill="#8ca978" />
      {[0.74, 0.5, 0.28].map(k => <path key={k} d={HIGHLANDS} transform={contour(k)} fill="none" stroke="#25372b" strokeWidth={1.1 / k} opacity=".28" />)}
      <ellipse cx="160" cy="366" rx="30" ry="16" transform="rotate(-12 160 366)" fill={`url(#tea${uid})`} />
      <ellipse cx="132" cy="300" rx="16" ry="9" transform="rotate(10 132 300)" fill={`url(#tea${uid})`} />
      {TREES.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="5" fill="#5d8a52" stroke="#25372b" strokeWidth=".9" />
          <circle cx={x - 1.5} cy={y - 1.6} r="1.6" fill="#8fb878" />
        </g>
      ))}
      {/* Sigiriya rock, a stupa near Kandy, Adam's Peak, Galle lighthouse, a whale off Trinco, south coast surf. */}
      <path d="M118 238l3-9q7-5 14 0l3 9z" fill="#b5744a" stroke="#25372b" strokeWidth="1.3" strokeLinejoin="round" />
      <g transform="translate(110 322)" stroke="#25372b" strokeWidth="1.2">
        <path d="M-7 4a7 7 0 0 1 14 0z" fill="#fff5d9" /><path d="M0-3v-6" /><rect x="-8" y="4" width="16" height="2.5" fill="#f4bc43" />
      </g>
      <g transform="translate(116 378)">
        <path d="M-9 6L0-8 9 6z" fill="#8ca978" stroke="#25372b" strokeWidth="1.3" strokeLinejoin="round" /><path d="M-2.5-4L0-8 2.5-4z" fill="#fff5d9" />
      </g>
      <g transform="translate(56 446)" stroke="#25372b" strokeWidth="1.2">
        <path d="M-3.5 9l1.5-15h4l1.5 15z" fill="#fff5d9" /><path d="M-2.6 -1h5.2M-3 4h6" stroke="#ef5939" strokeWidth="2" /><path d="M-2.5-6h5l-2.5-4z" fill="#ef5939" />
      </g>
      <g transform="translate(252 112)" fill="none" stroke="#25372b" strokeWidth="1.5" strokeLinecap="round">
        <path d="M-10 6q10-4 20 0" /><path d="M0 4q-1-6-6-9M0 4q1-6 6-9" />
      </g>
      <path d="M150 482q6-8 12 0t12 0" fill="none" stroke="#25372b" strokeWidth="1.5" strokeLinecap="round" />
      <g transform="translate(-34 452)" stroke="#25372b" strokeWidth="1.3">
        <circle r="12" fill="#fff5d9" /><path d="M0-10L3 0 0 10-3 0z" fill="#ef5939" />
        <text y="-15" textAnchor="middle" className="rv-tiny" stroke="none">N</text>
      </g>
      <g transform="translate(232 40) rotate(-8)">
        <rect x="-62" y="-17" width="124" height="34" rx="3" fill="none" stroke="#ef5939" strokeWidth="2.4" />
        <text y="-2" textAnchor="middle" className="rv-stamp">SRI LANKA TOUR '26</text>
        <text y="11" textAnchor="middle" className="rv-tiny" fill="#ef5939">ROUTE // LK-001</text>
      </g>
      <rect x={BG.x} y={BG.y} width={BG.w} height={BG.h} fill={`url(#paper${uid})`} />
    </>
  );
}

type Stage = 'intro' | 'drive' | 'stop' | 'complete' | 'poster';

// The words change with whose plan it is: the locked group plan, or one person's own.
interface Voice { title: string; tagline: string; meta: string; done: string; doneLabel: string; respect: string; doneTag: string; picked: string; button: string; foot: string }
const GROUP: Voice = {
  title: 'THE PLAN IS IN.', tagline: 'FIVE OPINIONS. QUESTIONABLE LOGISTICS. ONE VERY GOOD HOLIDAY.', meta: 'THE CREW HAS SPOKEN',
  done: 'MISSION COMPLETE', doneLabel: 'Mission complete', respect: 'RESPECT +5', doneTag: 'FIVE OPINIONS. QUESTIONABLE LOGISTICS. ONE VERY GOOD HOLIDAY.',
  picked: 'The crew picked', button: 'See the poster', foot: 'POWERED BY GROUP CHAT DEMOCRACY.',
};
const MINE: Voice = {
  title: 'YOUR ROUTE IS IN.', tagline: 'ONE OPINION. ZERO COMPROMISE. FOR NOW.', meta: 'YOUR CALL',
  done: 'MISSION READY', doneLabel: 'Mission ready', respect: 'RESPECT +1', doneTag: 'NOW CONVINCE THE OTHER FOUR.',
  picked: 'You picked', button: 'Back to my trip', foot: 'POWERED BY ONE VERY STRONG OPINION.',
};

function DayCard({ stop, n, of, meta }: { stop: RevealStop; n: number; of: number; meta: string }) {
  return (
    <article className="rv-card">
      <div className="rv-card-tag">{dayTag(stop.days)} // DESTINATION LOCKED</div>
      <h2>{stop.name}</h2>
      <div className="rv-card-meta">STOP {n} OF {of} · {meta}</div>
      {stop.items.length > 0
        ? <ul className="rv-card-items">{stop.items.map(t => <li key={t}>{t}</li>)}</ul>
        : <p className="rv-card-items rv-card-empty">Nothing booked. Pure vibes.</p>}
      {stop.notes.length > 0 && <ul className="rv-card-notes" aria-label="Compromises">{stop.notes.map(t => <li key={t}>{t}</li>)}</ul>}
    </article>
  );
}

function dayLine(plan: Plan, names: Map<string, string>) {
  let at: Hub = 'AIR';
  return plan.days.map(d => {
    // Every place something happens that day, in order, then where it ends: "Sigiriya to Kandy".
    const seq: Hub[] = [];
    const visit = (h: Hub) => { if (seq[seq.length - 1] !== h) seq.push(h); };
    for (const e of d.entries) {
      if ((e.kind === 'drive' || e.kind === 'train') && e.to) at = e.to;
      if ((e.kind === 'activity' || e.kind === 'train') && at !== 'AIR') visit(at);
    }
    if (at !== 'AIR' || seq.length) visit(at);
    const place = seq.length ? seq.map(hubName).join(' to ') : 'Fly home';
    const acts = d.entries.filter(e => e.kind === 'activity' || e.kind === 'train').map(e => (e.itemId && names.get(e.itemId)) || e.label);
    const what = acts.length ? acts.join(' + ') : d.entries.some(e => e.kind === 'drive') ? 'On the road' : 'Free day';
    return { n: d.n, place, what };
  });
}

function MissionComplete({ plan, items, animate, voice, crew, onDone }: { plan: Plan; items: Item[]; animate: boolean; voice: Voice; crew: Person[]; onDone: () => void }) {
  const names = useMemo(() => new Map(items.map(i => [i.id, i.name])), [items]);
  const days = useMemo(() => dayLine(plan, names), [plan, names]);
  return (
    <section className="rv-done" aria-label={voice.doneLabel} data-animate={animate}>
      <h1 className="rv-done-title">{voice.done}</h1>
      <div className="rv-done-respect">{voice.respect}</div>
      <div className="rv-crew" role="list" aria-label="The crew">
        {crew.map((p, i) => (
          <figure key={p} role="listitem" style={{ '--i': i } as CSSProperties}>
            <img src={`/img/players/${p.toLowerCase()}-selfie.png`} alt={`${p} selfie`} />
            <figcaption>{p}</figcaption>
          </figure>
        ))}
      </div>
      <div className="rv-done-tag">{voice.doneTag}</div>
      <h3 className="rv-done-h">The route</h3>
      <ol className="rv-itin" aria-label="Itinerary">
        {days.map(d => (
          <li key={d.n}><b>D{two(d.n)}</b><span className="rv-itin-place">{d.place}</span><span className="rv-itin-what">{d.what}</span></li>
        ))}
      </ol>
      <h3 className="rv-done-h">{voice.picked}</h3>
      <ul className="rv-chips" aria-label="Chosen experiences">
        {plan.chosen.map(id => <li key={id}>{names.get(id) ?? id}</li>)}
      </ul>
      <button type="button" className="rv-btn" onClick={onDone}>{voice.button}</button>
      <div className="rv-foot">NO REFUNDS. ONLY MEMORIES.<br />{voice.foot}</div>
    </section>
  );
}

/**
 * Full-screen GTA-style route reveal: dark HUD intro, the island, the tuk-tuk drives stop to stop with a day card at each,
 * then Mission Complete and the poster. With `who` it is that person's own plan: no compromise lines, just their selfie, no poster.
 */
export function Reveal({ plan, cards = NO_CARDS, who, onClose }: { plan: Plan; cards?: Compromise[]; who?: Person; onClose: () => void }) {
  const { items } = useApp();
  const voice = who ? MINE : GROUP;
  const crew = useMemo(() => (who ? [who] : PEOPLE), [who]);
  const done = () => (who ? onClose() : setStage('poster'));
  const stops = useMemo(() => revealStops(plan, items, who ? NO_CARDS : cards), [plan, items, cards, who]);
  const path = useMemo<Hub[]>(() => ['AIR', ...stops.map(s => s.hub), 'AIR'], [stops]);
  const legs = useMemo(() => buildLegs(path.map(hubXY), 0.14), [path]);
  const animate = motion() === 'full' && stops.length > 0;
  const [stage, setStage] = useState<Stage>(animate ? 'intro' : 'complete');
  const [k, setK] = useState(0); // leg being driven, or the stop just reached at the end of leg k
  const uid = 'rv';
  const tukRef = useRef<SVGGElement>(null);
  const legRef = useRef<SVGGElement>(null);
  const home = k === stops.length;

  // Sequence: intro, then for each leg drive, then hold at the stop (or at the airport after the last leg).
  useEffect(() => {
    if (!animate) return;
    let ms = 0, next: () => void;
    if (stage === 'intro') { ms = INTRO_MS; next = () => { setK(0); setStage('drive'); }; }
    else if (stage === 'drive') { ms = legs[k].ms; next = () => setStage('stop'); }
    else if (stage === 'stop') { ms = home ? HOME_MS : HOLD_MS; next = home ? () => setStage('complete') : () => { setK(k + 1); setStage('drive'); }; }
    else return;
    const t = setTimeout(next, ms);
    return () => clearTimeout(t);
  }, [animate, stage, k, home, legs]);

  // A short buzz each time the tuk-tuk pulls up at a stop. No sound (standing decision).
  useEffect(() => {
    if (stage === 'stop' && !home && animate && typeof navigator.vibrate === 'function') navigator.vibrate(40);
  }, [stage, k, home, animate]);

  // Drive: the leg's line and the tuk-tuk move together, frame by frame.
  useLegDrive(stage === 'drive', legs[k], parkDy(path[k]), parkDy(path[k + 1] ?? 'AIR'), TUK_W, tukRef, legRef);

  const skip = () => setStage('complete');
  const nextStop = () => { if (stage === 'stop' && !home) { setK(k + 1); setStage('drive'); } };
  const finished = stage === 'complete' || stage === 'poster';
  const drawn = finished ? legs.length : stage === 'stop' ? k + 1 : stage === 'drive' ? k : 0; // legs fully drawn
  const reached = finished ? stops.length : stage === 'stop' ? Math.min(k + 1, stops.length) : stage === 'drive' ? k : 0;
  const tukHub = finished ? 'AIR' : stage === 'stop' ? path[k + 1] : path[k];
  const [hx, hy] = hubXY(tukHub);
  const tukLeft = !finished && stage !== 'intro' && legs[k] ? legs[k].b[0] < legs[k].a[0] : false;
  const tukAt: Pt = [hx, hy + parkDy(tukHub)];
  const active = stage === 'stop' && !home ? stops[k] : null;
  const bubble = stage === 'stop' ? QUIP[path[k + 1]] : null;
  // Above the tuk-tuk unless it parks below the stop, runs off the top, or would sit on a stop name already on the map.
  const above: Pt = [hx, tukAt[1] - TUK_H], under: Pt = [hx, Math.max(tukAt[1], hy + 10)];
  const names = stops.slice(0, reached).map(s => labelBox(s.hub));
  const withTail = (b: Box, below: boolean): Box => ({ ...b, y: below ? b.y - 8 : b.y, h: b.h + 8 });
  const clear = (at: Pt, below: boolean) => !!bubble && !names.some(n => overlaps(n, withTail(bubbleBox(at, bubble, below), below)));
  const aboveOk = tukAt[1] < hy && tukAt[1] - TUK_H - 34 >= VB.y;
  const bubbleBelow = !aboveOk || (!clear(above, false) && clear(under, true));
  const bubbleAt = bubbleBelow ? under : above;

  const map = (
    <div className="rv-mapbox">
      <div className="rv-paper">
        <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} role="img" aria-label={`Route: ${stops.map(s => s.name).join(', ')}`}>
          <Island uid={uid} />
          <g filter={`url(#rough${uid})`}>
            {legs.slice(0, drawn).map((l, i) => (
              <g key={i}>
                <path d={legD(l)} className="rv-route-ink" />
                <path d={legD(l)} className="rv-route" />
              </g>
            ))}
            {stage === 'drive' && legs[k] && (
              <g key={`leg${k}`} ref={legRef} className="rv-route-live" style={{ '--o': 1 } as CSSProperties}>
                <path d={legD(legs[k])} className="rv-route-ink" pathLength={1} />
                <path d={legD(legs[k])} className="rv-route" pathLength={1} />
              </g>
            )}
          </g>
          {(() => {
            const [ax, ay] = hubXY('AIR');
            return <g className="rv-air"><circle cx={ax} cy={ay} r="5.5" /><path d={`M${ax - 3.5} ${ay}h7M${ax + 0.5} ${ay - 3.5}l3 3.5-3 3.5`} /></g>;
          })()}
          {stops.slice(0, reached).map(s => {
            const [x, y] = hubXY(s.hub);
            const l = hubLabel(s.hub);
            const on = active?.hub === s.hub;
            return (
              <g key={s.hub} className={`rv-stop${on ? ' on' : ''}`} data-hub={s.hub}>
                {on && <circle cx={x} cy={y} r="13" className="rv-ring" />}
                <circle cx={x} cy={y} r="6.5" className="rv-pin" />
                <circle cx={x} cy={y} r="2.6" fill="#ef5939" />
                <text x={l.x + (l.side === 'l' ? -3 : l.side === 'r' ? 3 : 0)} y={l.y + (l.side === 't' ? -3 : 1)} textAnchor={l.anchor} className="rv-label">{s.name.toUpperCase()}</text>              </g>
            );
          })}
          <g ref={tukRef} className="rv-tuk" transform={tukTransform(tukAt[0], tukAt[1], tukLeft, TUK_W)}>
            <g key={`${stage}${k}`} className={stage === 'stop' && animate ? 'rv-halt' : undefined}>
              <TukTuk width={TUK_W} driving={stage === 'drive'} idle={stage === 'stop'} />
            </g>
          </g>
          {bubble && <Bubble key={`b${k}`} at={bubbleAt} text={bubble} below={bubbleBelow} />}
        </svg>
      </div>
    </div>
  );

  const hud = (
    <header className="rv-hud">
      <div>
        <div className="rv-hud-line">LK.exe // Trip generator</div>
        <div className="rv-hud-line gold">Mission unlocked</div>
      </div>
      <div className="rv-hud-btns">
        {!finished && <button type="button" className="rv-chip" onClick={skip}>Skip</button>}
        <button type="button" className="rv-chip" onClick={onClose}>Close</button>
      </div>
    </header>
  );

  let body;
  if (stage === 'poster') body = <><button type="button" className="rv-chip rv-close" onClick={onClose}>Close</button><Poster areas={plan.areas} /></>;
  else if (!animate) {
    body = (
      <div className="rv-scroll">
        {hud}
        <h1 className="rv-title still">{voice.title}</h1>
        <div className="rv-still-map">{map}</div>
        <ol className="rv-list" aria-label="Day cards">
          {stops.map((s, i) => <li key={s.hub}><DayCard stop={s} n={i + 1} of={stops.length} meta={voice.meta} /></li>)}
        </ol>
        <MissionComplete plan={plan} items={items} animate={false} voice={voice} crew={crew} onDone={done} />
      </div>
    );
  } else if (stage === 'complete') {
    body = <div className="rv-scroll">{hud}<MissionComplete plan={plan} items={items} animate voice={voice} crew={crew} onDone={done} /></div>;
  } else {
    const nextHub = stops[stage === 'stop' ? k + 1 : k];
    body = (
      <>
        {hud}
        <div className="rv-stage">
          {map}
          {stage === 'intro' && (
            <div className="rv-intro">
              <h1 className="rv-title">{voice.title}</h1>
              <div className="rv-tagline">{voice.tagline}</div>
            </div>
          )}
        </div>
        <div className="rv-dock">
          {/* Every card is laid out invisibly in the same cell, so the dock is as tall as the tallest and the map never jumps. */}
          {stops.map((s, i) => (
            <div key={s.hub} className="rv-sizer" aria-hidden="true"><DayCard stop={s} n={i + 1} of={stops.length} meta={voice.meta} /></div>
          ))}
          {active
            ? <section className="rv-slot" aria-label="Day card" key={active.hub}><DayCard stop={active} n={k + 1} of={stops.length} meta={voice.meta} /></section>
            : (
              <div className="rv-slot rv-status">
                <div className="rv-hud-line gold">ROUTE CALCULATED // LK-001</div>
                <div className="rv-hud-line">{stage === 'intro' ? `${stops.length} STOPS LOADED` : nextHub ? `NEXT STOP: ${nextHub.name.toUpperCase()}` : 'HEADING TO THE AIRPORT'}</div>
              </div>
            )}
        </div>
        <div className="rv-actions">
          <button type="button" className="rv-btn" onClick={nextStop} style={{ visibility: active ? 'visible' : 'hidden' }} tabIndex={active ? 0 : -1} aria-hidden={!active}>
            Next stop
          </button>
        </div>
      </>
    );
  }

  // Portal: the header and tab bar live in stacking contexts of their own and would otherwise sit over a fixed overlay.
  return createPortal(
    <div className="rv" role="dialog" aria-modal="true" aria-label="Route reveal" data-stage={stage} data-motion={animate ? 'full' : 'still'}>
      {body}
    </div>,
    document.body,
  );
}

/** The Group tab entry: one button that plays the route reveal for the locked plan. */
export default function Premiere({ group }: { group: GroupResult }) {
  const { items, state } = useApp();
  const [on, setOn] = useState(false);
  const plan = group.final ?? group.base;
  const cards = useMemo(() => compromises(group, state, items), [group, state, items]);
  if (!plan) return null;
  if (!group.locked) {
    const todo = PEOPLE.filter(p => !group.finalized.includes(p));
    return (
      <section className="body" aria-label="Route reveal">
        <div className="kicker">Premiere</div>
        <div className="sub">The route reveal drops once all five lock their lists.</div>
        <div className="premiere-todo" role="list" aria-label="Still to go">
          {todo.map(p => <span key={p} role="listitem" aria-label={p} title={p}><Avatar name={p} size={40} /></span>)}
        </div>
      </section>
    );
  }
  return (
    <section className="body" aria-label="Route reveal">
      <div className="kicker">Premiere</div>
      <div className="sub">A tuk-tuk drives your route, day by day.</div>
      <button type="button" className="cta" onClick={() => setOn(true)}>Play route reveal</button>
      {on && <Reveal plan={plan} cards={cards} onClose={() => setOn(false)} />}
    </section>
  );
}
