import { useState } from 'react';
import { finalListFrom, move, removeId, tierOf } from '../lib/ranking';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Ranking, Tier } from '../types';
import Rerank from './Rerank';

// After the head to heads (Brittany 2026-10-15): each person orders their own list, draws up to 5.
// The group plan is rebuilt from the saved lists (group.ts) and locks once all five have saved.
export default function Finalize({ group }: { group: GroupResult }) {
  const { state, me, store, items } = useApp();
  const [draft, setDraft] = useState<Ranking | null>(null);
  const [editing, setEditing] = useState(false);
  const resp = me ? state.responses[me] : undefined;
  if (!me || !resp || !group.open || group.knockouts.length > 0 || !group.final || group.locked) return null;

  if (resp.final && !editing) {
    return (
      <section className="body" aria-label="Your final list">
        <div className="sub">Your final list is saved. {group.finalized.length} of {PEOPLE.length} done.</div>
        <button className="link" onClick={() => { setDraft(structuredClone(resp.final!)); setEditing(true); }}>Change my list</button>
      </section>
    );
  }

  const byId = Object.fromEntries(items.map(i => [i.id, i])) as Record<string, Item>;
  const list = draft ?? resp.final ?? finalListFrom(resp.ranking, group.knocked);
  const change = (f: (r: Ranking) => void) => { const r = structuredClone(list); f(r); setDraft(r); };
  const onRetier = (id: string, t: Tier) => { if (tierOf(list, id) !== t) change(r => { removeId(r, id); r[t].push([id]); }); };
  const lost = (id: string) => (group.knocked.includes(id) && tierOf(resp.ranking, id) === 'must' ? 'Lost a head to head' : undefined);
  const save = () => {
    void store.saveResponse(me, { ranking: resp.ranking, final: list });
    setDraft(null); setEditing(false);
  };
  return (
    <Rerank ranking={list} byId={byId} onMove={(id, dir) => change(r => move(r, id, dir))} onRetier={onRetier} onSubmit={save}
      title="Finalize your list" kicker="Last step" cta="Save my list" sticky={false} tag={lost}
      sub="Move things up or down. Up to 5 can share a spot. The group plan is rebuilt from everyone's lists." />
  );
}
