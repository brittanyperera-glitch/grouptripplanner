import { useState } from 'react';
import { useApp } from '../state';
import { PEOPLE, type BingoCard, type BingoSquare, type Person } from '../types';
import Avatar from '../components/Avatar';
import BigState from '../components/BigState';
import BaseSheet from '../components/Sheet';
import { IconLeft, IconPlus } from '../components/Icons';
import './Stays.css';
import './Bingo.css';

export const SQUARES = 9;
export const MAX_TEXT = 60;
const LINES: number[][] = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

const filled = (s?: BingoSquare) => !!s && s.text.trim() !== '';
const lineDone = (card: BingoCard, l: number[]) => l.every(i => filled(card.squares[i]) && card.squares[i].ticked);
/** How many rows, columns and diagonals are fully ticked (0 to 8). */
export const lines = (card: BingoCard): number => LINES.filter(l => lineDone(card, l)).length;
export const isFullHouse = (card: BingoCard): boolean => card.squares.length === SQUARES && card.squares.every(s => filled(s) && s.ticked);
const ticks = (card: BingoCard) => card.squares.filter(s => filled(s) && s.ticked).length;
const written = (card: BingoCard) => card.squares.filter(filled).length;
const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const blankSquares = (): BingoSquare[] => Array.from({ length: SQUARES }, () => ({ text: '', ticked: false }));

const COPY = {
  title: 'Travel Bingo',
  lock: 'Your cards are only shown to you in the app.',
  empty: 'Predict what will happen on the trip, then tick it off when it does.',
  emptyHead: 'Make your first card.',
  example: 'Monkey steals food',
  newCard: 'New card',
  back: 'Back',
  add: 'Add',
  titleLabel: 'Card title',
  squareLabel: 'What will happen?',
  squareHint: 'e.g. Monkey steals food',
  sheetNew: 'Write a square',
  sheetEdit: 'Edit square',
  sheetTitle: 'Rename card',
  about: 'About',
  general: 'General',
  save: 'Save',
  cancel: 'Cancel',
  rename: 'Rename card',
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
const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z" /><path d="M14 7l3 3" />
  </svg>
);

interface SheetProps { title: string; canSave: boolean; onSave(): void; onClose(): void; children: React.ReactNode }

/** One small form in the shared bottom sheet, with Save. */
function Sheet({ title, canSave, onSave, onClose, children }: SheetProps) {
  return (
    <BaseSheet title={title} closeLabel={COPY.cancel} onClose={onClose} onSubmit={() => { if (canSave) onSave(); }}
      footer={<button type="button" className="cta" disabled={!canSave} onClick={onSave}>{COPY.save}</button>}>
      {children}
      <button type="submit" hidden />
    </BaseSheet>
  );
}

