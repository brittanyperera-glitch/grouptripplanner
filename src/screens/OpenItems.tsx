import './OpenItems.css';
import BigState from '../components/BigState';
import { IconRight } from '../components/Icons';
import type { OpenItem } from '../lib/openItems';

export default function OpenItems({ items, onGo, onBack }: { items: OpenItem[]; onGo(i: OpenItem): void; onBack(): void }) {
  return (
    <section className="body oi-page" aria-label="Open items">
      <button type="button" className="link oi-back" onClick={onBack}>Back</button>
      {items.length === 0
        ? (
          <BigState headline="All done." sub="Nothing to do. Enjoy the planning." action={{ label: 'Back to my trip', onClick: onBack }} />
        )
        : (
          <>
          <h2 className="big display">Open items</h2>
          <ul className="oi-list">
            {items.map(i => (
              <li key={i.id}>
                <button type="button" className="oi-row" onClick={() => onGo(i)}>
                  <span className="oi-label">{i.label}</span>
                  <span className="oi-go" aria-hidden="true"><IconRight size={20} /></span>
                </button>
              </li>
            ))}
          </ul>
          </>
        )}
    </section>
  );
}
