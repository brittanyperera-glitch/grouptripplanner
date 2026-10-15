import { IconDown, IconUp } from '../components/Icons';
import { Cover } from '../components/PhotoCard';
import { labels } from '../lib/ranking';
import { TIERS } from '../types';
import type { Item, Ranking, Tier } from '../types';

const NAME: Record<Tier, string> = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip' };
const PLURAL: Record<Tier, string> = { must: 'Musts', keen: 'Keens', meh: 'Mehs', skip: 'Skips' };

// Two uses: "Your picks" before submitting (tiers only, no order) and "Finalize your list" after the
// head to heads (onMove given: ranks, up and down, draws up to 5).
export default function Rerank({ ranking, byId, onMove, onRetier, onSubmit, title, kicker, sub, cta, tag, sticky = true }: {
  ranking: Ranking; byId: Record<string, Item>;
  onMove?: (id: string, dir: -1 | 1) => void; onRetier: (id: string, t: Tier) => void; onSubmit: () => void;
  title: string; kicker?: string; sub: string; cta: string; tag?: (id: string) => string | undefined; sticky?: boolean;
}) {
  const lab = labels(ranking);
  return (
    <>
      <section className="body" aria-label={title}>
        {kicker && <div className="kicker">{kicker}</div>}
        <div className="big display">{title}</div>
        <div className="sub">{sub}</div>
        {TIERS.map(t => {
          const levels = ranking[t].map(l => l.filter(id => byId[id])).filter(l => l.length > 0);
          if (levels.length === 0) return null;
          return (
            <div key={t} className={`tiergroup tier-${t}`}>
              <div className="tierhead"><span className="tierdot" aria-hidden="true" />{PLURAL[t]}<span>{levels.reduce((s, l) => s + l.length, 0)}</span></div>
              {levels.map(l => (
                <div key={l[0]} className={`level${onMove && l.length > 1 ? ' tie' : ''}`}>
                  {l.map(id => (
                    <div key={id} className={`item${onMove ? ' moves' : ''}`}>
                      {onMove && <span className="rk">{lab[id]}</span>}
                      <Cover item={byId[id]} className="th" named={false} />
                      <span className="tc">
                        <span className="nm">{byId[id].name}</span>
                        {tag?.(id) && <small className="item-tag">{tag(id)}</small>}
                        <select aria-label={`Change tier for ${byId[id].name}`} value={t} onChange={e => onRetier(id, e.target.value as Tier)}>
                          {TIERS.map(x => <option key={x} value={x}>{NAME[x]}</option>)}
                        </select>
                      </span>
                      {onMove && (
                        <span className="mv">
                          <button aria-label={`Move ${byId[id].name} up`} onClick={() => onMove(id, -1)}><IconUp size={18} /></button>
                          <button aria-label={`Move ${byId[id].name} down`} onClick={() => onMove(id, 1)}><IconDown size={18} /></button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </section>
      <div className={`foot${sticky ? ' sticky' : ''}`}><button className="cta" onClick={onSubmit}>{cta}</button></div>
    </>
  );
}