function SquareSheet({ square, onSave, onClose }: { square: BingoSquare; onSave(text: string, about?: Person): void; onClose(): void }) {
  const [text, setText] = useState(square.text);
  const [about, setAbout] = useState<Person | ''>(square.about ?? '');
  // A written square can be cleared back to blank; a blank one cannot be saved empty.
  const ok = text.trim() !== '' || square.text !== '';
  return (
    <Sheet title={square.text ? COPY.sheetEdit : COPY.sheetNew} canSave={ok} onClose={onClose} onSave={() => onSave(text.trim(), about || undefined)}>
      <label className="st-field">
        <span className="st-label">{COPY.squareLabel}</span>
        <input className="field" autoFocus value={text} maxLength={MAX_TEXT} placeholder={COPY.squareHint} onChange={e => setText(e.target.value)} />
      </label>
      <div className="st-field" role="group" aria-label={COPY.about}>
        <span className="st-label">{COPY.about}</span>
        <div className="st-chips">
          <button type="button" className="st-pill" aria-pressed={about === ''} onClick={() => setAbout('')}>{COPY.general}</button>
          {PEOPLE.map(p => (
            <button key={p} type="button" className="st-pill bg-pill" aria-pressed={about === p} onClick={() => setAbout(p)}>
              <Avatar name={p} size={24} />{p}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function TitleSheet({ title, onSave, onClose }: { title: string; onSave(t: string): void; onClose(): void }) {
  const [t, setT] = useState(title);
  return (
    <Sheet title={COPY.sheetTitle} canSave={t.trim() !== ''} onClose={onClose} onSave={() => onSave(t.trim())}>
      <label className="st-field">
        <span className="st-label">{COPY.titleLabel}</span>
        <input className="field" autoFocus value={t} maxLength={MAX_TEXT} onChange={e => setT(e.target.value)} />
      </label>
    </Sheet>
  );
}

type View = { kind: 'list' } | { kind: 'card'; id: string };
type SheetState = { kind: 'square'; i: number } | { kind: 'title' } | null;

export default function Bingo({ onBack }: { onBack(): void }) {
  const { me, state, store } = useApp();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [sheet, setSheet] = useState<SheetState>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  if (!me) return null;
  // Only my own row is ever read: there is no path to anyone else's cards.
  const cards: BingoCard[] = state.stays?.crew[me]?.bingo ?? [];
  const persist = (next: BingoCard[]) => { void store.saveCrewStays(me, { bingo: next }); };
  const find = (id: string) => cards.find(c => c.id === id);
  const patch = (id: string, f: (c: BingoCard) => BingoCard) => persist(cards.map(c => (c.id === id ? f(c) : c)));

  const goList = () => { setConfirmDel(false); setSheet(null); setView({ kind: 'list' }); };
  const open = (c: BingoCard) => { setConfirmDel(false); setView({ kind: 'card', id: c.id }); };
  const create = () => {
    let n = cards.length + 1;
    while (cards.some(c => c.title === `Card ${n}`)) n++;
    const card: BingoCard = { id: newId(), title: `Card ${n}`, squares: blankSquares(), createdAt: new Date().toISOString() };
    persist([...cards, card]);
    open(card);
  };

  const header = (onLeft: () => void) => (
    <div className="bg-top">
      <button type="button" className="bg-back" aria-label={COPY.back} onClick={onLeft}><IconLeft size={20} /></button>
    </div>
  );
  const lock = <div className="sub bg-lock"><LockIcon />{COPY.lock}</div>;

  if (view.kind === 'card') {
    const card = find(view.id);
    if (!card) return <div className="body bg">{header(goList)}</div>;
    const n = lines(card), full = isFullHouse(card);
    const inLine = new Set(LINES.filter(l => lineDone(card, l)).flat());
    const tick = (i: number) => {
      if (!filled(card.squares[i])) return;
      patch(card.id, c => ({ ...c, squares: c.squares.map((s, j) => (j === i ? { ...s, ticked: !s.ticked } : s)) }));
    };
    const saveSquare = (i: number, text: string, about?: Person) => {
      patch(card.id, c => ({
        ...c,
        squares: c.squares.map((s, j) => {
          if (j !== i) return s;
          const sq: BingoSquare = { text, ticked: s.text === text ? s.ticked : false };
          if (about && text) sq.about = about;
          return sq;
        }),
      }));
      setSheet(null);
    };
    const remove = () => { persist(cards.filter(c => c.id !== card.id)); goList(); };
    const sq = sheet?.kind === 'square' ? card.squares[sheet.i] : undefined;
    return (
      <div className="body bg">
        {header(goList)}
        <div className="bg-banner">
          <h1 className="bg-banner-title display">{card.title}</h1>
          <span className="bg-ball" aria-label={`${ticks(card)} of ${SQUARES} ticked`}>{ticks(card)}/{SQUARES}</span>
        </div>
        <div className="bg-board">
          <div className="bg-grid" role="group" aria-label={card.title}>
            {card.squares.map((s, i) => filled(s) ? (
              <div key={i} className={`bg-cell${s.ticked ? ' on' : ''}${inLine.has(i) ? ' line' : ''}`}>
                <button type="button" className="bg-sq" aria-pressed={s.ticked}
                  aria-label={`${s.text}, ${s.ticked ? 'ticked' : 'not ticked'}`} onClick={() => tick(i)}>
                  {s.about && <Avatar name={s.about} size={24} />}
                  <span className="bg-sq-text">{s.text}</span>
                  {s.ticked && <span className="bg-daub" aria-hidden="true" />}
                </button>
                <button type="button" className="bg-pen" aria-label={`Edit square ${i + 1}`} onClick={() => setSheet({ kind: 'square', i })}><PencilIcon /></button>
              </div>
            ) : (
              <div key={i} className="bg-cell bg-blank">
                <button type="button" className="bg-add" aria-label={`Add square ${i + 1}`} onClick={() => setSheet({ kind: 'square', i })}>
                  <IconPlus size={22} /><span>{COPY.add}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className={`bg-status${full ? ' full' : ''}`} aria-live="polite">
          {full ? COPY.full : n === 1 ? COPY.line : n > 1 ? COPY.lines(n) : ''}
        </div>
        {lock}
        <div className="bg-links">
          <button type="button" className="bg-link" onClick={() => setSheet({ kind: 'title' })}>{COPY.rename}</button>
          {confirmDel ? (
            <span className="bg-confirm" role="group" aria-label={COPY.delAsk}>
              <span>{COPY.delAsk}</span>
              <button type="button" className="bg-link" onClick={remove}>{COPY.delYes}</button>
              <button type="button" className="bg-link" onClick={() => setConfirmDel(false)}>{COPY.delNo}</button>
            </span>
          ) : (
            <button type="button" className="bg-link" onClick={() => setConfirmDel(true)}>{COPY.del}</button>
          )}
        </div>
        {sheet?.kind === 'square' && sq && <SquareSheet square={sq} onClose={() => setSheet(null)} onSave={(t, a) => saveSquare(sheet.i, t, a)} />}
        {sheet?.kind === 'title' && <TitleSheet title={card.title} onClose={() => setSheet(null)} onSave={t => { patch(card.id, c => ({ ...c, title: t })); setSheet(null); }} />}
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
              <span className="bg-mini" aria-hidden="true">
                {Array.from({ length: SQUARES }, (_, i) => {
                  const s = c.squares[i];
                  return <i key={i} className={filled(s) ? (s.ticked ? 'tick' : 'fill') : ''} />;
                })}
              </span>
              <span className="bg-card-main">
                <span className="bg-card-title">{c.title}</span>
                <span className="bg-card-n">{written(c)} of {SQUARES} written, {ticks(c)} ticked</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="cta bg-cta" onClick={create}><IconPlus size={16} /> {COPY.newCard}</button>
    </div>
  );
}
