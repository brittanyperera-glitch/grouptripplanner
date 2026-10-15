import './Premiere.css';
import './Reveal.css';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '../components/Avatar';
import RouteMap, { hubLabel, hubXY } from '../components/Map';
import { motion } from '../components/motion';
import { compromises, routeStops, type Compromise } from '../lib/compromises';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Hub, Plan } from '../types';
import { TukTuk } from './Rate';
import Poster from './Poster';

const START_MS = 600;   // hold on the airport before the first leg
const PAUSE_MS = 200;   // beat at each stop
const END_MS = 2500;    // hold on the finished route before the poster
const LEG_BUDGET_MS = 12500;
const MAX_LEG_MS = 1500;

/** "Day 2" / "Days 2 to 4" for each stop, from where each day's drives leave you at the end of it. */
export function stopDays(plan: Plan): Partial<Record<Hub, string>> {
  const days = new Map<Hub, number[]>();
  let at: Hub = 'AIR';
  for (const d of plan.days) {
    for (const e of d.entries) if ((e.kind === 'drive' || e.kind === 'train') && e.to) at = e.to;
    if (at !== 'AIR') days.set(at, [...(days.get(at) ?? []), d.n]);
  }
  const out: Partial<Record<Hub, string>> = {};
  days.forEach((ns, h) => {
    const lo = Math.min(...ns), hi = Math.max(...ns);
    out[h] = lo === hi ? `Day ${lo}` : `Days ${lo} to ${hi}`;
  });
  return out;
}

type Stage = 'drive' | 'done' | 'poster';

/** Full-screen route reveal: a tuk-tuk drives the locked route, compromise cards pop at their stops, then the poster. */
export function Reveal({ plan, cards, onClose }: { plan: Plan; cards: Compromise[]; onClose: () => void }) {
  const route = plan.route;
  const legs = route.length - 1;
  const animate = motion() === 'full' && legs > 0;
  const legMs = Math.max(300, Math.min(MAX_LEG_MS, Math.floor(LEG_BUDGET_MS / Math.max(legs, 1)) - PAUSE_MS));
  const days = useMemo(() => stopDays(plan), [plan]);
  // target: where the tuk-tuk is heading; arrived: the last stop it has reached (line, labels and cards follow this).
  const [target, setTarget] = useState(animate ? 0 : legs);
  const [arrived, setArrived] = useState(animate ? 0 : legs);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (skipped) return;
    let ms: number, next: () => void;
    if (arrived === legs) { ms = END_MS; next = () => setSkipped(true); }
    else if (target === arrived) { ms = arrived === 0 ? START_MS : PAUSE_MS; next = () => setTarget(arrived + 1); }
    else { ms = legMs; next = () => setArrived(target); }
    if (!animate && arrived === legs) return; // motion off: wait for a tap
    const t = setTimeout(next, ms);
    return () => clearTimeout(t);
  }, [animate, arrived, target, legs, legMs, skipped]);

  const stage: Stage = skipped ? 'poster' : arrived === legs ? 'done' : 'drive';
  const reached = new Set(route.slice(0, arrived + 1));
  const shown = cards.filter(c => reached.has(c.stop));
  const upTo = route.slice(0, arrived + 1);
  // The tuk-tuk parks on the side of the dot away from the stop's name.
  const [hx, hy] = hubXY(route[target]);
  const side = hubLabel(route[target]).side;
  const air = route[target] === 'AIR'; // Kitulgala's name sits just right of the airport
  const tx = hx + (air ? -6 : side === 'l' ? 24 : side === 'r' ? -24 : 0), ty = hy + (air ? -20 : side === 't' ? 20 : -8);

  const overlay = (
    <>
      {routeStops(upTo).filter(h => days[h]).map(h => {
        const l = hubLabel(h);
        return (
          <text key={h} className="reveal-days" x={l.x} y={l.y + 12} textAnchor={l.anchor} fontSize="10" fontWeight="700" fontFamily="Archivo, sans-serif"
            fill="#FFC15E" stroke="#0B1620" strokeWidth="3" paintOrder="stroke">{days[h]}</text>
        );
      })}
      <g className="reveal-tuk" style={{ transform: `translate(${tx}px, ${ty}px)`, transitionDuration: animate ? `${legMs}ms` : '0ms' }}>
        <g transform="translate(-17 -12)"><TukTuk /></g>
      </g>
    </>
  );

  // Portal: the header and tab bar live in stacking contexts of their own and would otherwise sit over a fixed overlay.
  return createPortal(
    <div className="trailer reveal" role="dialog" aria-modal="true" aria-label="Route reveal" data-stage={stage}
      onClick={() => stage !== 'poster' && setSkipped(true)}>
      <button type="button" className="trailer-close" onClick={e => { e.stopPropagation(); onClose(); }}>Close</button>
      {stage !== 'poster' && (
        <>
          <div className="reveal-map"><RouteMap route={upTo} overlay={overlay} extraHeight={14} /></div>
          <ol className="reveal-cards" aria-label="Compromises">
            {shown.map(c => <li key={c.text} className={`reveal-card ${c.kind}`}>{c.text}</li>)}
          </ol>
          <div className="reveal-hint">Tap to skip</div>
        </>
      )}
      {stage === 'poster' && <Poster areas={plan.areas} />}
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
      <div className="sub">A tuk-tuk drives your route, then the poster.</div>
      <button type="button" className="cta" onClick={() => setOn(true)}>Play route reveal</button>
      {on && <Reveal plan={plan} cards={cards} onClose={() => setOn(false)} />}
    </section>
  );
}
