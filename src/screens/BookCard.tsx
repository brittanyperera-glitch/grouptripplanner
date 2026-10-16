import './GroupHub.css';
import { IconBook } from '../components/Icons';
import type { Item, Plan } from '../types';

export interface DayTip { day: number; name: string; text: string }

/** Each chosen item's Good to know tip, with the first day it is visited (null when no day carries it). */
export function tipsOf(plan: Plan, chosen: Item[]): { item: Item; day: number | null }[] {
  return chosen.filter(i => i.warn).map(item => ({ item, day: plan.days.find(d => d.entries.some(e => e.itemId === item.id))?.n ?? null }));
}

/** "Before you go" on Group trip: one folded card; tips that sit on a day show there, the rest stay here. */
export default function BookCard({ chosen, plan }: { chosen: Item[]; plan: Plan }) {
  const book = chosen.filter(i => i.book);
  const tips = tipsOf(plan, chosen);
  if (book.length === 0 && tips.length === 0) return null;
  const loose = tips.filter(t => t.day === null);
  const parts = [book.length > 0 && `${book.length} to book`, tips.length > 0 && `${tips.length} ${tips.length === 1 ? 'tip' : 'tips'}`].filter(Boolean);
  return (
    <details className="card-list gh-book">
      <summary className="tierhead"><IconBook size={16} />Before you go: {parts.join(', ')}</summary>
      {book.map(i => <div key={i.id} className="row2"><span>{i.name}</span><span>{i.book}</span></div>)}
      {loose.map(({ item }) => <div key={item.id} className="row2"><span>{item.name}</span><span>{item.warn}</span></div>)}
    </details>
  );
}
