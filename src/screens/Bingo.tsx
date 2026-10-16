import { useState } from 'react';
import { useApp } from '../state';
import { PEOPLE, type BingoCard, type BingoSquare, type Person } from '../types';
import Avatar from '../components/Avatar';
import BigState from '../components/BigState';
import { IconCheck, IconLeft, IconPlus } from '../components/Icons';
import './Bingo.css';

export const SQUARES = 9;
export const MAX_TEXT = 60;
const LINES: number[][] = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

const lineDone = (card: BingoCard, l: number[]) => l.every(i => card.squares[i]?.ticked);
/** How many rows, columns and diagonals are fully ticked (0 to 8). */
export const lines = (card: BingoCard): number => LINES.filter(l => lineDone(card, l)).length;
export const isFullHouse = (card: BingoCard): boolean => card.squares.length === SQUARES && card.squares.every(s => s.ticked);
const ticks = (card: BingoCard) => card.squares.filter(s => s.ticked).length;
const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const COPY = {
  title: 'Travel Bingo',
  lock: 'Your cards are only shown to you in the app.',
  empty: 'Predict what will happen on the trip, then tick it off when it does.',
  emptyHead: 'Make your first card.',
  example: 'Monkey steals food',
  newCard: 'New card',
  back: 'Back',
  titleLabel: 'Card title',
  titleHint: 'e.g. Things that will go wrong',
  squareHint: 'e.g. Monkey steals food',
  about: 'About',
  general: 'General',
  save: 'Save card',
  cancel: 'Cancel',
  edit: 'Edit card',
  del: 'Delete card',
  delAsk: 'Delete this card for good?',
  delYes: 'Yes, delete',
  delNo: 'Keep it',
  line: 'Line!',
  lines: (n: number) => `${n} lines!`,
  full: 'Full house',
};

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

type View = { kind: 'list' } | { kind: 'edit'; id: string | null } | { kind: 'play'; id: string };

interface Draft { title: string; texts: string[]; about: (Person | '')[] }
const draftOf = (c?: BingoCard): Draft => ({
  title: c?.title ?? '',
  texts: Array.from({ length: SQUARES }, (_, i) => c?.squares[i]?.text ?? ''),
  about: Array.from({ length: SQUARES }, (_, i) => c?.squares[i]?.about ?? ''),
});

