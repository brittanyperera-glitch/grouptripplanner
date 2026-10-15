import './Premiere.css';
import Avatar from '../components/Avatar';
import { divisive, friendStats } from '../lib/friendship';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { Response } from '../types';

/** Friendship stats. Rendered only after all five have submitted. */
export default function Friends() {
  const { state, me, items } = useApp();
  if (!PEOPLE.every(p => state.responses[p]?.submitted)) return null;
  const viewer = me ?? PEOPLE[0];
  const rs = PEOPLE.map(p => state.responses[p]).filter((r): r is Response => !!r);
  const stats = friendStats(state.responses, viewer);
  const div = divisive(rs, items.map(i => i.id));
  const divItem = div && items.find(i => i.id === div.id);
  return (
    <section className="body" aria-label="Friendship stats">
      <div className="kicker">Friendship stats</div>
      <div className="friend-cards">
        {stats.twin && (
          <div className="friend-card"><Avatar name={stats.twin.name} size={44} /><span><small>Travel twin</small><b>{stats.twin.name}</b></span><em>{stats.twin.pct}%</em></div>
        )}
        {stats.clash && (
          <div className="friend-card"><Avatar name={stats.clash.name} size={44} /><span><small>Biggest clash</small><b>{stats.clash.name}</b></span><em>{stats.clash.pct}%</em></div>
        )}
        {div && divItem && (
          <div className="friend-card"><span><small>Most divisive</small><b>{divItem.name}</b></span><em>{div.label}</em></div>
        )}
      </div>
      <div className="friend-pairs" role="list" aria-label="Agreement by pair">
        {[...stats.pairs].sort((x, y) => y.pct - x.pct).map(p => (
          <div key={`${p.a}-${p.b}`} className="friend-pair" role="listitem">
            <span>{p.a} + {p.b}</span>
            <span className="friend-bar" aria-hidden="true"><i style={{ width: `${p.pct}%` }} /></span>
            <b>{p.pct}%</b>
          </div>
        ))}
      </div>
    </section>
  );
}
