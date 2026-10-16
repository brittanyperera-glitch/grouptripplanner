import { useState } from 'react';
import { finalListFrom, tierOf } from '../lib/ranking';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Ranking } from '../types';
import Rerank from './Rerank';

// After the head to heads (Brittany 2026-10-15): each person orders their own list, draws up to 5.
// The group plan is rebuilt from the saved lists (group.ts) and locks once all five have saved.
export default function Finalize({ group, editing = false, onSaved }: { group: GroupResult; editing?: boolean; onSaved?: () => void }) {
  const { state, me, store, items } = useApp();
  const [draft, setDraft] = useState<Ranking | null>(null);
  const resp = me ? state.responses[me] : undefined;
  if (!me || !resp || !group.open || group.knockouts.length > 0 || !group.final || group.locked || (resp.final && !editing)) return null;

  const byId = Object.fromEntries(items.map(i => [i.id, i])) as Record<string, Item>;
  const list = draft ?? resp.final ?? finalListFrom(resp.ranking, group.knocked);
  const lost = (id: string) => (group.knocked.includes(id) && tierOf(resp.ranking, id) === 'must' ? 'Lost a head to head' : undefined);
  const save = () => {
    void store.saveResponse(me, { ranking: resp.ranking, final: list });
    setDraft(null); onSaved?.();
  };
  return (
    <Rerank ranking={list} byId={byId} draws onChange={next => setDraft(next)} onSubmit={save}
      title="Finalize your list" kicker="Last step" cta="Save my list" aboveTabs tag={lost}
      sub="Drag rows to reorder. The = button draws a row with the one above; up to 5 can share a spot. The group plan is rebuilt from everyone's lists." />
  );
}

/** Shown on the Group tab once my list is saved and the plan is not yet locked. */
export function EditListRow({ group, onEdit }: { group: GroupResult; onEdit: () => void }) {
  return (
    <section className="body edit-list" aria-label="Your final list">
      <div className="sub">Your list is saved. {group.finalized.length} of {PEOPLE.length} done.</div>
      <button className="link" onClick={onEdit}>Edit my list</button>
    </section>
  );
}