export default function Bingo({ onBack }: { onBack(): void }) {
  const { me, state, store } = useApp();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [draft, setDraft] = useState<Draft>(draftOf());
  const [confirmDel, setConfirmDel] = useState(false);
  if (!me) return null;
  // Only my own row is ever read: there is no path to anyone else's cards.
  const cards: BingoCard[] = state.stays?.crew[me]?.bingo ?? [];
  const persist = (next: BingoCard[]) => { void store.saveCrewStays(me, { bingo: next }); };
  const find = (id: string) => cards.find(c => c.id === id);

  const goList = () => { setConfirmDel(false); setView({ kind: 'list' }); };
  const open = (c: BingoCard) => { setConfirmDel(false); setView({ kind: 'play', id: c.id }); };
  const startEdit = (c?: BingoCard) => { setDraft(draftOf(c)); setView({ kind: 'edit', id: c?.id ?? null }); };

  const header = (onLeft: () => void, right?: React.ReactNode) => (
    <div className="bg-top">
      <button type="button" className="bg-back" aria-label={COPY.back} onClick={onLeft}><IconLeft size={20} /></button>
      {right}
    </div>
  );
  const lock = <div className="sub bg-lock"><LockIcon />{COPY.lock}</div>;

  if (view.kind === 'edit') {
    const existing = view.id ? find(view.id) : undefined;
    const complete = draft.title.trim() !== '' && draft.texts.every(t => t.trim() !== '');
    const save = () => {
      if (!complete) return;
      const squares: BingoSquare[] = draft.texts.map((t, i) => {
        const text = t.trim();
        const sq: BingoSquare = { text, ticked: existing?.squares[i]?.text === text ? !!existing.squares[i].ticked : false };
        if (draft.about[i]) sq.about = draft.about[i] as Person;
        return sq;
      });
      const card: BingoCard = { id: existing?.id ?? newId(), title: draft.title.trim(), squares, createdAt: existing?.createdAt ?? new Date().toISOString() };
      persist(existing ? cards.map(c => (c.id === card.id ? card : c)) : [...cards, card]);
      goList();
    };
    return (
      <div className="body bg">
        {header(existing ? () => open(existing) : goList)}
        <div className="big display small">{existing ? COPY.edit : COPY.newCard}</div>
        {lock}
        <label className="bg-field">
          <span className="bg-label">{COPY.titleLabel}</span>
          <input className="field" value={draft.title} maxLength={MAX_TEXT} placeholder={COPY.titleHint}
            onChange={e => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <ol className="bg-edit-list">
          {draft.texts.map((t, i) => (
            <li key={i} className="bg-edit-row">
              <input className="field" aria-label={`Square ${i + 1}`} value={t} maxLength={MAX_TEXT} placeholder={COPY.squareHint}
                onChange={e => setDraft({ ...draft, texts: draft.texts.map((x, j) => (j === i ? e.target.value : x)) })} />
              <div className="bg-about">
                {draft.about[i] && <Avatar name={draft.about[i] as Person} size={28} />}
                <select className="bg-select" aria-label={`Square ${i + 1} about`} value={draft.about[i]}
                  onChange={e => setDraft({ ...draft, about: draft.about.map((x, j) => (j === i ? (e.target.value as Person | '') : x)) })}>
                  <option value="">{COPY.general}</option>
                  {PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </li>
          ))}
        </ol>
        <div className="bg-nav">
          <button type="button" className="cta alt bg-cta" onClick={existing ? () => open(existing) : goList}>{COPY.cancel}</button>
          <button type="button" className="cta bg-cta" disabled={!complete} onClick={save}>{COPY.save}</button>
        </div>
      </div>
    );
  }

  if (view.kind === 'play') {
    const card = find(view.id);
    if (!card) { return <div className="body bg">{header(goList)}</div>; }
    const n = lines(card), full = isFullHouse(card);
    const inLine = new Set(LINES.filter(l => lineDone(card, l)).flat());
    const tick = (i: number) => persist(cards.map(c => (c.id === card.id ? { ...c, squares: c.squares.map((s, j) => (j === i ? { ...s, ticked: !s.ticked } : s)) } : c)));
    const remove = () => { persist(cards.filter(c => c.id !== card.id)); goList(); };
    return (
      <div className="body bg">
        {header(goList, <button type="button" className="bg-link" onClick={() => startEdit(card)}>{COPY.edit}</button>)}
        <div className="big display small">{card.title}</div>
        {lock}
        <div className="bg-grid" role="group" aria-label={card.title}>
          {card.squares.map((s, i) => (
            <button key={i} type="button" className={`bg-sq${s.ticked ? ' on' : ''}${inLine.has(i) ? ' line' : ''}`} aria-pressed={s.ticked}
              aria-label={`${s.text}, ${s.ticked ? 'ticked' : 'not ticked'}`} onClick={() => tick(i)}>
              {s.about && <Avatar name={s.about} size={26} />}
              <span className="bg-sq-text">{s.text}</span>
              {s.ticked && <span className="bg-sq-tick"><IconCheck size={14} /></span>}
            </button>
          ))}
        </div>
        <div className="bg-status" aria-live="polite">
          {full ? COPY.full : n === 1 ? COPY.line : n > 1 ? COPY.lines(n) : ''}
        </div>
        {confirmDel ? (
          <div className="bg-confirm" role="group" aria-label={COPY.delAsk}>
            <span>{COPY.delAsk}</span>
            <button type="button" className="bg-link" onClick={remove}>{COPY.delYes}</button>
            <button type="button" className="bg-link" onClick={() => setConfirmDel(false)}>{COPY.delNo}</button>
          </div>
        ) : (
          <button type="button" className="bg-link bg-del" onClick={() => setConfirmDel(true)}>{COPY.del}</button>
        )}
      </div>
    );
  }

  return (
    <div className="body bg">
      {header(onBack)}
      <div className="big display small">{COPY.title}</div>
      {lock}
      {cards.length === 0 && (
        <BigState compact headline={COPY.emptyHead} sub={COPY.empty}>
          <div className="bs-eg" aria-hidden="true">{COPY.example}</div>
        </BigState>
      )}
      <ul className="bg-cards">
        {cards.map(c => (
          <li key={c.id}>
            <button type="button" className="bg-card" onClick={() => open(c)}>
              <span className="bg-card-title">{c.title}</span>
              <span className="bg-card-n">{ticks(c)} of {SQUARES} ticked</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="cta bg-cta" onClick={() => startEdit()}><IconPlus size={16} /> {COPY.newCard}</button>
    </div>
  );
}
