import { useEffect, useState } from 'react';
import {
  closestCenter, DndContext, DragOverlay, getFirstCollision, MouseSensor, pointerWithin, rectIntersection, TouchSensor, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Cover } from '../components/PhotoCard';
import { canDraw, isDrawn, labels, MAX_TIE, placeId, toggleDraw, withoutDraws } from '../lib/ranking';
import { TIERS } from '../types';
import type { Item, Ranking, Tier } from '../types';
import './Rerank.css';

const PLURAL: Record<Tier, string> = { must: 'Musts', keen: 'Keens', meh: 'Mehs', skip: 'Skips' };
const SINGLE: Record<Tier, string> = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip' };
const HELP = 'Press and hold a row, then drag it. With a keyboard: focus a row, press Space to pick it up, Up and Down arrows to move it, Space to drop, Escape to cancel.';
const zone = (t: Tier) => `tier:${t}`;
// Where the pointer is now: its position when the drag began plus how far it has moved since.
function pointerY(e: Event): number {
  if ('touches' in e) return (e as TouchEvent).touches[0]?.clientY ?? 0;
  return (e as MouseEvent).clientY ?? 0;
}
const zoneTier = (id: unknown): Tier | null => (typeof id === 'string' && id.startsWith('tier:') ? (id.slice(5) as Tier) : null);

type Flat = Record<Tier, string[]>;

