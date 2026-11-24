import { addDays } from '../lib/calendar';
import { todayKey } from '../lib/walkthroughKey';
import { emptyRanking, type AppState, type Pace, type Person, type Response } from '../types';

// Fictional example picks for the guest demo crew; they are not the real group's answers.
const row = (name: Person, days: number, pace: Pace, must: string[], keen: string[], meh: string[]): Response => {
  const ranking = emptyRanking();
  ranking.must = must.map(id => [id]); ranking.keen = keen.map(id => [id]); ranking.meh = meh.map(id => [id]);
  return { name, days, flex: false, pace, ranking, rated: [...must, ...keen, ...meh], submitted: true, updatedAt: '2026-01-01T00:00:00.000Z' };
};

export function seedState(): AppState {
  const rows = [
    row('Brittany', 14, 1, ['sigiriya', 'galle', 'tea'], ['polonnaruwa', 'ellarock', 'tooth'], ['kottu']),
    row('Alex', 14, 1, ['yala', 'udawalawe', 'train'], ['sigiriya', 'surf'], ['pettah']),
    row('Antek', 9, 0, ['rafting', 'knuckles', 'diyaluma'], ['anuradhapura', 'hiriketiya'], ['galleface']),
    row('Lazza', 14, 2, ['train', 'ninearch', 'horton'], ['dambulla', 'beachday'], ['rooftop']),
    row('Saulie', 9, 1, ['surf', 'hiriketiya', 'junglebeach'], ['crab', 'galle'], ['coconut']),
  ];
  return { responses: Object.fromEntries(rows.map(r => [r.name, r])), suggestions: [], votes: [] };
}

/** What the guest demo's store starts with: the example crew, plus what the four tabs need to look alive. Kept apart from seedState so a bare MemoryStore stays empty of trip settings. */
export function guestSeed(): AppState {
  const at = '2026-01-01T00:00:00.000Z';
  return {
    ...seedState(),
    // Three weeks out, so the train (it opens 30 days ahead) is open to book now and the trip has a day count.
    tripSettings: { startDate: addDays(todayKey(new Date()), 21), lastDayStart: null, plan: null, bookingDates: {}, overrides: [], updatedAt: at },
    // Sigiriya is claimed by an example crew member; the train is left open.
    bookingClaims: { 'book:sigiriya': { itemId: 'book:sigiriya', owner: 'Alex', updatedAt: at } },
  };
}
