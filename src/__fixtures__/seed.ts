import { blankCrew, emptyRanking, type BingoCard, type CrewStays, type Person, type Player, type Response } from '../types';
import { WALKTHROUGH_KEY, todayKey } from '../lib/walkthrough';

/** Today's walkthrough already seen, so the app opens on its tabs. Call after localStorage.clear(). */
export const seenWalkToday = () => localStorage.setItem(WALKTHROUGH_KEY, todayKey(new Date()));

/** The standard catalogue item the App tests share; `extra` overrides or adds fields. */
export const mkItem = (id: string, name: string, area: string, extra = {}) => ({
  id, name, area, about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, photo: id, when: 'morning', credit: `Credit ${id}`, ...extra,
});

export const submittedResp = (name: Person): Response =>
  ({ name, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: true, updatedAt: '2026-10-14T00:00:00Z' });

export const bingoCard = (): BingoCard => ({ id: 'b1', title: 't', squares: Array.from({ length: 9 }, () => ({ text: 's', ticked: false })), createdAt: '' });

/** A crew row whose quiz is done. Start from blankCrew so a new CrewStays field is added in one place. */
export const crewQuizDone = (name: Player, bingo: BingoCard[] = [bingoCard()], updatedAt = '2026-10-14T00:00:00Z'): CrewStays =>
  ({ ...blankCrew(name), quizDone: true, bingo, updatedAt });

/** Writes the row where LocalStore reads it. */
export const quizDone = (name: string, bingo: BingoCard[] = [bingoCard()]) =>
  localStorage.setItem(`tp:stays:${name}`, JSON.stringify(crewQuizDone(name as Player, bingo)));
export const quizDoneNoBingo = (name: string) => quizDone(name, []);
