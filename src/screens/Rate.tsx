import { PhotoCard } from '../components/PhotoCard';
import type { Copy } from '../state';
import { TIERS } from '../types';
import type { Item, Tier } from '../types';

const LABEL: Record<Tier, string> = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip' };

export function facts(item: Item): string {
  return [item.area, item.when, `${item.hours} h`, item.fee].filter(Boolean).join(' · ');
}

export default function Rate({ item, n, total, copy, onTier }: {
  item: Item; n: number; total: number; copy: Copy; onTier: (t: Tier) => void;
}) {
  const extra = copy.items[item.id] ?? {};
  return (
    <>
      <div className="body flush">
        <PhotoCard item={item} n={n} total={total} />
        <div className="info">
          <div className="title">{item.name}</div>
          {item.about && <div className="about">{item.about}</div>}
          <div className="facts">{facts(item)}</div>
          {item.warn && <div className="fact-warn"><b>Heads up:</b> {item.warn}</div>}
          {item.google && (
            <a className="gr" href={item.google.url} target="_blank" rel="noopener noreferrer">
              ★ {item.google.rating} ({item.google.reviews})
            </a>
          )}
          {extra.review && (
            <div className="review">
              {extra.reviewUrl
                ? <a href={extra.reviewUrl} target="_blank" rel="noopener noreferrer">{extra.review}</a>
                : extra.review}
            </div>
          )}
          {extra.take && <div className="take"><b>Brittany:</b> {extra.take}</div>}
        </div>
      </div>
      <div className="tiers">
        {TIERS.map(t => <button key={t} className={`t ${t}`} onClick={() => onTier(t)}>{LABEL[t]}</button>)}
      </div>
    </>
  );
}
