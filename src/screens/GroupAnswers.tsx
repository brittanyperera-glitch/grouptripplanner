import './GroupAnswers.css';
import { CARD_COPY } from './interviewCopy';
import { groupSummary, journeyFlags, journeyLimitOf } from '../lib/stays';
import { useApp } from '../state';
import { PEOPLE } from '../types';
import type { CrewStays, Leg, Player, Plan } from '../types';

/** Counts only appear, and journey notes show, once this many people have finished the quiz. */
export const MIN_FINISHED = 3;

/** The five people who have finished the quiz. Guests never count. */
export function finishedCrew(crew: Partial<Record<Player, CrewStays>> | undefined): CrewStays[] {
  return PEOPLE.flatMap(p => { const c = crew?.[p]; return c && c.quizDone ? [c] : []; });
}

const speaks = (a: { noPreference: boolean; skipped: boolean }) => !a.noPreference && !a.skipped;

/** How many people gave `stance` to `key` under `topic`; plain numbers, never who. */
export function countStance(crew: CrewStays[], topic: string, key: string, stance: 'happy' | 'noway'): number {
  return crew.filter(c => c.prefs.some(a => a.topic === topic && speaks(a) && a.picks[key] === stance)).length;
}

const label = (topic: 'stayType' | 'rooms' | 'budget' | 'nos', key: string) => CARD_COPY[topic].opts.find(o => o[0] === key)?.[1] ?? key;

export interface AnswerRow { text: string }
export interface AnswerSection { title: string; rows: string[] }

/** The opened row: per option, counts of happy and no way. Options nobody touched are left out. */
export function answerSections(crew: CrewStays[]): AnswerSection[] {
  const sum = groupSummary(crew);
  const both = (topic: 'stayType' | 'rooms') => CARD_COPY[topic].opts.flatMap(([k]) => {
    const h = sum.happy[`${topic}:${k}`]?.length ?? 0, n = sum.hardNos[`${topic}:${k}`]?.length ?? 0;
    return h + n === 0 ? [] : [`${label(topic, k)}: ${h} happy, ${n} no way`];
  });
  const budget = CARD_COPY.budget.opts.flatMap(([k]) => {
    const h = countStance(crew, 'budget', k, 'happy');
    return h === 0 ? [] : [`${label('budget', k)}: ${h}`];
  });
  const nos = CARD_COPY.nos.opts.flatMap(([k]) => {
    const n = countStance(crew, 'nos', k, 'noway');
    return n === 0 ? [] : [`${label('nos', k)}: ${n}`];
  });
  return [
    { title: 'Stay types', rows: both('stayType') },
    { title: 'Sharing a room', rows: both('rooms') },
    { title: 'Budget a night, in pounds', rows: budget },
    { title: 'Dealbreakers', rows: nos },
  ].filter(s => s.rows.length > 0);
}

export function GroupAnswersView({ crew }: { crew: CrewStays[] }) {
  if (crew.length < MIN_FINISHED) return null;
  const sections = answerSections(crew);
  return (
    <details className="ga-row">
      <summary className="ga-head"><b>Group answers</b><small>{crew.length} of {PEOPLE.length} done</small></summary>
      <div className="ga-body">
        <p className="ga-note">Only counts. Nobody sees who said what.</p>
        {sections.map(s => (
          <section key={s.title} className="ga-sec">
            <h3>{s.title}</h3>
            <ul>{s.rows.map(r => <li key={r}>{r}</li>)}</ul>
          </section>
        ))}
      </div>
    </details>
  );
}

export default function GroupAnswers() {
  const { state } = useApp();
  return <GroupAnswersView crew={finishedCrew(state.stays?.crew)} />;
}

// Drive caps in hours; mirrors the quiz answers journeyFlags understands.
const CAP_H: Record<string, number> = { under2h: 2, '2to3h': 3, '3to4h': 4 };


/**
 * Day number to a counts-only note, for drive legs over someone's limit. Shows the highest cap the leg breaks,
 * with the people who named exactly that cap. Empty until enough people have finished the quiz.
 */
export function journeyNotes(plan: Plan, legs: Leg[], crew: CrewStays[]): Map<number, string> {
  const out = new Map<number, string>();
  if (crew.length < MIN_FINISHED) return out;
  const limits: Partial<Record<Player, string>> = {};
  for (const c of crew) { const l = journeyLimitOf(c.prefs); if (l) limits[c.name] = l; }
  const flags = journeyFlags(plan, legs, limits);
  for (const d of plan.days) {
    for (const e of d.entries) {
      if (e.kind !== 'drive' || !e.from || !e.to) continue;
      const f = flags.find(x => (x.from === e.from && x.to === e.to) || (x.from === e.to && x.to === e.from));
      if (!f) continue;
      const caps = Object.values(limits).map(a => CAP_H[a ?? '']).filter((h): h is number => h !== undefined && f.hours > h);
      // Everyone over their OWN limit counts; naming one threshold would undercount people with a stricter limit.
      const n = caps.length;
      out.set(d.n, `${n} ${n === 1 ? 'person prefers' : 'people prefer'} a shorter drive`);
    }
  }
  return out;
}

/** Group trip rows only: notes from the live quiz answers, or none when there is no app around. */
export function useJourneyNotes(plan: Plan, legs: Leg[], on: boolean): Map<number, string> {
  let crew: CrewStays[] = [];
  try { crew = finishedCrew(useApp().state.stays?.crew); } catch { /* no provider: no notes */ }
  return on ? journeyNotes(plan, legs, crew) : new Map();
}
