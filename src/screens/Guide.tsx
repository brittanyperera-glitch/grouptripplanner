import { useState } from 'react';
import guide from '../content/guide.json';
import Avatar from '../components/Avatar';

type Entry = { title?: string; body?: string; list?: string[]; after?: string };
type Phrase = { english: string; sinhala: string; say: string };
type Section = { id: string; label: string; intro?: string; entries?: Entry[]; phrases?: Phrase[] };

const SECTIONS = guide.sections as Section[];

/** "Elawolu roti (roti parcels...)": the name before the bracket is bold (Brittany 2026-10-15), the rest stays as written. */
function Named({ text }: { text: string }) {
  const m = /^([^(]+?)(\s*\(.*)$/s.exec(text);
  return m ? <><b>{m[1]}</b>{m[2]}</> : <b>{text}</b>;
}

export default function Guide() {
  const [id, setId] = useState(SECTIONS[0].id);
  const section = SECTIONS.find(s => s.id === id) ?? SECTIONS[0];
  return (
    <section className="body guide" aria-label="Guide">
      <header className="guide-head">
        <Avatar name="Brittany" size={52} />
        <h1 className="big display guide-name">Britt's guide</h1>
      </header>
      <div className="guide-chips" role="group" aria-label="Guide sections">
        {SECTIONS.map(s => (
          <button key={s.id} aria-pressed={s.id === section.id} onClick={() => setId(s.id)}>{s.id}</button>
        ))}
      </div>
      <div className="guide-section" role="region" aria-label={section.id}>
        <h2 className="big guide-title">{section.label}</h2>
        {section.intro && <p className="guide-intro">{section.intro}</p>}
        {section.phrases ? (
          <ul className="guide-phrases">
            {section.phrases.map(p => (
              <li key={p.english}>
                <span className="gp-en">{p.english}</span>
                <span className="gp-si">{p.sinhala}</span>
                <span className="gp-say">{p.say}</span>
              </li>
            ))}
          </ul>
        ) : (
          section.entries?.map((e, i) => (
            <article className="guide-entry" key={e.title ?? i}>
              {e.title && <h3><span className="guide-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{e.title}</h3>}
              {e.body && <p>{e.body}</p>}
              {e.list && <ul>{e.list.map(l => <li key={l}><Named text={l} /></li>)}</ul>}
              {e.after && <p>{e.after}</p>}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
