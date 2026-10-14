import { Cover } from '../components/PhotoCard';
import { labels } from '../lib/ranking';
import { TIERS } from '../types';
import type { Item, Ranking, Tier } from '../types';

const NAME: Record<Tier, string> = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip' };
const PLURAL: Record<Tier, string> = { must: 'Musts', keen: 'Keens', meh: 'Mehs', skip: 'Skips' };

export default function Rerank({ ranking, byId, onMove, onRetier, onSubmit }: {
  ranking: Ranking; byId: Record<string, Item>;
  onMove: (id: string, dir: -1 | 1) => void; onRetier: (id: string, t: Tier) => void; onSubmit: () => void;
}) {
  const lab = labels(ranking);
  return (
    <>
      <section className="body" aria-label="Your ranking">
        <div className="big">Your ranking</div>
        <div className="sub">Move things up or down. Up to 3 can share a spot.</div>
        {TIERS.map(t => {
          const levels = ranking[t].map(l => l.filter(id => byId[id])).filter(l => l.length > 0);
          if (levels.length === 0) return null;
          return (
            <div key={t}>
              <div className="tierhead">{PLURAL[t]}<span>{levels.reduce((s, l) => s + l.length, 0)}</span></div>
              {levels.map(l => (
                <div key={l[0]} className={`level${l.length > 1 ? ' tie' : ''}`}>
                  {l.map(id => (
                    <div key={id} className="item">
                      <span className="rk">{lab[id]}</span>
                      <Cover item={byId[id]} className="th" named={false} />
                      <span className="tc">
                        <span className="nm">{byId[id].name}</span>
                        <select aria-label={`Change tier for ${byId[id].name}`} value={t} onChange={e => onRetier(id, e.target.value as Tier)}>
                          {TIERS.map(x => <option key={x} value={x}>{NAME[x]}</option>)}
                        </select>
                      </span>
                      <span className="mv">
                        <button aria-label={`Move ${byId[id].name} up`} onClick={() => onMove(id, -1)}>▲</button>
                        <button aria-label={`Move ${byId[id].name} down`} onClick={() => onMove(id, 1)}>▼</button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </section>
      <div className="foot"><button className="cta" onClick={onSubmit}>Done, submit</button></div>
    </>
  );
}
