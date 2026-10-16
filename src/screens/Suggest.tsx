import { useState } from 'react';
import { useApp } from '../state';
import { AREAS } from '../types';
import type { Area, Suggestion } from '../types';

// Same idea from several people is one row: same title (case and spacing aside) in the same area.
function groupByIdea(list: Suggestion[]): Suggestion[][] {
  const groups = new Map<string, Suggestion[]>();
  for (const s of list) {
    const key = `${s.title.trim().toLowerCase()}|${s.area}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()];
}

export default function Suggest({ open }: { open: boolean }) {
  const { state, me, store } = useApp();
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<Area>(AREAS[0]);
  const [note, setNote] = useState('');
  const pending = state.suggestions.filter(s => s.status === 'pending');
  const live = state.suggestions.filter(s => s.status === 'live');
  const admin = me === 'Brittany';
  const ideas = groupByIdea(pending);

  const send = () => {
    if (!me || !title.trim()) return;
    void store.addSuggestion({ name: me, title: title.trim(), area, note: note.trim() });
    setTitle('');
    setNote('');
  };

  return (
    <section className="body" aria-label="Ideas">
      <div className="kicker">Suggest</div>
      <div className="big display">Something missing?</div>
      {open && <div className="sub">Approved ideas go to the group vote.</div>}
      <input className="field" aria-label="Title" placeholder="Tea factory tour near Nuwara Eliya" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
      <select className="field" aria-label="Area" value={area} onChange={e => setArea(e.target.value as Area)}>
        {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <textarea className="field" aria-label="Note" placeholder="Why it's worth it (optional)" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} />
      <button className="cta" style={{ flex: 'none' }} disabled={!title.trim()} onClick={send}>Suggest it</button>
      {pending.length > 0 && (
        <div>
          <div className="tierhead">Waiting for Brittany</div>
          {ideas.map(g => {
            const [first] = g, names = [...new Set(g.map(s => s.name))];
            const from = names.length > 1 ? `${names.length} people suggested this (${names.join(', ')})` : `from ${first.name}`;
            return (
              <div key={first.id} className="row2 sug">
                <span><span className="nm">{first.title}</span><small>{`${first.area}, ${from}`}</small></span>
                {admin && (
                  <span className="mv">
                    <button className="smallbtn" onClick={() => g.forEach((s, i) => void store.setSuggestionStatus(s.id, i === 0 ? 'live' : 'rejected'))}>Approve</button>
                    <button className="smallbtn" onClick={() => g.forEach(s => void store.setSuggestionStatus(s.id, 'rejected'))}>Reject</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {live.length > 0 && (
        <div>
          <div className="tierhead">{open ? 'Approved, going to the group vote' : 'Live, everyone can rate it'}</div>
          {live.map(s => <div key={s.id} className="row2"><span><span className="nm">{s.title}</span><small>{s.area}, from {s.name}</small></span></div>)}
        </div>
      )}
    </section>
  );
}
