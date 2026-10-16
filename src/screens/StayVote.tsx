import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '../components/Avatar';
import { IconCheck, IconLeft, IconPin } from '../components/Icons';
import { forkOf, gbp, outcome, STAY_COPY, warnLines } from '../lib/stayflow';
import type { Outcome, StayCtx } from '../lib/stayflow';
import { myChoice } from '../lib/votes';
import { useApp } from '../state';
import type { Area, PlaceSuggestion, Player } from '../types';
import { Facts, StayPhoto } from './StayCard';
import '../components/ItemSheet.css';
import './Stays.css';

const V = STAY_COPY.vote;
type Vote = Extract<Outcome, { kind: 'vote' }>;

/** Full-page look at one finalist, with the vote on it (same chrome as the other detail pages). */
function StayDetail({ s, lines, voted, onVote, onClose }: { s: PlaceSuggestion; lines: string[]; voted: boolean; onVote(): void; onClose(): void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeNow = useRef(onClose);
  closeNow.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNow.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, []);
  return createPortal(
    <div className="is-sheet" role="dialog" aria-modal="true" aria-label={s.title}>
      <header className="is-head">
        <h2 className="is-title">{s.title}</h2>
        <button ref={closeRef} type="button" className="is-close" onClick={onClose}>{V.close}</button>
      </header>
      <div className="is-scroll">
        <article className="is-item">
          <StayPhoto s={s} className="is-photo" />
          <div className="is-where"><IconPin size={13} />{s.area}</div>
          <Facts s={s} />
          {s.why && <p className="about">{s.why}</p>}
          {lines.map(l => <p key={l} className="st-warn" data-st-warn="">{l}</p>)}
          {s.link && <a className="st-link" href={s.link} target="_blank" rel="noopener noreferrer">{STAY_COPY.board.book}</a>}
        </article>
      </div>
      <footer className="is-foot">
        {voted ? <span className="is-voted"><IconCheck size={16} />{V.yours}</span> : <button type="button" className="cta" onClick={onVote}>{V.voteFor}</button>}
      </footer>
    </div>,
    document.body,
  );
}

interface Props { ctx: StayCtx; onBack(): void }

/** Round two: the two finalists per destination, knockout-style. Three votes settle it; a pin from Brittany beats the vote. */
export default function StayVote({ ctx, onBack }: Props) {
  const { store } = useApp();
  const [sheet, setSheet] = useState<{ area: Area; s: PlaceSuggestion; side: 'a' | 'b'; vote: Vote } | null>(null);
  const [decidedOpen, setDecidedOpen] = useState(false);
  const byId = (id: string) => ctx.suggestions.find(s => s.id === id);
  const rows = ctx.areas.map(area => ({ area, o: outcome(ctx, area) }));
  const open = rows.filter((r): r is { area: Area; o: Vote } => r.o.kind === 'vote');
  const waiting = rows.filter(r => r.o.kind === 'wait');
  const decided = rows.filter(r => r.o.kind === 'decided' || r.o.kind === 'empty');
  const total = ctx.participants.length;

  const cast = (area: Area, vote: Vote, choice: 'a' | 'b') => { void store.vote({ forkId: forkOf(area, vote.pair), name: ctx.me, choice }); };

  const card = (area: Area, vote: Vote, side: 'a' | 'b') => {
    const s = byId(vote.pair[side === 'a' ? 0 : 1]);
    if (!s) return null;
    const mine = myChoice(ctx.votes, forkOf(area, vote.pair), ctx.me) === side;
    const voters: Player[] = side === 'a' ? vote.a : vote.b;
    return (
      <div key={side} className="pick tall list scene" data-mine={mine}>
        <StayPhoto s={s} className="ph" />
        {mine && <span className="mine" aria-hidden="true"><IconCheck size={16} /></span>}
        <button type="button" className="pick-open" aria-haspopup="dialog" aria-label={V.details(s.title)} onClick={() => setSheet({ area, s, side, vote })} />
        <span className="pick-copy">
          {s.priceGbp !== undefined && <span className="tag">{V.price(gbp(s.priceGbp))}</span>}
          <span className="st-pk-wrap"><b className="st-pk-title">{s.title}</b></span>
          {(vote.warns[s.id]?.length ?? 0) > 0 && <span className="st-warn" data-st-warn="">{V.heads(vote.warns[s.id].length)}</span>}
          {voters.length > 0 && (
            <span className="pick-voters" role="list" aria-label="Voted for this">
              {voters.map(p => <span key={p} role="listitem" className="pv" title={p}><Avatar name={p} size={30} /><span className="pv-name">{p}</span></span>)}
            </span>
          )}
          <button type="button" className="pick-vote" aria-pressed={mine} aria-label={`Vote for ${s.title}`} onClick={() => cast(area, vote, side)}>{mine ? V.voted : V.vote}</button>
        </span>
      </div>
    );
  };

  const resultLine = (area: Area, o: Outcome) => {
    if (o.kind === 'empty') return `${area}: ${V.empty}`;
    if (o.kind !== 'decided') return '';
    const title = byId(o.id)?.title ?? 'A stay';
    return `${area}: ${title}${o.via === 'only' ? `, ${V.only}` : o.via === 'vote' ? `, ${V.byVote}` : ''}`;
  };

  const showDecided = decidedOpen || (open.length === 0 && waiting.length === 0);
  return (
    <section className="body st" aria-label={V.title}>
      <div className="st-top-bar">
        <button type="button" className="st-back" aria-label={STAY_COPY.back} onClick={onBack}><IconLeft size={20} /></button>
      </div>
      <h2 className="big display small st-h">{V.title}</h2>
      {open.length === 0 && waiting.length === 0 && decided.length === 0 && <p className="empty">{V.nothing}</p>}
      {open.map(({ area, o }) => (
        <div key={area} role="group" aria-label={`Stay vote: ${area}`} className="ko">
          <div className="big display small">{area}</div>
          {o.tieBreak && <p className="sub">{o.tieBreak}</p>}
          <div className="vs2 face">{card(area, o, 'a')}{card(area, o, 'b')}<span className="vs" aria-hidden="true">{V.vs}</span></div>
          <div className="tally">
            <span className="dots" aria-hidden="true">{ctx.participants.map((p, i) => <span key={p} className={i < o.a.length ? 'a' : i < o.a.length + o.b.length ? 'b' : ''} />)}</span>
            <span className="sub">{V.tally(o.a.length + o.b.length, total)}</span>
          </div>
        </div>
      ))}
      {waiting.map(({ area, o }) => <p key={area} className="sub">{`${area}: ${STAY_COPY.rank.caption(o.kind === 'wait' ? o.ranked : 0, total)}`}</p>)}
      {decided.length > 0 && (
        <div>
          <button type="button" className="st-fold" aria-expanded={showDecided} onClick={() => setDecidedOpen(d => !d)}><IconCheck size={16} />{V.decided(decided.length)}</button>
          {showDecided && decided.map(({ area, o }) => (
            <div key={area} className="st-decided">
              <span>{resultLine(area, o)}</span>
              {o.kind === 'decided' && o.via === 'pin' && <span className="stamp-label red">{V.pinned}</span>}
            </div>
          ))}
        </div>
      )}
      {sheet && (
        <StayDetail s={sheet.s} lines={warnLines(ctx, sheet.s)} voted={myChoice(ctx.votes, forkOf(sheet.area, sheet.vote.pair), ctx.me) === sheet.side}
          onVote={() => { cast(sheet.area, sheet.vote, sheet.side); setSheet(null); }} onClose={() => setSheet(null)} />
      )}
    </section>
  );
}
