import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconExternal, IconPin, IconWarn } from './Icons';
import { Cover } from './PhotoCard';
import { factPills } from '../screens/Rate';
import type { Item } from '../types';
import './ItemSheet.css';

interface Props { items: Item[]; title: string; fit?: string; onClose(): void; onVote?(): void; voted?: boolean }

// Full-screen detail page for one option: every place in it, with the vote button when there is something to vote on.
export default function ItemSheet({ items, title, fit, onClose, onVote, voted = false }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeNow = useRef(onClose);
  closeNow.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNow.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, []);

  return createPortal(
    <div className="is-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="is-head">
        <h2 className="is-title">{title}</h2>
        <button ref={closeRef} type="button" className="is-close" onClick={onClose}>Close</button>
      </header>
      <div className="is-scroll">
        {fit && <p className="is-fit" data-testid="is-fit">{fit}</p>}
        {items.map(item => (
          <article key={item.id} className="is-item">
            <Cover item={item} className="is-photo" named={false} credit />
            <h3 className="is-name">{item.name}</h3>
            <div className="is-where"><IconPin size={13} />{item.category ? `${item.area} · ${item.category}` : item.area}</div>
            <div className="pills">
              {factPills(item).map(([icon, text]) => <span key={text} className="pill">{icon}<span>{text}</span></span>)}
            </div>
            {item.about && <p className="about">{item.about}</p>}
            {item.warn && <div className="fact-warn"><IconWarn size={16} /><span><b>Heads up:</b> {item.warn}</span></div>}
            {item.book && <p className="about"><b>Book:</b> {item.book}</p>}
            {item.google && (
              <a className="gr" href={item.google.url} target="_blank" rel="noopener noreferrer">
                {`Google ${item.google.rating} (${item.google.reviews} reviews)`}<IconExternal size={15} />
              </a>
            )}
          </article>
        ))}
      </div>
      {onVote && (
        <footer className="is-foot">
          {voted
            ? <span className="is-voted"><IconCheck size={16} />Your vote</span>
            : <button type="button" className="cta" onClick={onVote}>Vote for this</button>}
        </footer>
      )}
    </div>,
    document.body,
  );
}
