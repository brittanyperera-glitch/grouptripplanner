import { useApp } from '../state';
import type { GroupResult } from '../types';

export default function Extras({ group }: { group: GroupResult }) {
  const { items } = useApp();
  if (group.days >= 14 || group.extras.length === 0) return null;
  return (
    <section className="body" aria-label="Extras">
      <div className="big">{`With 14 days instead of ${group.days} you'd also get`}</div>
      {group.extras.map(e => (
        <div key={e.id} className="row2">
          <span>{items.find(i => i.id === e.id)?.name ?? e.id}</span>
          <span>{e.who.map(w => `${w.name} (${w.tier === 'must' ? 'Must' : 'Keen'})`).join(', ')}</span>
        </div>
      ))}
    </section>
  );
}
