import { useState } from 'react';
import type { Person, PrefAnswer, PrefStance, PrefTopic } from '../types';
import Avatar from '../components/Avatar';
import { IconCheck, IconCross, IconLeft } from '../components/Icons';
import { CARD_COPY, COPY, QUIPS, STRETCH, STRETCH_ASK, type CardCopy, type Opt } from './interviewCopy';
import './Interview.css';

type Topic = keyof typeof CARD_COPY;
interface Card extends CardCopy { topic: Topic; single?: boolean; noOnly?: boolean }

// Single-choice cards hold one pick (budget also holds one `stretch:` pick, tracked as its own group).
// noOnly cards (dealbreakers) skip the happy state, which makes no sense under "never do".
export const CARDS: Card[] = [
  { topic: 'stayType', ...CARD_COPY.stayType },
  { topic: 'rooms', ...CARD_COPY.rooms },
  { topic: 'budget', ...CARD_COPY.budget, single: true },
  { topic: 'transport', ...CARD_COPY.transport },
  { topic: 'journey', ...CARD_COPY.journey, single: true },
  { topic: 'nos', ...CARD_COPY.nos, noOnly: true },
];

/*
 * Extra keys stored inside PrefAnswer.picks (src/types.ts is not ours to change):
 *   stretch:<same|plus20|plus50|anything>  budget card, second question, stance 'happy'.
 *   nights:<stayTypeKey>:<1|2|3>           stayType card, stance 'happy'; present only when a limit other than
 *                                          "any" is chosen, so absent means any. Setting a new limit removes the old
 *                                          key; leaving 'happy' on the type removes it too.
 * Readers that iterate picks as stay types must skip keys containing ':'.
 */
const STRETCH_PREFIX = 'stretch:';
const NIGHTS_PREFIX = 'nights:';
const NIGHT_CHOICES = [1, 2, 3] as const;
const nightsKey = (type: string, n: number) => `${NIGHTS_PREFIX}${type}:${n}`;
const nightsOf = (picks: Record<string, PrefStance>, type: string): number | undefined => {
  const k = Object.keys(picks).find((x) => x.startsWith(`${NIGHTS_PREFIX}${type}:`));
  return k ? Number(k.split(':')[2]) : undefined;
};
const withoutNights = (picks: Record<string, PrefStance>, type: string) =>
  Object.fromEntries(Object.entries(picks).filter(([k]) => !k.startsWith(`${NIGHTS_PREFIX}${type}:`)));

const blank = (topic: PrefTopic): PrefAnswer => ({ topic, picks: {}, noPreference: false, skipped: false });
const blanks = () => CARDS.map((c) => blank(c.topic));
const empty = (a: PrefAnswer) => !a.noPreference && Object.keys(a.picks).length === 0;

// Tap cycle: off, happy, noway, off. Pick-only cards (noOnly) skip happy.
function next(cur: PrefStance | undefined, noOnly?: boolean): PrefStance | undefined {
  if (cur === 'noway') return undefined;
  return cur === 'happy' || noOnly ? 'noway' : 'happy';
}

/*
 * Travel personality. Pure and deterministic: the first rule that matches wins, in this order.
 *   1 Easygoing One   no preference on at least half the cards, or nothing picked anywhere
 *   2 Local Legend    tuk-tuk AND guesthouse both happy (most specific, so it beats the spend rules)
 *   3 Big Spender     budget 100plus, or stretch anything
 *   4 Budget Backpacker  budget under30, or hostel happy
 *   5 Comfort Seeker  hotel, villa or boutique happy, or dorm a no way (rooms or dealbreakers)
 *   fallback          Easygoing One
 */
