import { useState } from 'react';
import type { Person, PrefAnswer, PrefStance, PrefTopic } from '../types';
import { IconCheck, IconCross } from '../components/Icons';
import './Interview.css';

type Opt = [key: string, label: string];
interface Card { topic: PrefTopic; ask: string; hint?: string; single?: boolean; noOnly?: boolean; opts: Opt[] }

const STAY: Opt[] = [['hostel', 'Hostel'], ['guesthouse', 'Guesthouse'], ['boutique', 'Boutique'], ['hotel', 'Hotel'], ['villa', 'Villa']];
const ROOMS: Opt[] = [['dorm', 'Dorm'], ['shared', 'Shared room'], ['private', 'Own room']];
const GETAROUND: Opt[] = [['train', 'Train'], ['driver', 'Driver'], ['tuktuk', 'Tuk-tuk'], ['bus', 'Bus'], ['taxi', 'Taxi'], ['selfdrive', 'Self-drive']];

export const CARDS: Card[] = [
  { topic: 'stayType', ask: 'What kind of place suits you?', opts: STAY },
  { topic: 'rooms', ask: 'How do you feel about sharing a room?', opts: ROOMS },
  { topic: 'budget', ask: 'Budget per night?', hint: 'Pounds per person per night.', single: true,
    opts: [['under30', 'Under £30'], ['30to60', '£30 to £60'], ['60to100', '£60 to £100'], ['100plus', '£100 plus']] },
  { topic: 'transport', ask: 'How do you like to get around?', opts: GETAROUND },
  { topic: 'journey', ask: 'Longest single journey you would be fine with?', single: true,
    opts: [['under2h', 'Under 2 hours'], ['2to3h', '2 to 3 hours'], ['3to4h', '3 to 4 hours'], ['bigday', 'A big day']] },
  { topic: 'nos', ask: "Anything you absolutely won't do?", noOnly: true, opts: [...STAY, ...ROOMS, ...GETAROUND, ['overnight', 'Overnight journeys']] },
];

const blank = (topic: PrefTopic): PrefAnswer => ({ topic, picks: {}, noPreference: false, skipped: false });
const empty = (a: PrefAnswer) => !a.noPreference && Object.keys(a.picks).length === 0;

// Tap cycle: off, happy, noway, off. Pick-only cards (noOnly) skip happy, which makes no sense under "won't do".
function next(cur: PrefStance | undefined, noOnly?: boolean): PrefStance | undefined {
  if (cur === 'noway') return undefined;
  return cur === 'happy' || noOnly ? 'noway' : 'happy';
}

export default function Interview({ initial, onSave, onDone }: { me: Person | string; initial?: PrefAnswer[]; onSave: (a: PrefAnswer[]) => void; onDone: () => void }) {
  const [answers, setAnswers] = useState<PrefAnswer[]>(() => CARDS.map((c) => initial?.find((a) => a.topic === c.topic) ?? blank(c.topic)));
  const [idx, setIdx] = useState(0);
  const card = CARDS[idx];
  const ans = answers[idx];
  const set = (a: PrefAnswer) => setAnswers((all) => all.map((x, i) => (i === idx ? a : x)));

  const tap = (key: string) => {
    const cur = ans.picks[key];
    const picks = card.single ? {} : { ...ans.picks };
    delete picks[key];
    const nx = card.single ? (cur ? undefined : 'happy') : next(cur, card.noOnly);
    if (nx) picks[key] = nx;
    set({ ...ans, picks, noPreference: false, skipped: false });
  };
  const noPref = () => set({ ...ans, picks: {}, noPreference: !ans.noPreference, skipped: false });

  const last = idx === CARDS.length - 1;
  const advance = () => {
    const done = empty(ans) ? answers.map((a, i) => (i === idx ? { ...a, skipped: true } : a)) : answers;
    setAnswers(done);
    if (!last) { setIdx(idx + 1); return; }
    onSave(done);
    onDone();
  };

  const stateWord = (s?: PrefStance) => (card.single ? (s ? 'picked' : 'not picked') : s === 'happy' ? 'happy' : s === 'noway' ? 'no way' : 'not set');
  const noLabel = card.noOnly ? 'None' : 'No preference';

  return (
    <div className="body iv">
      <div className="kicker">{idx + 1} of {CARDS.length}</div>
      <div className="big display small">{card.ask}</div>
      {card.hint && <div className="sub">{card.hint}</div>}
      <div className="iv-chips" role="group" aria-label={card.ask}>
        <button type="button" className="iv-chip" aria-pressed={ans.noPreference} onClick={noPref}>
          {ans.noPreference && <IconCheck size={16} />}{noLabel}
        </button>
        {card.opts.map(([key, label]) => {
          const s = ans.picks[key];
          return (
            <button key={key} type="button" className={`iv-chip${s === 'noway' ? ' no' : ''}`} aria-pressed={!!s}
              aria-label={`${label}, ${stateWord(s)}`} onClick={() => tap(key)}>
              {s === 'happy' && <IconCheck size={16} />}{s === 'noway' && <IconCross size={16} />}{label}
            </button>
          );
        })}
      </div>
      {idx === 0 && <div className="sub">Tap once if you're happy, twice for no way.</div>}
      <div className="iv-nav">
        {idx > 0 && <button type="button" className="cta alt" onClick={() => setIdx(idx - 1)}>Back</button>}
        <button type="button" className="cta" onClick={advance}>{empty(ans) ? 'Skip, no answer' : last ? 'Done' : 'Next'}</button>
      </div>
    </div>
  );
}
