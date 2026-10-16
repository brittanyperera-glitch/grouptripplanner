import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { budgetCap, groupSummary, maxNightsOf, nightsWarnings, warnings } from '../lib/stays';
import type { CrewStays, PlaceSuggestion, PrefAnswer } from '../types';
import Interview from './Interview';
import { COPY } from './interviewCopy';

// The quiz and the engine meet only through PrefAnswer.picks, so this drives the REAL quiz and feeds what it saves
// to the engine: a mismatch in key encoding (nights:, stretch:, a happy budget band) fails here.
const chip = (name: string | RegExp) => screen.getByRole('button', { name });
const nextBtn = () => screen.getByRole('button', { name: /^(Next|Skip, no answer|Done)$/ });

async function answerQuiz(): Promise<PrefAnswer[]> {
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(<Interview me="Alex" onSave={onSave} onDone={() => undefined} />);
  await user.click(chip('Hostel dorm, not set'));
  await user.click(chip('Hostel dorm, up to 2 nights'));
  await user.click(nextBtn());
  await user.click(nextBtn());
  await user.click(chip('Under 30, not picked'));
  await user.click(chip('Stretch +20, not picked'));
  for (let i = 0; i < 4; i++) await user.click(nextBtn());
  await user.click(chip(COPY.reveal.cta));
  return onSave.mock.calls[0][0];
}

const stay = (over: Partial<PlaceSuggestion>): PlaceSuggestion => ({
  id: 's', name: 'Alex', area: 'Ella', kind: 'stay', title: 'x', status: 'live', createdAt: '2026-10-16', ...over,
});

describe('what the quiz saves is what the engine reads', () => {
  it('a happy band plus a stretch becomes a price cap, and a nights limit becomes a map', async () => {
    const prefs = await answerQuiz();
    expect(budgetCap(prefs)).toBe(50);
    expect(maxNightsOf(prefs)).toEqual({ hostel: 2 });
    const crew: CrewStays[] = [{ name: 'Alex', prefs, quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '' }];
    expect(warnings(stay({ priceGbp: 60 }), crew).count).toBe(1);
    expect(warnings(stay({ priceGbp: 45 }), crew).count).toBe(0);
    expect(nightsWarnings(stay({ stayType: 'hostel' }), 3, { Alex: maxNightsOf(prefs) }).count).toBe(1);
    expect(nightsWarnings(stay({ stayType: 'hostel' }), 2, { Alex: maxNightsOf(prefs) }).count).toBe(0);
  });
  it('the special keys never show up as options in the group summary', async () => {
    const prefs = await answerQuiz();
    const crew: CrewStays[] = [{ name: 'Alex', prefs, quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '' }];
    expect(JSON.stringify(groupSummary(crew))).not.toMatch(/nights:|stretch:/);
  });
});
