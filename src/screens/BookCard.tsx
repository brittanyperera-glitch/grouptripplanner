import './GroupHub.css';
import { IconBook } from '../components/Icons';
import type { Item } from '../types';

/** The "Book before you go" list from Plan, folded to one headline that carries the count. Takes the chosen items. */
export default function BookCard({ chosen }: { chosen: Item[] }) {
  const book = chosen.filter(i => i.book);
  if (book.length === 0) return null;
  return (
    <details className="card-list gh-book">
      <summary className="tierhead"><IconBook size={16} />{book.length === 1 ? '1 thing' : `${book.length} things`} to book soon</summary>
      {book.map(i => <div key={i.id} className="row2"><span>{i.name}</span><span>{i.book}</span></div>)}
    </details>
  );
}
