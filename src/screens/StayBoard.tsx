import { useState } from 'react';
import Avatar from '../components/Avatar';
import { IconLeft } from '../components/Icons';
import { isAdmin, pinnedId, withNights, withPin } from '../lib/override';
import { KIND_LABEL, liveStays, nightsNote, STAY_COPY, warnLines } from '../lib/stayflow';
import type { StayCtx, StayStatus } from '../lib/stayflow';
import { tallySides } from '../lib/votes';
import { useApp } from '../state';
import { MAX_NIGHTS, MIN_NIGHTS, reactForkId } from '../types';
import type { Area, PlaceKind, PlaceSuggestion } from '../types';
import { StayFace, StayPhoto, Suggester } from './StayCard';
import './Stays.css';

const B = STAY_COPY.board;
const KINDS: PlaceKind[] = ['stay', 'eat', 'do', 'gem'];

interface Props {
  ctx: StayCtx; status: StayStatus; area: Area;
  onBack(): void; onAdd(kind: PlaceKind): void; onEdit(s: PlaceSuggestion): void; onQuiz?: () => void;
}

/** One destination: stays I can add to, and eat / do / gem ideas the crew just react to. */
export default function StayBoard({ ctx, status, area, onBack, onAdd, onEdit, onQuiz }: Props) {
  const { store } = useApp();
  const [kind, setKind] = useState<PlaceKind>('stay');
  const nights = ctx.nights[area] ?? 0;
  const admin = isAdmin(ctx.me);
  const pinned = pinnedId(ctx.admin.pins, area, ctx.suggestions);
  const setPin = (id: string | null) => { void store.saveStaysAdmin({ pins: withPin(ctx.admin.pins, area, id, new Date().toISOString()) }); };
  const setNights = (n: number) => { void store.saveStaysAdmin({ nights: withNights(ctx.admin.nights ?? {}, area, n, ctx.derivedNights?.[area]) }); };
  const note = nightsNote(ctx, area);
  const N = STAY_COPY.nightsStep;
  const stays = liveStays(ctx, area);
  const others = ctx.suggestions.filter(s => s.kind === kind && s.area === area && s.status === 'live');

  const stayCard = (s: PlaceSuggestion) => {
    const mine = s.name === ctx.me;
    const isPin = pinned === s.id;
    return (
      <article key={s.id} className="st-card" aria-label={s.title}>
        <StayFace s={s} lines={warnLines(ctx, s)} corner={isPin ? <span className="stamp-label red st-pinned">{STAY_COPY.vote.pinned}</span> : undefined} />
        <div className="st-actions">
          {s.link && <a className="st-link" href={s.link} target="_blank" rel="noopener noreferrer">{B.book}</a>}
          {admin && (isPin
            ? <button type="button" className="st-ghost" onClick={() => setPin(null)}>{B.unpin}</button>
            : <button type="button" className="st-ghost" onClick={() => setPin(s.id)}>{B.pin}</button>)}
          {mine && status.locked && <span className="stamp-label">{B.locked}</span>}
          {mine && !status.locked && (
            <>
              <button type="button" className="st-ghost" onClick={() => onEdit(s)}>{B.edit}</button>
              <button type="button" className="st-ghost" onClick={() => { void store.setPlaceStatus(s.id, 'withdrawn'); }}>{B.withdraw}</button>
            </>
          )}
        </div>
      </article>
    );
  };

  const reactCard = (s: PlaceSuggestion) => {
    const fork = reactForkId(s.id);
    const { a, b } = tallySides(ctx.votes, fork, ctx.participants);
    const mine = a.includes(ctx.me) ? 'a' : b.includes(ctx.me) ? 'b' : undefined;
    const cast = (choice: 'a' | 'b') => { void store.vote({ forkId: fork, name: ctx.me, choice }); };
    return (
      <article key={s.id} className="st-card st-react" aria-label={s.title}>
        {s.photo && <StayPhoto s={s} className="st-photo" />}
        <div className="st-body">
          <div className="st-top"><h3 className="st-name">{s.title}</h3><Suggester name={s.name} /></div>
          {s.why && <p className="st-why">{s.why}</p>}
          <div className="st-actions">
            {s.link && <a className="st-link" href={s.link} target="_blank" rel="noopener noreferrer">{B.book}</a>}
            <button type="button" className="st-pill" aria-pressed={mine === 'a'} onClick={() => cast('a')}>{STAY_COPY.react.yes}{a.length > 0 && <span className="st-n"> {a.length}</span>}</button>
            <button type="button" className="st-pill" aria-pressed={mine === 'b'} onClick={() => cast('b')}>{STAY_COPY.react.no}{b.length > 0 && <span className="st-n"> {b.length}</span>}</button>
          </div>
          {a.length > 0 && (
            <span className="st-voters" role="list" aria-label="Interested">
              {a.map(p => <span key={p} role="listitem" title={p}><Avatar name={p} size={26} /></span>)}
            </span>
          )}
        </div>
      </article>
    );
  };

  const list = kind === 'stay' ? stays : others;
  return (
    <section className="body st" aria-label={B.header(area, nights)}>
      <div className="st-top-bar">
        <button type="button" className="st-back" aria-label={STAY_COPY.back} onClick={onBack}><IconLeft size={20} /></button>
      </div>
      <h2 className="big display small st-h">{B.header(area, nights)}</h2>
      {note && <p className="sub st-nightsnote">{note}</p>}
      {admin && !ctx.admin.nightsOff && (
        <div className="st-nights" role="group" aria-label={N.label(area)}>
          <button type="button" className="st-pill st-nstep" aria-label={N.less} disabled={nights <= MIN_NIGHTS} onClick={() => setNights(nights - 1)}>-</button>
          <span className="st-nval" aria-live="polite">{nights} {N.unit(nights)}</span>
          <button type="button" className="st-pill st-nstep" aria-label={N.more} disabled={nights >= MAX_NIGHTS} onClick={() => setNights(nights + 1)}>+</button>
        </div>
      )}
      <div className="st-kinds" role="group" aria-label="Kind">
        {KINDS.map(k => <button key={k} type="button" className="st-pill" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
      </div>
      {kind === 'stay' && (status.locked
        ? <p className="sub">{B.lockedLine}</p>
        : status.quizDone
          ? <button type="button" className="cta st-add" onClick={() => onAdd('stay')}>{B.add}</button>
          : (
            <div className="st-gate">
              <button type="button" className="cta st-add" disabled>{B.add}</button>
              <button type="button" className="st-link st-reason" onClick={onQuiz}>{B.quizFirst}</button>
            </div>
          ))}
      {kind !== 'stay' && <button type="button" className="cta st-add" onClick={() => onAdd(kind)}>{B.addIdea}</button>}
      {list.length === 0
        ? <p className="empty">{kind === 'stay' ? B.none : B.noneOther}</p>
        : <div className="st-list">{list.map(s => (kind === 'stay' ? stayCard(s) : reactCard(s)))}</div>}
    </section>
  );
}
