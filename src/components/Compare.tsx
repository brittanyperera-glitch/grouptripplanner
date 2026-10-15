import { canTie, compareTarget } from '../lib/ranking';
import type { Item, Pending, Ranking } from '../types';
import { IconPin } from './Icons';
import { vtName } from '../screens/Rate';
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
      <div className={`kicker tier-${pending.tier}`}>Both are {PLURAL[pending.tier]}</div>
      <div className="big display">Which do you want more?</div>
      <div className="sub">Comparison {pending.steps + 1}. Tap the one you'd pick.</div>
      <div className="vs2 face">
        {cards.map(([v, it, tag]) => (
          <button key={`${v}:${it.id}`} className={`pick tall scene side-${v}`} style={{ viewTransitionName: vtName(it.id) }} onClick={() => onAnswer(v)}>
            <Cover item={it} className="ph" named={false} />
            <span className="pick-copy">
              <span className="tag">{tag}</span>
              <b>{it.name}</b>
              <span className="area"><IconPin size={12} />{it.area}</span>
            </span>
          </button>
        ))}
        <span className="vs" aria-hidden="true">VS</span>
      </div>
      <button className="same" disabled={!tieOk} onClick={() => onAnswer('same')}>
        {tieOk ? "Can't choose, tie them" : '3 already tied there, pick one'}
      </button>
      {onCancel && <button className="cta alt" onClick={onCancel}>Never mind</button>}
    </div>
  );
}
