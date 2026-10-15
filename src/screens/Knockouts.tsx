import { IconCheck } from '../components/Icons';
import { Cover } from '../components/PhotoCard';
import { score, tierOf } from '../lib/ranking';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Knockout } from '../types';

const SHOWN_NAMES = 2;
const REGION_FORK = 'region:north';

export default function Knockouts({ group }: { group: GroupResult }) {
  const { state, me, store, items } = useApp();
  const byId = Object.fromEntries(items.map(i => [i.id, i])) as Record<string, Item | undefined>;
  const nameOf = (id: string) => byId[id]?.name ?? id;
  const liked = (id: string) => PEOPLE.some(p => { const r = state.responses[p]; const t = r ? tierOf(r.ranking, id) : null; return t === 'must' || t === 'keen'; });
  const groupScore = (id: string) => PEOPLE.reduce((n, p) => { const r = state.responses[p]; return n + (r ? score(r.ranking, id) : 0); }, 0);
  // At most 2 names: items someone rated Must or Keen first (group score, then id), then "and N more".
  const names = (ids: string[]) => {
    const ordered = [...ids].sort((x, y) => Number(liked(y)) - Number(liked(x)) || groupScore(y) - groupScore(x) || (x < y ? -1 : 1));
    const shown = ordered.slice(0, SHOWN_NAMES).map(nameOf).join(', ');
    return ordered.length > SHOWN_NAMES ? `${shown} and ${ordered.length - SHOWN_NAMES} more` : shown;
  };

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
      <button className="pick tall scene" aria-pressed={mine} disabled={me === null} onClick={() => { if (me) void store.vote({ forkId: k.forkId, name: me, choice: s }); }}>
        {first && <Cover item={first} className="ph" named={false} />}
        {mine && <span className="mine" aria-hidden="true"><IconCheck size={16} /></span>}
        <span className="pick-copy">
          <span className="tag">{s === 'a' ? 'Add' : 'Keep'}</span>
          <b>{names(ids)}</b>
          <span className="chips">
            {chips(ids).map(c => <span key={c.key} className={`chip ${c.t}`}>{c.p} {c.t === 'must' ? 'Must' : 'Keen'}</span>)}
          </span>
        </span>
      </button>
    );
  };

  // One dot per friend: left side's votes, right side's votes, then the ones still to vote.
  const tally = (k: Knockout) => (
    <div className="tally">
      <span className="dots" aria-hidden="true">
        {PEOPLE.map((p, i) => <span key={p} className={i < k.votes.a.length ? 'a' : i < k.votes.a.length + k.votes.b.length ? 'b' : ''} />)}
      </span>
      <span className="sub">{k.votes.a.length + k.votes.b.length} of {PEOPLE.length} voted</span>
    </div>
  );

  // North or South: one card, full lists on both sides (a = north, left; b = south, right).
  const region = (k: Knockout) => (
    <div key={k.forkId} role="group" aria-label="Knockout: North or South?" className="ko">
      <div className="big display">North or South?</div>
      <div className="vs2 face">
        {(['a', 'b'] as const).map(s => {
          const ids = s === 'a' ? k.a : k.b;
          const first = byId[ids[0]];
          const mine = me !== null && k.votes[s].includes(me);
          return (
            <button key={s} className="pick tall scene" aria-pressed={mine} disabled={me === null} onClick={() => { if (me) void store.vote({ forkId: k.forkId, name: me, choice: s }); }}>
              {first && <Cover item={first} className="ph" named={false} />}
              {mine && <span className="mine" aria-hidden="true"><IconCheck size={16} /></span>}
              <span className="pick-copy">
                <span className="tag">{s === 'a' ? 'North' : 'South'}</span>
                {ids.map(id => <b key={id} className="line">{nameOf(id)}</b>)}
              </span>
            </button>
          );
        })}
        <span className="vs" aria-hidden="true">VS</span>
      </div>
      {tally(k)}
    </div>
  );

  return (
    <section className="body" aria-label="Knockouts">
      {group.knockouts.length > 0 && <div className="kicker">Group knockouts</div>}
      {group.knockouts.length > 0 && <div className="big display">Vote on these</div>}
      {group.knockouts.length > 0 && <div className="sub">Three votes settle each one.</div>}
      {group.knockouts.map(k => k.forkId === REGION_FORK ? region(k) : (
        <div key={k.forkId} role="group" aria-label={`Knockout: ${names(k.a)} or ${names(k.b)}`} className="ko">
          <div className="vs2 face">{side(k, 'a')}{side(k, 'b')}<span className="vs" aria-hidden="true">VS</span></div>
          {tally(k)}
        </div>
      ))}
      {group.results.length > 0 && (
        <div>
          <div className="tierhead"><IconCheck size={16} />Decided</div>
          {group.results.map(r => (
            <div key={r.forkId} className="decided">
              {r.forkId === REGION_FORK && `${r.winner === 'a' ? 'North' : 'South'} beat ${r.winner === 'a' ? 'South' : 'North'}`}
              {r.forkId !== REGION_FORK && r.winner === 'a' && `${names(r.a)} beat ${names(r.b)}`}
              {r.forkId !== REGION_FORK && r.winner === 'b' && `${names(r.b)} beat ${names(r.a)}`}
              {r.forkId !== REGION_FORK && r.winner === 'displaced' && `${names(r.a)} dropped out after an earlier result`}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
