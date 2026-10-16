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
