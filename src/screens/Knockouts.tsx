import { IconCheck } from '../components/Icons';
import { Cover } from '../components/PhotoCard';
import { VOTES_TO_RESOLVE } from '../lib/group';
import { score, tierOf } from '../lib/ranking';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Knockout } from '../types';
import GenreVote, { genreOf } from './GenreVote';

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
            <button key={s} className="pick tall list scene" aria-pressed={mine} disabled={me === null} onClick={() => { if (me) void store.vote({ forkId: k.forkId, name: me, choice: s }); }}>
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

  // The place head to heads only exist once North or South is settled (group.ts, D6), so the
  // region result heads them and leaves the Decided list.
  const regionResult = group.results.find(r => r.forkId === REGION_FORK);
  const regionLine = (r: typeof group.results[number]) => `${r.winner === 'a' ? 'North' : 'South'} beat ${r.winner === 'a' ? 'South' : 'North'}`;
  const placesOpen = group.knockouts.some(k => k.forkId !== REGION_FORK);
  // "Safari: kept Yala leopard safari, dropped Udawalawe elephants and Transit Home"
  const genreLine = (r: typeof group.results[number]) => {
    const label = genreOf(r.forkId.slice('genre:'.length).split('#')[0])?.label ?? 'Same type';
    const parts = [r.a.length ? `kept ${r.a.map(nameOf).join(', ')}` : '', r.b.length ? `dropped ${r.b.map(nameOf).join(', ')}` : ''].filter(Boolean);
    return `${label}: ${parts.join(', ')}`;
  };
  const decided = group.results.filter(r => !(placesOpen && r === regionResult));
  const isItem = (r: typeof group.results[number]) => r.forkId !== REGION_FORK && !r.forkId.startsWith('genre:');
  // Once I have voted on every open question, say what we are waiting for: the votes that settle the leading one
  // (Brittany 2026-10-15: "say waiting on votes to move onto next knockout").
  // A keep vote needs every place settled, so the place furthest from three decides it.
  const mine = (k: Knockout) => !!me && (k.votes.a.includes(me) || k.votes.b.includes(me));
  const short = (n: number) => VOTES_TO_RESOLVE - n;
  const need = (k: Knockout) => (k.genre
    ? Math.max(...k.a.map(id => { const t = k.genre!.tally[id]; return short(Math.max(t?.keep.length ?? 0, t?.drop.length ?? 0)); }))
    : short(Math.max(k.votes.a.length, k.votes.b.length)));
  const waiting = group.knockouts.length > 0 && group.knockouts.every(mine)
    ? Math.min(...group.knockouts.map(need))
    : null;

  return (
    <section className="body" aria-label="Knockouts">
      {group.knockouts.length > 0 && <div className="kicker">Group knockouts</div>}
      {group.knockouts.length > 0 && <div className="big display">Vote on these</div>}
      {waiting !== null
        ? <div className="ko-wait" role="status">Waiting on votes to move onto the next knockout ({waiting} more needed).</div>
        : group.knockouts.length > 0 && (
          <div className="sub">
            Three votes settle each one.
            {group.knockouts.some(k => k.forkId === REGION_FORK) && ' Head to heads on places come once North or South is settled.'}
          </div>
        )}
      {placesOpen && regionResult && <div className="tierhead"><IconCheck size={16} />{regionLine(regionResult)}</div>}
      {group.knockouts.map(k => k.forkId === REGION_FORK ? region(k) : k.genre ? <GenreVote key={k.forkId} k={{ ...k, genre: k.genre }} /> : (
        <div key={k.forkId} role="group" aria-label={`Knockout: ${names(k.a)} or ${names(k.b)}`} className="ko">
          <div className="vs2 face">{side(k, 'a')}{side(k, 'b')}<span className="vs" aria-hidden="true">VS</span></div>
          {tally(k)}
        </div>
      ))}
      {decided.length > 0 && (
        <div>
          <div className="tierhead"><IconCheck size={16} />Decided</div>
          {decided.map(r => (
            <div key={r.forkId} className="decided">
              {r.forkId === REGION_FORK && regionLine(r)}
              {r.forkId.startsWith('genre:') && genreLine(r)}
              {isItem(r) && r.winner === 'a' && `${names(r.a)} beat ${names(r.b)}`}
              {isItem(r) && r.winner === 'b' && `${names(r.b)} beat ${names(r.a)}`}
              {isItem(r) && r.winner === 'displaced' && `${names(r.a)} dropped out after an earlier result`}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
