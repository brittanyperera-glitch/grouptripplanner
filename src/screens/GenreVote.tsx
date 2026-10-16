import { useState } from 'react';
import genresJson from '../data/genres.json';
import { IconCheck } from '../components/Icons';
import { Cover } from '../components/PhotoCard';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { Genre, Item, Knockout, Person, Player } from '../types';
import './GenreVote.css';

export const GENRES = genresJson.genres as Genre[];
export const genreOf = (id: string) => GENRES.find(g => g.id === id);
const article = (noun: string) => (/^[aeiou]/i.test(noun) ? 'an' : 'a');

// Same-type keep vote (group.ts): tick keep or skip for each place, saved together as one vote per place.
export default function GenreVote({ k }: { k: Knockout & { genre: NonNullable<Knockout['genre']> } }) {
  const { me, store, items } = useApp();
  const genre = genreOf(k.genre.id);
  const byId = new Map(items.map(i => [i.id, i] as const));
  const mineStored = (id: string) => (me && (k.genre.tally[id]?.drop as Player[] | undefined)?.includes(me) ? false : true);
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => Object.fromEntries(k.a.map(id => [id, mineStored(id)])));
  const [saved, setSaved] = useState<Record<string, boolean> | null>(() => (me && (k.votes.a as Player[]).includes(me) ? Object.fromEntries(k.a.map(id => [id, mineStored(id)])) : null));
  const [busy, setBusy] = useState(false);
  if (!genre) return null;

  const keep = (id: string) => ticks[id] ?? true;
  const same = saved !== null && k.a.every(id => saved[id] === keep(id));
  const save = async () => {
    if (!me) return;
    setBusy(true);
    const picks = Object.fromEntries(k.a.map(id => [id, keep(id)]));
    try {
      // One at a time: each write reads the stored votes first.
      for (const id of k.a) await store.vote({ forkId: `genre:${genre.id}:${id}`, name: me, choice: picks[id] ? 'a' : 'b' });
      setSaved(picks);
    } finally { setBusy(false); }
  };
  // The stored tally, with my saved ticks in place of any older ones until the group result catches up.
  const keeps = (id: string) => {
    const t = k.genre.tally[id] ?? { keep: [], drop: [] };
    const others = t.keep.filter((p: Person) => p !== me).length;
    return others + (saved && me && saved[id] ? 1 : 0);
  };

  const all = [...k.b, ...k.a];
  const first = byId.get(all[0])?.name ?? all[0];
  const title = `${all.length} ${genre.many} on the shortlist`;
  const row = (id: string, fixed: boolean) => {
    const item: Item | undefined = byId.get(id);
    const name = item?.name ?? id;
    const on = fixed || keep(id);
    return (
      <li key={id} className="gv-row" data-kept={on}>
        {item ? <Cover item={item} className="gv-thumb" named={false} /> : <span className="gv-thumb" />}
        <span className="gv-copy">
          <span className="gv-name">{name}</span>
          {fixed && <span className="gv-note">Already in</span>}
          {!fixed && saved && <span className="gv-note">{keeps(id)} of {PEOPLE.length} keep</span>}
        </span>
        {!fixed && (
          <button type="button" className="gv-toggle" aria-pressed={on} aria-label={`Keep ${name}`} disabled={!me || busy}
            onClick={() => setTicks(t => ({ ...t, [id]: !keep(id) }))}>
            {on ? 'Keep' : 'Skip'}
          </button>
        )}
      </li>
    );
  };

  return (
    <div role="group" aria-label={title} className="ko gv-card">
      <div className="gv-title">{title}</div>
      <p className="gv-remind">You already have {article(genre.one)} {genre.one}: {first}. Keep the others too?</p>
      <ul className="gv-list">
        {k.b.map(id => row(id, true))}
        {k.a.map(id => row(id, false))}
      </ul>
      <div className="gv-foot">
        {same
          ? <span className="gv-saved"><IconCheck size={16} />Saved</span>
          : <button type="button" className="cta gv-save" disabled={!me || busy} onClick={() => void save()}>Save my picks</button>}
      </div>
    </div>
  );
}
