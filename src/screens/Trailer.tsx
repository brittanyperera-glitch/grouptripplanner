import './Premiere.css';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '../components/Avatar';
import { motion } from '../components/motion';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Plan } from '../types';
import Poster from './Poster';

export const TRAILER_MS = 15000;
const TITLE_MS = 2000;
const POSTER_MS = 2000;

interface Frame { n: number; photo: string | undefined; names: string[]; area: string }

/** One frame per day: its first photo, its day number and the places it visits. */
export function trailerFrames(plan: Plan, items: Item[]): Frame[] {
  const byId = new Map(items.map(i => [i.id, i]));
  return plan.days.map(d => {
    const its = d.entries.flatMap(e => (e.itemId && byId.get(e.itemId) ? [byId.get(e.itemId)!] : []));
    return { n: d.n, photo: its.find(i => i.photo)?.photo, names: its.map(i => i.name).slice(0, 2), area: d.area ?? '' };
  });
}

type Stage = { kind: 'title' } | { kind: 'day'; i: number } | { kind: 'poster' };

export function Trailer({ plan, items, onClose }: { plan: Plan; items: Item[]; onClose: () => void }) {
  const frames = useMemo(() => trailerFrames(plan, items), [plan, items]);
  const [stage, setStage] = useState<Stage>(() => (motion() === 'full' ? { kind: 'title' } : { kind: 'poster' }));
  const dayMs = Math.max(400, (TRAILER_MS - TITLE_MS - POSTER_MS) / Math.max(frames.length, 1));

  useEffect(() => {
    if (stage.kind === 'poster') return;
    const ms = stage.kind === 'title' ? TITLE_MS : dayMs;
    const next: Stage = stage.kind === 'title' ? (frames.length ? { kind: 'day', i: 0 } : { kind: 'poster' })
      : stage.i + 1 < frames.length ? { kind: 'day', i: stage.i + 1 } : { kind: 'poster' };
    const t = setTimeout(() => setStage(next), ms);
    return () => clearTimeout(t);
  }, [stage, frames.length, dayMs]);

  const f = stage.kind === 'day' ? frames[stage.i] : null;
  // Portal: the header and tab bar live in stacking contexts of their own and would otherwise sit over a fixed overlay.
  return createPortal(
    <div className="trailer" role="dialog" aria-modal="true" aria-label="Trip trailer" data-stage={stage.kind}
      onClick={() => stage.kind !== 'poster' && setStage({ kind: 'poster' })}>
      <button type="button" className="trailer-close" onClick={e => { e.stopPropagation(); onClose(); }}>Close</button>
      {stage.kind === 'title' && (
        <div className="trailer-title"><div className="kicker">Dec 2026</div><div className="big display">SRI LANKA</div><div className="sub">Tap to skip</div></div>
      )}
      {f && (
        <div className="trailer-day" key={f.n}>
          {f.photo && <img src={`/img/${f.photo}.jpg`} alt="" />}
          <span className="scrim" />
          <div className="trailer-cap"><div className="kicker">Day {f.n}</div><div className="big display small">{f.names.join(', ') || f.area}</div></div>
        </div>
      )}
      {stage.kind === 'poster' && <Poster areas={plan.areas} />}
    </div>,
    document.body,
  );
}

/** The Group tab entry: one button that plays the trailer for the final (or provisional) plan. */
export default function Premiere({ group }: { group: GroupResult }) {
  const { items } = useApp();
  const [on, setOn] = useState(false);
  const plan = group.final ?? group.base;
  if (!plan) return null;
  if (!group.locked) {
    const todo = PEOPLE.filter(p => !group.finalized.includes(p));
    return (
      <section className="body" aria-label="Trailer">
        <div className="kicker">Premiere</div>
        <div className="sub">The trailer drops once all five lock their lists.</div>
        <div className="premiere-todo" role="list" aria-label="Still to go">
          {todo.map(p => <span key={p} role="listitem" aria-label={p} title={p}><Avatar name={p} size={40} /></span>)}
        </div>
      </section>
    );
  }
  return (
    <section className="body" aria-label="Trailer">
      <div className="kicker">Premiere</div>
      <div className="sub">15 seconds, day by day, then the poster.</div>
      <button type="button" className="cta" onClick={() => setOn(true)}>Play trailer</button>
      {on && <Trailer plan={plan} items={items} onClose={() => setOn(false)} />}
    </section>
  );
}
