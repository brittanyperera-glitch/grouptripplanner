import './OpenItems.css';
import { IconRight } from '../components/Icons';
import type { OpenItem } from '../lib/openItems';

export default function OpenItems({ items, onGo, onBack }: { items: OpenItem[]; onGo(i: OpenItem): void; onBack(): void }) {
  return (
    <section className="body oi-page" aria-label="Open items">
      <button type="button" className="link oi-back" onClick={onBack}>Back</button>
      <h2 className="big display">Open items</h2>
      {items.length === 0
        ? <p className="sub oi-empty">Nothing to do. Enjoy the planning.</p>
        : (
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
        )}
    </section>
  );
}
