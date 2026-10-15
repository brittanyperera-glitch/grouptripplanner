import { tierOf } from '../lib/ranking';
import { emptyRanking } from '../types';
import type { ChoiceEntry, ChoiceInput, Item, Person, Ranking, Response } from '../types';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The user choices a save carries, found by comparing it with what was stored before it. */
export function diffResponse(name: Person, prev: Response | undefined, patch: Partial<Omit<Response, 'name'>>): ChoiceInput[] {
  const out: ChoiceInput[] = [];
  const before = prev?.rated ?? [];
  const ranking = patch.ranking ?? prev?.ranking ?? emptyRanking();
  const fresh = (patch.rated ?? before).filter(id => !before.includes(id));
  for (const id of fresh) {
    const tier = tierOf(ranking, id);
    const pos = tier ? ranking[tier].findIndex(l => l.includes(id)) : -1;
    out.push({ name, kind: 'tier', ref: id, value: { tier, pos } });
  }
  if (patch.ranking && fresh.length === 0 && !same(patch.ranking, prev?.ranking ?? emptyRanking())) {
    out.push({ name, kind: 'rerank', ref: null, value: { ranking: patch.ranking } });
  }
  if (patch.final && !same(patch.final, prev?.final ?? null)) {
    out.push({ name, kind: 'rerank', ref: 'final', value: { ranking: patch.final } });
  }
  if (patch.days !== undefined && patch.days !== null && (patch.days !== (prev?.days ?? null) || (patch.flex ?? false) !== (prev?.flex ?? false))) {
    out.push({ name, kind: 'days', ref: null, value: { days: patch.days, flex: patch.flex ?? false } });
  }
  if (patch.pace !== undefined && patch.pace !== null && patch.pace !== (prev?.pace ?? null)) {
    out.push({ name, kind: 'pace', ref: null, value: { pace: patch.pace } });
  }
  return out;
}

const TIER_LABEL = { must: 'Must', keen: 'Keen', meh: 'Meh', skip: 'Skip' } as const;
const PACE_LABEL = ['Pack it in', 'Balanced', 'Slow'];

function rankingText(r: Ranking, nameOf: (id: string) => string): string {
  return (Object.keys(TIER_LABEL) as (keyof Ranking)[])
    .filter(t => r[t]?.length)
    .map(t => `${TIER_LABEL[t]}: ${r[t].map(l => l.map(nameOf).join(' = ')).join(' > ')}`)
    .join(' | ');
}

export function itemNamer(items: Item[]): (id: string) => string {
  const m = new Map(items.map(i => [i.id, i.name]));
  return id => m.get(id) ?? id;
}

export interface ChoiceRow { time: string; what: string; place: string; choice: string }

export function describeChoice(e: ChoiceEntry, nameOf: (id: string) => string): ChoiceRow {
  const v = (e.value ?? {}) as Record<string, unknown>;
  const time = e.at;
  if (e.kind === 'tier') return { time, what: 'Swipe', place: nameOf(e.ref ?? ''), choice: v.tier ? TIER_LABEL[v.tier as keyof typeof TIER_LABEL] : '' };
  if (e.kind === 'rerank') return { time, what: 'Re-rank', place: e.ref === 'final' ? 'Final list' : 'Whole list', choice: v.ranking ? rankingText(v.ranking as Ranking, nameOf) : '' };
  if (e.kind === 'days') return { time, what: 'Days', place: '', choice: v.flex ? 'Flexible' : `${v.days} days` };
  if (e.kind === 'pace') return { time, what: 'Pace', place: '', choice: PACE_LABEL[v.pace as number] ?? String(v.pace) };
  if (e.kind === 'suggest') return { time, what: 'Suggestion', place: String(e.ref ?? ''), choice: [v.title, v.note].filter(Boolean).join(': ') };
  const ref = e.ref ?? '';
  if (ref.startsWith('region:')) return { time, what: 'Head to head', place: 'North or South?', choice: v.choice === 'a' ? 'North' : 'South' };
  return { time, what: 'Head to head', place: `Add ${nameOf(ref.replace(/^ko:/, ''))}?`, choice: v.choice === 'a' ? 'Add' : 'Keep' };
}

const cell = (s: string) => {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** One header row and one row per log entry, oldest first, all friends together. */
export function choicesToCsv(entries: ChoiceEntry[], nameOf: (id: string) => string): string {
  const rows = [...entries].sort((a, b) => a.at.localeCompare(b.at)).map(e => {
    const d = describeChoice(e, nameOf);
    return [e.name, d.time, d.what, d.place, d.choice].map(cell).join(',');
  });
  return ['Friend,Time,What,Place,Choice', ...rows].join('\n');
}
