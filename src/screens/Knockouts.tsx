import { useState } from 'react';
import type { ReactNode } from 'react';
import { IconCheck } from '../components/Icons';
import ItemSheet from '../components/ItemSheet';
import { Cover } from '../components/PhotoCard';
import { fitLine, VOTES_TO_RESOLVE } from '../lib/group';
import { score, tierOf } from '../lib/ranking';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Knockout, Player } from '../types';
import GenreVote, { genreOf } from './GenreVote';
import './Knockouts.css';

const SHOWN_NAMES = 2;
const REGION_FORK = 'region:north';
const WHY_WORDS = 25;

export default function Knockouts({ group }: { group: GroupResult }) {
  const { state, me, store, items } = useApp();
  const byId = Object.fromEntries(items.map(i => [i.id, i])) as Record<string, Item | undefined>;
  const nameOf = (id: string) => byId[id]?.name ?? id;
  const liked = (id: string) => PEOPLE.some(p => { const r = state.responses[p]; const t = r ? tierOf(r.ranking, id) : null; return t === 'must' || t === 'keen'; });
  const groupScore = (id: string) => PEOPLE.reduce((n, p) => { const r = state.responses[p]; return n + (r ? score(r.ranking, id) : 0); }, 0);
  // At most 2 names: items someone rated Must or Keen first (group score, then id), then "and N more".
  const ranked = (ids: string[]) => [...ids].sort((x, y) => Number(liked(y)) - Number(liked(x)) || groupScore(y) - groupScore(x) || (x < y ? -1 : 1));
  const names = (ids: string[]) => {
    const ordered = ranked(ids);
    const shown = ordered.slice(0, SHOWN_NAMES).map(nameOf).join(', ');
    return ordered.length > SHOWN_NAMES ? `${shown} and ${ordered.length - SHOWN_NAMES} more` : shown;
  };

  // Mine comes from the stored votes, not the group's tally, so a guest (never in the tally) sees it too.
  const choiceOf = (forkId: string) => state.votes.filter(v => v.forkId === forkId && v.name === me).at(-1)?.choice;
  const [sheet, setSheet] = useState<{ title: string; ids: string[]; forkId: string; choice: 'a' | 'b'; fit?: string } | null>(null);
  // Forks voted on this visit stay put and full size; only votes already stored when the view opens fold away.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [reopened, setReopened] = useState<Set<string>>(new Set());
  const [decidedOpen, setDecidedOpen] = useState(false);
  const add = (set: Set<string>, id: string) => new Set(set).add(id);
  const castVote = (forkId: string, choice: 'a' | 'b') => { if (me) { setFresh(f => add(f, forkId)); void store.vote({ forkId, name: me, choice }); } };
  const settled = (k: Knockout) => !k.genre && choiceOf(k.forkId) !== undefined && !fresh.has(k.forkId);
  const folded = (k: Knockout) => settled(k) && !reopened.has(k.forkId);

  // One option of a head to head: tap the card for the full page, the Vote pill to vote.
  const card = (k: Knockout, s: 'a' | 'b', tag: string, copy: ReactNode) => {
    const ids = s === 'a' ? k.a : k.b;
    const first = byId[ids[0]];
    const mine = choiceOf(k.forkId) === s;
    const label = k.forkId === REGION_FORK ? tag : names(ids);
    return (
      <div key={s} className={`pick tall list scene`} data-mine={mine}>
        {first && <Cover item={first} className="ph" named={false} />}
        {mine && <span className="mine" aria-hidden="true"><IconCheck size={16} /></span>}
        <button type="button" className="pick-open" aria-haspopup="dialog" aria-label={`Details of ${label}`}
          onClick={() => setSheet({ title: tag, ids, forkId: k.forkId, choice: s, fit: s === 'a' && k.fit ? fitLine(k.fit) : undefined })} />
        <span className="pick-copy">
          <span className="tag">{tag}</span>
          {copy}
          <button type="button" className="pick-vote" aria-pressed={mine} aria-label={`Vote for ${label}`} disabled={me === null}
            onClick={() => castVote(k.forkId, s)}>{mine ? 'Voted' : 'Vote'}</button>
        </span>
      </div>
    );
  };
  const side = (k: Knockout, s: 'a' | 'b') => card(k, s, s === 'a' ? 'Add' : 'Keep', <b>{names(s === 'a' ? k.a : k.b)}</b>);

  // Why there is a vote at all: the plan cannot hold both (Brittany 2026-10-16). Days needed are not stored, so none are claimed.
  const some = (ids: string[], all: boolean) => {
    const [first, ...rest] = ranked(ids).map(nameOf);
    return rest.length === 0 ? first : rest.length === 1 && all ? `${first} and ${rest[0]}` : `${first} and ${rest.length} more`;
  };
  const why = (k: Knockout) => {
    if (k.forkId === REGION_FORK) return `Going north and keeping the south don't both fit in ${group.days} days.`;
    const line = (all: boolean) => `The plan can't hold both in ${group.days} days. Adding ${some(k.a, all)} means dropping ${some(k.b, all)}.`;
    return line(true).split(/\s+/).length < WHY_WORDS ? line(true) : line(false);
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

  // One row for a fork I have already voted on: my pick, the dots, and Change to open it again.
  const compact = (k: Knockout, label: string, pick: string) => (
    <div key={k.forkId} role="group" aria-label={label} className="ko ko-done">
      <span className="ko-pick">You picked <b>{pick}</b></span>
      <span className="ko-tally">{tally(k)}</span>
      <button type="button" className="ko-change" aria-expanded="false" onClick={() => setReopened(r => add(r, k.forkId))}>Change</button>
    </div>
  );

  // North or South: one card, full lists on both sides (a = north, left; b = south, right).
  const region = (k: Knockout) => folded(k) ? compact(k, 'Knockout: North or South?', choiceOf(k.forkId) === 'a' ? 'North' : 'South') : (
    <div key={k.forkId} role="group" aria-label="Knockout: North or South?" className="ko">
      <div className="big display">North or South?</div>
      <p className="sub" data-testid="ko-why">{why(k)}</p>
      <div className="vs2 face">
        {(['a', 'b'] as const).map(s => card(k, s, s === 'a' ? 'North' : 'South', (s === 'a' ? k.a : k.b).map(id => <b key={id} className="line">{nameOf(id)}</b>)))}
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
  const mine = (k: Knockout) => !!me && ((k.votes.a as Player[]).includes(me) || (k.votes.b as Player[]).includes(me) || choiceOf(k.forkId) !== undefined);
  const short = (n: number) => VOTES_TO_RESOLVE - n;
  const need = (k: Knockout) => (k.genre
    ? Math.max(...k.a.map(id => { const t = k.genre!.tally[id]; return short(Math.max(t?.keep.length ?? 0, t?.drop.length ?? 0)); }))
    : short(Math.max(k.votes.a.length, k.votes.b.length)));
  const waiting = group.knockouts.length > 0 && group.knockouts.every(mine)
    ? Math.min(...group.knockouts.map(need))
    : null;

  // Votes still owed first, then forks voted before this visit, each group in its existing order.
  const ordered = [...group.knockouts.filter(k => !settled(k)), ...group.knockouts.filter(settled)];

  return (
    <section className="body" aria-label="Knockouts">
      {group.knockouts.length > 0 && <div className="kicker">Group knockouts</div>}
      {group.knockouts.length > 0 && <div className="big display">Vote on these</div>}
      {waiting !== null
        ? <div className="ko-wait" role="status">Waiting on votes to move onto the next knockout ({waiting} more needed).</div>
        : group.knockouts.length > 0 && (
          <div className="sub">
            {VOTES_TO_RESOLVE} of {PEOPLE.length} votes settle each one.
            {group.knockouts.some(k => k.forkId === REGION_FORK) && ' Head to heads on places come once North or South is settled.'}
          </div>
        )}
      {placesOpen && regionResult && <div className="tierhead"><IconCheck size={16} />{regionLine(regionResult)}</div>}
      {ordered.map(k => k.forkId === REGION_FORK ? region(k) : k.genre ? <GenreVote key={k.forkId} k={{ ...k, genre: k.genre }} /> : folded(k) ? compact(k, `Knockout: ${names(k.a)} or ${names(k.b)}`, names(choiceOf(k.forkId) === 'a' ? k.a : k.b)) : (
        <div key={k.forkId} role="group" aria-label={`Knockout: ${names(k.a)} or ${names(k.b)}`} className="ko">
          <p className="sub" data-testid="ko-why">{why(k)}</p>
          {k.fit && <p className="sub" data-testid="ko-fit">{fitLine(k.fit)}</p>}
          <div className="vs2 face">{side(k, 'a')}{side(k, 'b')}<span className="vs" aria-hidden="true">VS</span></div>
          {tally(k)}
        </div>
      ))}
      {decided.length > 0 && (
        <div>
          <button type="button" className="tierhead ko-decided" aria-expanded={decidedOpen} onClick={() => setDecidedOpen(o => !o)}><IconCheck size={16} />Decided {decided.length}</button>
          {decidedOpen && decided.map(r => (
            <div key={r.forkId} className="decided">
              {r.forkId === REGION_FORK && regionLine(r)}
              {r.forkId.startsWith('genre:') && genreLine(r)}
              {isItem(r) && r.winner === 'a' && `${names(r.a)} beat ${names(r.b)}`}
              {isItem(r) && r.winner === 'b' && `${names(r.b)} beat ${names(r.a)}`}
              {isItem(r) && r.winner === 'displaced' && `${names(r.a)} dropped out after an earlier result`}
              {isItem(r) && r.winner === 'nofit' && `${names(r.a)} doesn't fit the ${group.days}-day plan`}
            </div>
          ))}
        </div>
      )}
      {sheet && (
        <ItemSheet items={sheet.ids.flatMap(id => byId[id] ?? [])} title={sheet.title} fit={sheet.fit} onClose={() => setSheet(null)}
          voted={me !== null && choiceOf(sheet.forkId) === sheet.choice}
          onVote={me !== null ? () => { castVote(sheet.forkId, sheet.choice); setSheet(null); } : undefined} />
      )}
    </section>
  );
}
