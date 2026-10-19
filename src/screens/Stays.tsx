import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Avatar from '../components/Avatar';
import BigState from '../components/BigState';
import { IconCheck, IconLeft } from '../components/Icons';
import { canCloseRanking } from '../lib/override';
import { routePlan } from '../lib/openItems';
import { releaseFor } from '../lib/release';
import { nightsNote, outcome, rankedBy, scoutOf, STAY_COPY, STEPS, stayCtx, stayStatus } from '../lib/stayflow';
import type { Outcome, Step } from '../lib/stayflow';
import { rankPoints } from '../lib/stays';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { Area, PlaceKind, PlaceSuggestion } from '../types';
import { useGroupResult } from '../workers/usePlan';
import StayAddSheet from './StayAddSheet';
import StayUnlock from './StayUnlock';
import StayBoard from './StayBoard';
import StayRank from './StayRank';
import StayVote from './StayVote';
import './Stays.css';

const C = STAY_COPY;
type View = { kind: 'home' } | { kind: 'lock' } | { kind: 'vote' } | { kind: 'board' | 'rank'; area: Area };

/** The accommodation flow: where I am in it, one button for the next thing, and the destinations underneath. */
export default function Stays({ onQuiz }: { onQuiz?: () => void }) {
  const { state, me, store, items, legs } = useApp();
  const { data: group } = useGroupResult(state, items, legs, releaseFor(me));
  const [view, setView] = useState<View>({ kind: 'home' });
  const [sheet, setSheet] = useState<{ area: Area; kind?: PlaceKind; editing?: PlaceSuggestion } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const viewKey = 'area' in view ? `${view.kind}:${view.area}` : view.kind;
  useEffect(() => { root.current?.scrollIntoView?.({ block: 'start' }); }, [viewKey]);

  const shell = (body: ReactNode) => <div ref={root}>{body}</div>;
  if (!me) return null;
  if (!group) return shell(<section className="body st"><p className="empty">{C.loading}</p></section>);
  const route = routePlan(group, state);
  if (!route) return shell(<section className="body st"><p className="empty">{C.noRoute}</p></section>);

  const ctx = stayCtx(state, me, route);
  const status = stayStatus(ctx);
  const home = () => setView({ kind: 'home' });
  const lockNow = () => { void store.saveCrewStays(me, { locked: true }); home(); };
  const mineScouted = ctx.areas.filter(a => scoutOf(ctx, a) === me);
  const outs: Outcome[] = status.open ? ctx.areas.map(a => outcome(ctx, a)) : [];
  const votable = outs.some(o => o.kind === 'vote');
  const closable = ctx.areas.filter((a, i) => {
    const o = outs[i];
    return o?.kind === 'wait' && canCloseRanking(me, rankPoints(ctx.suggestions, {}, a).length, o.ranked, ctx.participants.length, ctx.admin.closed, a);
  });
  const finished = status.open && status.ranked && ctx.areas.length > 0 && outs.every(o => o.kind === 'decided' || o.kind === 'empty');
  const done: Step[] = finished ? [...STEPS] : status.done;
  const openAdd = () => setSheet({ area: mineScouted[0] ?? ctx.areas[0] });
  const nextRank = (skip?: Area) => status.rankAreas.find(a => a !== skip && !rankedBy(ctx, me, a));
  const sheetEl = sheet && <StayAddSheet area={sheet.area} kind={sheet.kind} areas={ctx.areas} editing={sheet.editing} onClose={() => setSheet(null)} />;

  if (view.kind === 'board' && ctx.areas.includes(view.area)) {
    const area = view.area;
    return shell(
      <>
        <StayBoard ctx={ctx} status={status} area={area} onBack={home} onQuiz={onQuiz}
          onAdd={kind => setSheet({ area, kind })} onEdit={s => setSheet({ area: s.area, editing: s })} />
        {sheetEl}
      </>,
    );
  }
  if (view.kind === 'rank' && ctx.areas.includes(view.area)) {
    const area = view.area;
    return shell(<StayRank ctx={ctx} area={area} onBack={home} onDone={() => { const n = nextRank(area); if (n) setView({ kind: 'rank', area: n }); else home(); }} />);
  }
  if (view.kind === 'vote') return shell(<StayVote ctx={ctx} onBack={home} />);
  if (view.kind === 'lock') {
    return shell(
      <section className="body st" aria-label={C.lockPage.title}>
        <div className="st-top-bar">
          <button type="button" className="st-back" aria-label={C.back} onClick={home}><IconLeft size={20} /></button>
        </div>
        <h2 className="big display small st-h">{C.lockPage.title}</h2>
        {status.mine.length === 0 ? <p className="empty">{C.lockPage.empty}</p> : (
          <ul className="st-lines">{status.mine.map(s => <li key={s.id}>{`${s.title}, ${s.area}`}</li>)}</ul>
        )}
        <p className="sub">{C.lockPage.note}</p>
        <button type="button" className="cta" onClick={lockNow}>{C.lockPage.go}</button>
      </section>,
    );
  }

  const step = (() => {
    switch (status.current) {
      case 'quiz':
        return (
          <>
            <h2 className="st-step-title">{C.quiz.title}</h2>
            <p className="sub">{C.quiz.sub}</p>
            <button type="button" className="cta" onClick={() => onQuiz?.()}>{C.quiz.go}</button>
          </>
        );
      case 'suggest':
        return (
          <>
            <h2 className="st-step-title">{C.suggest.title}</h2>
            <p className="sub">{C.suggest.sub}</p>
            <button type="button" className="cta" onClick={openAdd}>{C.suggest.go}</button>
            <button type="button" className="cta alt" onClick={lockNow}>{C.suggest.none}</button>
          </>
        );
      case 'lock': {
        if (status.locked) {
          const n = PEOPLE.filter(p => ctx.crewOf[p]?.locked).length;
          return (
            <BigState compact headline={C.waiting.headline} sub={C.waiting.sub}
              crew={{ label: C.waiting.label, done: p => ctx.crewOf[p]?.locked === true, doneLabel: C.waiting.done, waitLabel: C.waiting.wait, caption: C.waiting.caption(n, PEOPLE.length) }} />
          );
        }
        return (
          <>
            <h2 className="st-step-title">{C.lock.title}</h2>
            <p className="sub">{C.lock.sub(status.mine.length)}</p>
            <button type="button" className="cta" onClick={() => setView({ kind: 'lock' })}>{C.lock.go(status.mine.length)}</button>
            <button type="button" className="cta alt" onClick={openAdd}>{C.lock.more}</button>
          </>
        );
      }
      case 'rank': {
        const next = nextRank();
        return (
          <>
            <h2 className="st-step-title">{C.rank.title}</h2>
            <p className="sub">{C.rank.sub}</p>
            {next && <button type="button" className="cta" onClick={() => setView({ kind: 'rank', area: next })}>{C.rank.go}</button>}
          </>
        );
      }
      case 'final':
        return (
          <>
            <h2 className="st-step-title">{finished ? C.final.set : C.final.title}</h2>
            <p className="sub">{finished ? C.final.setSub : votable ? C.final.sub : C.final.waiting}</p>
            {closable.map(a => (
              <button key={a} type="button" className="st-ghost st-close" title={C.closeRank.hint} onClick={() => { void store.saveStaysAdmin({ closed: [...ctx.admin.closed, a] }); }}>{C.closeRank.go(a)}</button>
            ))}
            {votable && <button type="button" className="cta" onClick={() => setView({ kind: 'vote' })}>{C.final.go}</button>}
          </>
        );
    }
  })();

  const titleOf = (id: string) => ctx.suggestions.find(s => s.id === id)?.title;
  return shell(
    <section className="body st" aria-label="Stays">
      <ol className="st-steps" aria-label={C.stepsLabel}>
        {STEPS.map((k, i) => {
          const isDone = done.includes(k), now = !finished && k === status.current;
          return (
            <li key={k} className="st-step" data-state={isDone ? 'done' : now ? 'now' : 'next'} aria-current={now ? 'step' : undefined}>
              <span className="st-dot">{isDone ? <IconCheck size={12} /> : i + 1}</span>
              <span className="st-step-name">{C.steps[k]}</span>
            </li>
          );
        })}
      </ol>
      <div className="st-card st-step-card">
        {step}
        {mineScouted.length > 0 && status.current !== 'rank' && status.current !== 'final' && <p className="st-scout">{C.scout(mineScouted.join(', '))}</p>}
      </div>
      <div className="kicker">{C.destinations}</div>
      <ul className="st-rows">
        {ctx.areas.map((area, i) => {
          const o = outs[i];
          const scout = scoutOf(ctx, area);
          const count = ctx.suggestions.filter(s => s.kind === 'stay' && s.area === area && s.status === 'live').length;
          return (
            <li key={area}>
              <button type="button" className="st-row" onClick={() => setView({ kind: 'board', area })}>
                <span className="st-row-main">{C.row(area, ctx.nights[area] ?? 0, count)}</span>
                {nightsNote(ctx, area) && <span className="st-row-sub">{nightsNote(ctx, area)}</span>}
                {scout === me ? <span className="stamp-label">{C.scoutTag}</span> : scout && <span className="st-scout-av" role="img" aria-label={`Scout: ${scout}`}><Avatar name={scout} size={22} /></span>}
                {o?.kind === 'decided' && (
                  <span className="st-row-res">{titleOf(o.id) ?? ''}{o.via === 'pin' && <span className="stamp-label red">{C.vote.pinned}</span>}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <StayUnlock ctx={ctx} />
      {sheetEl}
    </section>,
  );
}
