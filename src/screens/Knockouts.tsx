import { Cover } from '../components/PhotoCard';
import { tierOf } from '../lib/ranking';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Knockout } from '../types';

export default function Knockouts({ group }: { group: GroupResult }) {
  const { state, me, store, items } = useApp();
  const byId = Object.fromEntries(items.map(i => [i.id, i])) as Record<string, Item | undefined>;
  const names = (ids: string[]) => ids.map(id => byId[id]?.name ?? id).join(', ');

  const chips = (ids: string[]) => PEOPLE.flatMap(p => ids.map(id => {
    const r = state.responses[p];
    const t = r ? tierOf(r.ranking, id) : null;
    return t === 'must' || t === 'keen' ? { key: `${p}:${id}`, p, t } : null;
  })).filter((c): c is { key: string; p: typeof PEOPLE[number]; t: 'must' | 'keen' } => c !== null);

  const side = (k: Knockout, s: 'a' | 'b') => {
    const ids = s === 'a' ? k.a : k.b;
    const first = byId[ids[0]];
    const mine = me !== null && k.votes[s].includes(me);
    return (
      <button className="pick" aria-pressed={mine} disabled={me === null} onClick={() => { if (me) void store.vote({ forkId: k.forkId, name: me, choice: s }); }}>
        {first && <Cover item={first} className="ph" named={false} />}
        <span className="tag">{s === 'a' ? 'Add' : 'Keep'}</span>
        <b>{names(ids)}</b>
        <span className="chips">
          {chips(ids).map(c => <span key={c.key} className={`chip ${c.t}`}>{c.p} {c.t === 'must' ? 'Must' : 'Keen'}</span>)}
        </span>
      </button>
    );
  };

  return (
    <section className="body" aria-label="Knockouts">
      <div className="big">{group.knockouts.length > 0 ? 'Vote on these' : 'Decided'}</div>
      {group.knockouts.length > 0 && <div className="sub">Three votes settle each one.</div>}
      {group.knockouts.map(k => (
        <div key={k.forkId} role="group" aria-label={`Knockout: ${names(k.a)} or ${names(k.b)}`} className="ko">
          <div className="vs2">{side(k, 'a')}{side(k, 'b')}</div>
          <div className="sub">{k.votes.a.length + k.votes.b.length} of {PEOPLE.length} voted</div>
        </div>
      ))}
      {group.results.length > 0 && (
        <div>
          {group.results.map(r => (
            <div key={r.forkId} className="row2">
              <span>
                {r.winner === 'a' && `Decided: ${names(r.a)} over ${names(r.b)}`}
                {r.winner === 'b' && `Decided: ${names(r.b)} over ${names(r.a)}`}
                {r.winner === 'displaced' && `${names(r.a)} was displaced by an earlier result`}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