// Two uses: "Your picks" before submitting (drag to order inside a tier or across tiers, no draws) and
// "Finalize your list" after the head to heads (draws=true: up to MAX_TIE rows can share a spot).
export default function Rerank({ ranking, byId, onChange, draws = false, onSubmit, title, kicker, sub, cta, tag, sticky = true }: {
  ranking: Ranking; byId: Record<string, Item>;
  /** The whole ranking after one drag, drop, keyboard move or draw toggle, and the id that moved. */
  onChange: (next: Ranking, id: string) => void; draws?: boolean; onSubmit: () => void;
  title: string; kicker?: string; sub: string; cta?: string; tag?: (id: string) => string | undefined; sticky?: boolean;
}) {
  const known = (id: string) => !!byId[id];
  const flatOf = (r: Ranking): Flat => Object.fromEntries(TIERS.map(t => [t, r[t].flat().filter(known)])) as Flat;
  const [live, setLive] = useState<Flat | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lift, setLift] = useState<{ id: string; view: Ranking } | null>(null);
  const [said, setSaid] = useState('');
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const view = lift?.view ?? ranking;
  const flat = live ?? flatOf(view);
  const lab = labels(view);
  const nameOf = (id: string) => byId[id].name;
  const tierIn = (f: Flat, id: string) => TIERS.find(t => f[t].includes(id)) ?? null;

  // Rows hold no place until a drop: map a position among the rows shown to a position in the stored tier.
  const commit = (id: string, tier: Tier, shownIndex: number) => {
    const next = structuredClone(ranking);
    const rest = next[tier].flat().filter(x => x !== id);
    const seen = rest.filter(known);
    const at = shownIndex < seen.length ? rest.indexOf(seen[shownIndex]) : rest.length;
    placeId(next, id, tier, at);
    onChange(draws ? next : withoutDraws(next), id);
  };

  const collide: CollisionDetection = args => {
    const hits = pointerWithin(args);
    const found = hits.length ? hits : rectIntersection(args);
    let overId = getFirstCollision(found, 'id');
    const t = zoneTier(overId);
    if (t && live && live[t].length > 0) {
      const inside = args.droppableContainers.filter(c => live[t].includes(String(c.id)));
      overId = closestCenter({ ...args, droppableContainers: inside })[0]?.id ?? overId;
    }
    return overId != null ? [{ id: overId }] : [];
  };

  const onStart = (e: DragStartEvent) => { setActiveId(String(e.active.id)); setLive(flatOf(view)); };
  const onOver = ({ active, over, activatorEvent, delta }: DragOverEvent) => {
    if (!over || !live) return;
    const id = String(active.id);
    const from = tierIn(live, id);
    const to = zoneTier(over.id) ?? tierIn(live, String(over.id));
    if (!from || !to || from === to) return;
    const overIndex = live[to].indexOf(String(over.id));
    const y = pointerY(activatorEvent) + delta.y;
    const below = overIndex >= 0 && y > over.rect.top + over.rect.height / 2;
    const at = overIndex >= 0 ? overIndex + (below ? 1 : 0) : live[to].length;
    setLive({ ...live, [from]: live[from].filter(x => x !== id), [to]: [...live[to].slice(0, at), id, ...live[to].slice(at)] });
  };
  const onEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    if (live) {
      const t = tierIn(live, id);
      if (t) {
        let list = live[t];
        const overIndex = over ? list.indexOf(String(over.id)) : -1;
        if (overIndex >= 0) list = arrayMove(list, list.indexOf(id), overIndex);
        const before = flatOf(ranking);
        if (tierIn(before, id) !== t || before[t].join() !== list.join()) commit(id, t, list.indexOf(id));
      }
    }
    setLive(null); setActiveId(null);
  };
  const onCancel = () => { setLive(null); setActiveId(null); };

  // Keyboard: Space lifts a row, Up and Down move it (across tiers at the ends), Space drops, Escape cancels.
  const where = (r: Ranking, id: string) => {
    const f = flatOf(r), t = tierIn(f, id)!;
    return { t, i: f[t].indexOf(id), n: f[t].length };
  };
  const say = (r: Ranking, id: string, verb: string) => {
    const w = where(r, id);
    setSaid(`${nameOf(id)} ${verb}. ${PLURAL[w.t]}, position ${w.i + 1} of ${w.n}.`);
  };
  const keyMove = (id: string, dir: -1 | 1) => {
    if (!lift) return;
    const next = structuredClone(lift.view);
    const { t, i, n } = where(next, id);
    let to = t, at = i + dir;
    if (at < 0) { to = TIERS[Math.max(0, TIERS.indexOf(t) - 1)]; at = to === t ? 0 : flatOf(next)[to].length; }
    else if (at >= n) { to = TIERS[Math.min(3, TIERS.indexOf(t) + 1)]; at = to === t ? n - 1 : 0; }
    if (to === t && at === i) return;
    const rest = next[to].flat().filter(x => x !== id);
    const seen = rest.filter(known);
    placeId(next, id, to, at < seen.length ? rest.indexOf(seen[at]) : rest.length);
    setLift({ id, view: next }); say(next, id, 'moved');
  };
  const onKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!lift) { setLift({ id, view: structuredClone(ranking) }); say(ranking, id, 'picked up. Up and Down arrows move it, Space drops it, Escape cancels'); return; }
      const w = where(lift.view, id);
      const changed = JSON.stringify(flatOf(lift.view)) !== JSON.stringify(flatOf(ranking));
      if (changed) commit(id, w.t, w.i);
      say(lift.view, id, 'dropped');
      setLift(null);
    } else if (lift?.id === id && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault(); keyMove(id, e.key === 'ArrowUp' ? -1 : 1);
    } else if (lift?.id === id && e.key === 'Escape') {
      e.preventDefault(); setSaid(`${nameOf(id)} left where it was.`); setLift(null);
    }
  };
  // Moving a row between tiers remounts it, so give the focus back to the lifted row.
  useEffect(() => {
    if (lift) Array.from(document.querySelectorAll<HTMLElement>('[data-pick]')).find(el => el.dataset.pick === lift.id)?.focus();
  }, [lift]);

  const toggle = (id: string) => {
    const next = structuredClone(ranking);
    toggleDraw(next, id);
    onChange(next, id);
    setSaid(isDrawn(next, id) ? `${nameOf(id)} now draws with the row above.` : `${nameOf(id)} no longer draws.`);
  };

  const drawnAt = (t: Tier, i: number) => draws && flat[t][i] !== undefined && isDrawn(view, flat[t][i]);

  return (
    <>
      <section className="body" aria-label={title}>
        {kicker && <div className="kicker">{kicker}</div>}
        <div className="big display">{title}</div>
        <div className="sub">{sub}</div>
        <DndContext sensors={sensors} collisionDetection={collide} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={onCancel}
          accessibility={{
            screenReaderInstructions: { draggable: HELP },
            announcements: {
              onDragStart: ({ active }) => `Picked up ${nameOf(String(active.id))}.`,
              onDragOver: () => undefined,
              onDragEnd: ({ active }) => `Dropped ${nameOf(String(active.id))}.`,
              onDragCancel: ({ active }) => `${nameOf(String(active.id))} left where it was.`,
            },
          }}>
          {TIERS.map(t => (
            <TierList key={t} tier={t} ids={flat[t]} dragging={activeId !== null || lift !== null}>
              {flat[t].map((id, i) => (
                <PickRow key={id} id={id} item={byId[id]} rank={lab[id]} tier={t} pos={i} total={flat[t].length} tag={tag?.(id)}
                  drawn={drawnAt(t, i)} joinNext={drawnAt(t, i + 1)} lifted={lift?.id === id} onKey={onKey}
                  eq={draws && i > 0 ? { on: drawnAt(t, i), can: canDraw(view, id), toggle: () => toggle(id) } : undefined} />
              ))}
            </TierList>
          ))}
          <DragOverlay>
            {activeId && known(activeId) ? <div className="item overlay"><div className="hit"><RowBody item={byId[activeId]} rank={lab[activeId]} tag={tag?.(activeId)} /></div></div> : null}
          </DragOverlay>
        </DndContext>
        <div className="sr-only" role="status" aria-live="polite">{said}</div>
      </section>
      {cta && <div className={`foot${sticky ? ' sticky' : ''}`}><button className="cta" onClick={onSubmit}>{cta}</button></div>}
    </>
  );
}