export function personality(answers: PrefAnswer[]): { title: string; happy: string[]; noway: string[] } {
  const by = (t: PrefTopic) => answers.find((a) => a.topic === t)?.picks ?? {};
  const stay = by('stayType'), budget = by('budget'), rooms = by('rooms'), transport = by('transport'), nos = by('nos');
  const noPrefCount = answers.filter((a) => a.noPreference).length;
  const nothing = answers.every((a) => Object.keys(a.picks).length === 0);
  const T = COPY.titles;
  let title = T.easy;
  if (noPrefCount * 2 >= CARDS.length || nothing) title = T.easy;
  else if (transport.tuktuk === 'happy' && stay.guesthouse === 'happy') title = T.local;
  else if (budget['100plus'] || budget[`${STRETCH_PREFIX}anything`]) title = T.spender;
  else if (budget.under30 || stay.hostel === 'happy') title = T.backpacker;
  else if (stay.hotel === 'happy' || stay.villa === 'happy' || stay.boutique === 'happy' || rooms.dorm === 'noway' || nos.dorm === 'noway') title = T.comfort;

  const happy: string[] = [];
  const noway: string[] = [];
  for (const c of CARDS) {
    const picks = by(c.topic);
    for (const [key, label] of [...c.opts, ...(c.topic === 'budget' ? STRETCH.map(([k, l]): Opt => [`${STRETCH_PREFIX}${k}`, `Stretch ${l}`]) : [])]) {
      const s = picks[key];
      const text = c.topic === 'budget' && !key.startsWith(STRETCH_PREFIX) ? `${label} a night` : label;
      if (s === 'happy') happy.push(text);
      if (s === 'noway') noway.push(text);
    }
  }
  return { title, happy, noway };
}

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export default function Interview({ initial, onSave, onDone }: { me: Person | string; initial?: PrefAnswer[]; onSave: (a: PrefAnswer[]) => void; onDone: () => void }) {
  const [answers, setAnswers] = useState<PrefAnswer[]>(() => CARDS.map((c) => initial?.find((a) => a.topic === c.topic) ?? blank(c.topic)));
  const [idx, setIdx] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [quip, setQuip] = useState<string | null>(null);
  const card = CARDS[idx];
  const ans = answers[idx];
  const set = (a: PrefAnswer) => setAnswers((all) => all.map((x, i) => (i === idx ? a : x)));
  const goTo = (i: number) => { setIdx(i); setQuip(null); setConfirming(false); };

  const tap = (key: string) => {
    const cur = ans.picks[key];
    const isStretch = key.startsWith(STRETCH_PREFIX);
    let picks = { ...ans.picks };
    if (card.single) {
      // One pick per group: bands and stretch are separate groups on the budget card.
      for (const k of Object.keys(picks)) if (k.startsWith(STRETCH_PREFIX) === isStretch) delete picks[k];
    } else delete picks[key];
    const nx = card.single ? (cur ? undefined : 'happy') : next(cur, card.noOnly);
    if (nx) picks[key] = nx;
    if (card.topic === 'stayType' && nx !== 'happy') picks = withoutNights(picks, key);
    set({ ...ans, picks, noPreference: false, skipped: false });
    setQuip(nx ? (QUIPS[`${card.topic}:${key}`] ?? card.picked) : null);
  };
  const setNights = (type: string, n: number | undefined) => {
    const picks = withoutNights(ans.picks, type);
    if (n !== undefined) picks[nightsKey(type, n)] = 'happy';
    set({ ...ans, picks });
  };
  const noPref = () => { set({ ...ans, picks: {}, noPreference: !ans.noPreference, skipped: false }); setQuip(null); };

  const last = idx === CARDS.length - 1;
  const advance = () => {
    const done = empty(ans) ? answers.map((a, i) => (i === idx ? { ...a, skipped: true } : a)) : answers;
    setAnswers(done);
    if (!last) { goTo(idx + 1); return; }
    setConfirming(false);
    // Saved the moment the last card is done, so leaving the reveal any other way loses nothing.
    onSave(done);
    setReveal(true);
  };
  const back = () => {
    if (reveal) { setReveal(false); return; }
    goTo(idx - 1);
  };
  const startAgain = () => { setAnswers(blanks()); setReveal(false); goTo(0); };
  const finish = onDone;

  const stateWord = (s?: PrefStance) => (card.single ? (s ? 'picked' : 'not picked') : s === 'happy' ? 'happy' : s === 'noway' ? 'no way' : 'not set');
  const noLabel = card.noOnly ? COPY.none : COPY.noPref;

  const chip = (key: string, label: string, aria: string, hint?: string) => {
    const s = ans.picks[key];
    return (
      <button type="button" className={`iv-chip${s === 'noway' ? ' no' : ''}`} aria-pressed={!!s} aria-label={`${aria}, ${stateWord(s)}`} onClick={() => tap(key)}>
        {s === 'happy' && <IconCheck size={16} />}{s === 'noway' && <IconCross size={16} />}
        <span className="iv-chip-text">{label}{hint && <span className="iv-hint">{hint}</span>}</span>
      </button>
    );
  };

  const top = (
    <div className="iv-top">
      {(idx > 0 || reveal) ? (
        <button type="button" className="iv-back" aria-label={COPY.back} onClick={back}><IconLeft size={20} /></button>
      ) : <span />}
      {confirming ? (
        <div className="iv-confirm" role="group" aria-label={COPY.confirmAsk}>
          <span>{COPY.confirmAsk}</span>
          <button type="button" className="iv-link" onClick={startAgain}>{COPY.confirmYes}</button>
          <button type="button" className="iv-link" onClick={() => setConfirming(false)}>{COPY.confirmNo}</button>
        </div>
      ) : (
        <button type="button" className="iv-link" onClick={() => setConfirming(true)}>{COPY.startAgain}</button>
      )}
    </div>
  );

  if (reveal) {
    const p = personality(answers);
    const list = (items: string[]) => (items.length ? <ul className="iv-list">{items.map((t) => <li key={t}>{t}</li>)}</ul> : <div className="sub">{COPY.reveal.nothing}</div>);
    return (
      <div className="body iv">
        {top}
        <div className="kicker">{COPY.reveal.kicker}</div>
        <div className="big display small">{p.title}</div>
        <div className="sub iv-lock"><LockIcon />{COPY.reveal.private}</div>
        <div className="iv-sum"><div className="iv-sum-h">{COPY.reveal.happy}</div>{list(p.happy)}</div>
        <div className="iv-sum"><div className="iv-sum-h">{COPY.reveal.noway}</div>{list(p.noway)}</div>
        <div className="iv-nav"><button type="button" className="cta iv-cta" onClick={finish}>{COPY.reveal.cta}</button></div>
      </div>
    );
  }

  const stack = card.topic === 'stayType';
  return (
    <div className="body iv">
      {top}
      <div className="kicker">{idx + 1} of {CARDS.length}</div>
      {idx === 0 && <div className="iv-banner">{COPY.banner}</div>}
      <div className="iv-host" data-host={card.host}>
        <Avatar name={card.host} size={64} />
        <div className="iv-host-say">
          <div className="iv-host-name">{card.host}</div>
          <div className="iv-quip" aria-live="polite">{quip ?? card.idle}</div>
        </div>
      </div>
      <div className="big display small">{card.ask}</div>
      {card.hint && <div className="sub">{card.hint}</div>}
      <div className={`iv-chips${stack ? ' stack' : ''}`} role="group" aria-label={card.ask}>
        <button type="button" className="iv-chip" aria-pressed={ans.noPreference} onClick={noPref}>
          {ans.noPreference && <IconCheck size={16} />}{noLabel}
        </button>
        {card.opts.map(([key, label, hint]) => (
          <div key={key} className="iv-opt">
            {chip(key, label, label, hint)}
            {stack && ans.picks[key] === 'happy' && (
              <div className="iv-nights" role="group" aria-label={`Nights at ${label}`}>
                <span>{COPY.nightsUpTo}</span>
                {NIGHT_CHOICES.map((n) => (
                  <button key={n} type="button" className="iv-night" aria-pressed={nightsOf(ans.picks, key) === n}
                    aria-label={`${label}, up to ${n} ${n === 1 ? 'night' : 'nights'}`} onClick={() => setNights(key, n)}>{n}</button>
                ))}
                <button type="button" className="iv-night" aria-pressed={nightsOf(ans.picks, key) === undefined}
                  aria-label={`${label}, any nights`} onClick={() => setNights(key, undefined)}>{COPY.nightsAny}</button>
                <span>{COPY.nightsUnit}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {card.topic === 'budget' && (
        <>
          <div className="big display small">{STRETCH_ASK}</div>
          <div className="iv-chips" role="group" aria-label={STRETCH_ASK}>
            {STRETCH.map(([k, label]) => <div key={k} className="iv-opt">{chip(`${STRETCH_PREFIX}${k}`, label, `Stretch ${label}`)}</div>)}
          </div>
        </>
      )}
      {idx === 0 && <div className="sub">{COPY.legend}</div>}
      <div className="sub iv-lock"><LockIcon />{COPY.anonymous}</div>
      <div className="iv-nav">
        <button type="button" className="cta iv-cta" onClick={advance}>{empty(ans) ? COPY.skip : last ? COPY.done : COPY.next}</button>
      </div>
    </div>
  );
}
