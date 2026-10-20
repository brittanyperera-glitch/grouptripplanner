import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../state';
import type { Complaint } from '../types';

const MAX = 500;

/** The Group tab's complaints page: the actions come in as children, then a box to say what is wrong. */
export default function Complaints({ children }: { children: ReactNode }) {
  const { me, store } = useApp();
  const [text, setText] = useState('');
  const [sent, setSent] = useState<Complaint[]>([]);
  const [loaded, setLoaded] = useState<Complaint[]>([]);
  useEffect(() => {
    let live = true;
    store.loadComplaints().then(rows => { if (live) setLoaded(rows); }).catch(() => { /* table not there yet: the list starts empty */ });
    return () => { live = false; };
  }, [store]);

  const send = () => {
    const t = text.trim();
    if (!me || !t) return;
    void store.addComplaint({ name: me, text: t });
    setSent(s => [...s, { id: `sent:${s.length}`, name: me, text: t, createdAt: new Date().toISOString() }]);
    setText('');
  };
  // Everyone sees their own; Brittany sees everyone's.
  const seen = (c: Complaint) => me === 'Brittany' || c.name === me;
  const list = [...loaded, ...sent].filter(seen);

  return (
    <section className="body" aria-label="Complaints">
      <div className="kicker">Not happy?</div>
      <div className="big display">Complaints</div>
      {children}
      <textarea className="field" aria-label="Your complaint" placeholder="What would you change?" rows={3} maxLength={MAX} value={text} onChange={e => setText(e.target.value)} />
      <button type="button" className="cta" style={{ flex: 'none' }} disabled={!me || !text.trim()} onClick={send}>Send</button>
      {list.length > 0 && (
        <div>
          <div className="tierhead">{me === 'Brittany' ? 'From the group' : 'You said'}</div>
          {list.map(c => (
            <div key={c.id} className="decided">{me === 'Brittany' ? `${c.name}: ${c.text}` : c.text}</div>
          ))}
        </div>
      )}
    </section>
  );
}