function TierList({ tier, ids, dragging, children }: { tier: Tier; ids: string[]; dragging: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: zone(tier) });
  return (
    <div className={`tiergroup tier-${tier}`}>
      <div className="tierhead"><span className="tierdot" aria-hidden="true" />{PLURAL[tier]}<span>{ids.length}</span></div>
      <SortableContext id={zone(tier)} items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={`picklist${ids.length === 0 ? ' empty' : ''}${dragging ? ' live' : ''}`} aria-label={PLURAL[tier]}>
          {children}
          {ids.length === 0 && <li className="none" aria-hidden="true">Drag a pick here</li>}
        </ul>
      </SortableContext>
    </div>
  );
}

function RowBody({ item, rank, tag }: { item: Item; rank: string | undefined; tag?: string }) {
  return (
    <>
      <span className="rk">{rank}</span>
      <Cover item={item} className="th" named={false} />
      <span className="tc">
        <span className="nm">{item.name}</span>
        {tag && <small className="item-tag">{tag}</small>}
      </span>
      <span className="grip" aria-hidden="true"><i /><i /><i /></span>
    </>
  );
}

function PickRow({ id, item, rank, tier, pos, total, tag, drawn = false, joinNext = false, lifted = false, onKey, eq }: {
  id: string; item: Item; rank: string | undefined; tier: Tier; pos: number; total: number; tag?: string;
  drawn?: boolean; joinNext?: boolean; lifted?: boolean;
  onKey: (e: React.KeyboardEvent, id: string) => void; eq?: { on: boolean; can: boolean; toggle: () => void };
}) {
  const s = useSortable({ id });
  const label = `${item.name}, ${SINGLE[tier]}, position ${pos + 1} of ${total}${tag ? `, ${tag}` : ''}`;
  const cls = ['item', drawn && 'drawn', joinNext && 'join', s.isDragging && 'ghost', lifted && 'lifted'].filter(Boolean).join(' ');
  return (
    <li ref={s.setNodeRef} className={cls} data-id={id} style={{ transform: CSS.Translate.toString(s.transform), transition: s.transition }}>
      <div className="hit" {...s.attributes} {...s.listeners} data-pick={id} aria-label={label} aria-pressed={lifted} onKeyDown={e => onKey(e, id)}>
        <RowBody item={item} rank={rank} tag={tag} />
      </div>
      {eq && (
        <button className={`eq${eq.on ? ' on' : ''}`} aria-pressed={eq.on} aria-label={`Draw ${item.name} with the row above`} disabled={!eq.can}
          title={eq.can ? undefined : `A draw holds at most ${MAX_TIE}`} onClick={eq.toggle}>=</button>
      )}
    </li>
  );
}
