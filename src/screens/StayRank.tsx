import { useState } from 'react';
import { IconLeft } from '../components/Icons';
import { liveStays, STAY_COPY, warnLines } from '../lib/stayflow';
import type { StayCtx } from '../lib/stayflow';
import { rankPoints } from '../lib/stays';
import { useApp } from '../state';
import type { Area, StayRank as Rank } from '../types';
import { StayFace } from './StayCard';
import './Stays.css';

const R = STAY_COPY.rankPage;
const ORDINAL = ['', '1st', '2nd'];

interface Props { ctx: StayCtx; area: Area; onBack(): void; onDone(): void }

/** Round one: tap a stay for first, another for second, tap again to clear. Warned stays can be ranked: warnings inform, never exclude. */
export default function StayRank({ ctx, area, onBack, onDone }: Props) {
  const { store } = useApp();
  const scored = rankPoints(ctx.suggestions, {}, area);
  const stays = liveStays(ctx, area);
  // A saved pick may be a duplicate that was merged into another card; it shows on the card that represents the group.
  const repOf = (id?: string) => (id ? scored.find(c => c.merged.includes(id))?.id : undefined);
  const saved = ctx.crewOf[ctx.me]?.ranks[area];
  const [sel, setSel] = useState<Rank>({ first: repOf(saved?.first), second: repOf(saved?.second) });

  const tap = (id: string) => setSel(s => {
    if (s.first === id) return { ...s, first: undefined };
    if (s.second === id) return { ...s, second: undefined };
    if (!s.first) return { ...s, first: id };
    return { ...s, second: id };
  });
  const submit = () => {
    if (!sel.first || !sel.second) return;
    void store.saveCrewStays(ctx.me, { ranks: { ...(ctx.crewOf[ctx.me]?.ranks ?? {}), [area]: { first: sel.first, second: sel.second } } });
    onDone();
  };

  const note = scored.length === 0 ? R.zero : scored.length === 1 ? R.auto : scored.length === 2 ? R.two : null;
  return (
    <section className="body st" aria-label={R.title(area)}>
      <div className="st-top-bar">
        <button type="button" className="st-back" aria-label={STAY_COPY.back} onClick={onBack}><IconLeft size={20} /></button>
      </div>
      <h2 className="big display small st-h">{R.title(area)}</h2>
      {note ? <p className="empty">{note}</p> : (
        <>
          <p className="sub">{R.sub}</p>
          <div className="st-grid">
            {scored.map(c => {
              const s = stays.find(x => x.id === c.id);
              if (!s) return null;
              const n = sel.first === c.id ? 1 : sel.second === c.id ? 2 : 0;
              return (
                <button key={c.id} type="button" className="st-pick" aria-pressed={n > 0} aria-label={`${R.card(s.title)}${n ? `, ${ORDINAL[n]}` : ''}`} onClick={() => tap(c.id)}>
                  <StayFace s={s} lines={warnLines(ctx, s)} corner={n > 0 ? <span className="st-badge" aria-hidden="true">{n}</span> : null} />
                </button>
              );
            })}
          </div>
          <button type="button" className="cta" disabled={!sel.first || !sel.second} onClick={submit}>{R.go}</button>
        </>
      )}
    </section>
  );
}
