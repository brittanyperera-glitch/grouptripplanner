import { useState } from 'react';
import ItemSheet from '../components/ItemSheet';
import { Cover } from '../components/PhotoCard';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Item } from '../types';

export default function Extras({ group }: { group: GroupResult }) {
  const { items } = useApp();
  const [open, setOpen] = useState<Item | null>(null);
  if (group.days >= 14 || group.extras.length === 0) return null;
  return (
    <section className="body" aria-label="Extras">
      <div className="big display small">{`With 14 days instead of ${group.days} you'd also get`}</div>
      <ul className="is-list">
        {group.extras.map(e => {
          const item = items.find(i => i.id === e.id);
          return (
            <li key={e.id}>
              <button type="button" className="is-row" disabled={!item} aria-haspopup="dialog" onClick={() => item && setOpen(item)}>
                {item ? <Cover item={item} className="is-thumb" named={false} /> : <span className="is-thumb" />}
                <span className="is-copy">
                  <span className="is-rname">{item?.name ?? e.id}</span>
                  {item && <span className="is-meta">{item.hours} h</span>}
                  <span className="is-meta">{e.who.length} of {PEOPLE.length} want it</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && <ItemSheet items={[open]} title="Extra" onClose={() => setOpen(null)} />}
    </section>
  );
}
