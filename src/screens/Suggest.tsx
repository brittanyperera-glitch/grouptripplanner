import { useState } from 'react';
import { useApp } from '../state';
import { AREAS } from '../types';
import type { Area } from '../types';

export default function Suggest({ open }: { open: boolean }) {
  const { state, me, store } = useApp();
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<Area>(AREAS[0]);
  const [note, setNote] = useState('');
  const pending = state.suggestions.filter(s => s.status === 'pending');
  const live = state.suggestions.filter(s => s.status === 'live');
  const admin = me === 'Brittany' && !open;

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
      {open && <div className="sub">New ideas won't change this plan</div>}
      <input className="field" aria-label="Title" placeholder="Tea factory tour near Nuwara Eliya" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
      <select className="field" aria-label="Area" value={area} onChange={e => setArea(e.target.value as Area)}>
        {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <textarea className="field" aria-label="Note" placeholder="Why it's worth it (optional)" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} />
      <button className="cta" style={{ flex: 'none' }} disabled={!title.trim()} onClick={send}>Suggest it</button>
      {pending.length > 0 && (
        <div>
          <div className="tierhead">Waiting for Brittany</div>
          {pending.map(s => (
            <div key={s.id} className="row2 sug">
              <span><span className="nm">{s.title}</span><small>{s.area}, from {s.name}</small></span>
              {admin && (
                <span className="mv">
                  <button className="smallbtn" onClick={() => void store.setSuggestionStatus(s.id, 'live')}>Approve</button>
                  <button className="smallbtn" onClick={() => void store.setSuggestionStatus(s.id, 'rejected')}>Reject</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {live.length > 0 && (
        <div>
          <div className="tierhead">Live, everyone can rate it</div>
          {live.map(s => <div key={s.id} className="row2"><span><span className="nm">{s.title}</span><small>{s.area}, from {s.name}</small></span></div>)}
        </div>
      )}
    </section>
  );
}
