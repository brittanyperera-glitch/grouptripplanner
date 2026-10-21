import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isAdmin } from '../lib/override';
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

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = async () => {
    const t = text.trim();
    if (!me || !t || busy) return;
    setBusy(true); setFailed(false);
    try {
      await store.addComplaint({ name: me, text: t });
      setSent(s => [...s, { id: `sent:${s.length}`, name: me, text: t, createdAt: new Date().toISOString() }]);
      setText('');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  // Everyone sees their own; Brittany sees everyone's.
  const seen = (c: Complaint) => isAdmin(me) || c.name === me;
  const list = [...loaded, ...sent].filter(seen);

  return (
    <section className="body" aria-label="Complaints">
      <div className="kicker">Not happy?</div>
      <div className="big display">Complaints</div>
      {children}
      <textarea className="field" aria-label="Your complaint" placeholder="What would you change?" rows={3} maxLength={MAX} value={text} onChange={e => setText(e.target.value)} />
      <button type="button" className="cta" style={{ flex: 'none' }} disabled={!me || !text.trim() || busy} onClick={() => void send()}>{busy ? 'Sending' : 'Send'}</button>
      {failed && <div className="sub" role="alert">Couldn't send that. Your text is still here, try again.</div>}
      {list.length > 0 && (
        <div>
          <div className="tierhead">{isAdmin(me) ? 'From the group' : 'You said'}</div>
          {list.map(c => (
            <div key={c.id} className="decided">{isAdmin(me) ? `${c.name}: ${c.text}` : c.text}</div>
          ))}
        </div>
      )}
    </section>
  );
}
