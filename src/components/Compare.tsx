import { canTie, compareTarget } from '../lib/ranking';
import type { Item, Pending, Ranking } from '../types';
import { Cover } from './PhotoCard';

const PLURAL = { must: 'Musts', keen: 'Keens', meh: 'Mehs', skip: 'Skips' } as const;

export default function Compare({ ranking, pending, byId, onAnswer, onCancel }: {
  ranking: Ranking; pending: Pending; byId: Record<string, Item>;
  onAnswer: (a: 'new' | 'old' | 'same') => void; onCancel?: () => void;
}) {
  const cards: ['new' | 'old', Item, string][] = [
    ['new', byId[pending.id], 'This one'],
    ['old', byId[compareTarget(ranking, pending)], 'Already ranked'],
  ];
  const tieOk = canTie(ranking, pending);
  return (
    <div className="body">
      <div className="big">Which do you want more?</div>
      <div className="sub">Both are {PLURAL[pending.tier]}. Comparison {pending.steps + 1}</div>
      <div className="vs2">
        {cards.map(([v, it, tag]) => (
          <button key={v} className="pick" onClick={() => onAnswer(v)}>
            <Cover item={it} className="ph" named={false} />
            <span className="tag">{tag}</span>
            <b>{it.name}</b>
            <span className="area">{it.area}</span>
          </button>
        ))}
      </div>
      <button className="same" disabled={!tieOk} onClick={() => onAnswer('same')}>
        {tieOk ? "Can't choose, tie them" : '3 already tied there, pick one'}
      </button>
      {onCancel && <button className="cta alt" style={{ flex: 'none' }} onClick={onCancel}>Never mind</button>}
    </div>
  );
}
