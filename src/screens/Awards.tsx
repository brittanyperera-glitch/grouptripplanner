import { useEffect, useRef } from 'react';
import Avatar from '../components/Avatar';
import copy from '../content/awards.json';
import type { Award } from '../lib/awards';
import { andList } from '../lib/text';
import './Awards.css';

const COPY = copy as Record<string, { title: string; line: string }>;

const fill = (line: string, a: Award) => line.replace('{value}', String(a.value)).replace('{unit}', a.unit);

export default function Awards({ awards, onClose }: { awards: Award[]; onClose(): void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="aw-screen" role="dialog" aria-modal="true" aria-labelledby="aw-head">
      <header className="aw-top">
        <h2 id="aw-head">The group awards</h2>
        <button type="button" className="aw-close" onClick={onClose}>Close</button>
      </header>
      <div className="aw-list">
        {awards.map(a => {
          const c = COPY[a.id];
          return (
            <article className="aw-card" key={a.id}>
              <h3 className="aw-title">{c?.title ?? a.id}</h3>
              <div className="aw-faces">{a.winners.map(w => <Avatar key={w} name={w} size={120} crop="bust" />)}</div>
              <p className="aw-name">{andList(a.winners)}</p>
              <p className="aw-line">{c ? fill(c.line, a) : `${a.value} ${a.unit}`}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
