import { describe, expect, it } from 'vitest';
import copyData from './copy.json';
import type { Copy } from '../state';

// A quip is one string or a non-empty list of strings (picked at random).
const isQuip = (x: unknown) => typeof x === 'string' || (Array.isArray(x) && x.length > 0 && x.every(y => typeof y === 'string'));
const isQuipMap = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(isQuip);

function problems(c: unknown): string[] {
  const out: string[] = [];
  const o = c as Record<string, unknown>;
  if (typeof o?.welcome !== 'string') out.push('welcome must be a string');
  if (o?.welcomeSub !== undefined && typeof o.welcomeSub !== 'string') out.push('welcomeSub must be a string');
  const pl = o?.players as Record<string, { title?: unknown; stats?: unknown }> | undefined;
  if (pl !== undefined) for (const [n, v] of Object.entries(pl)) {
    if (v.title !== undefined && typeof v.title !== 'string') out.push(`players.${n}.title must be a string`);
    if (v.stats !== undefined && !(Array.isArray(v.stats) && v.stats.every((s: { label?: unknown; value?: unknown }) => typeof s.label === 'string' && typeof s.value === 'number' && s.value >= 0 && s.value <= 10)))
      out.push(`players.${n}.stats must be {label, value 0-10}[]`);
  }
  const q = o?.quips as Record<string, unknown> | undefined;
  for (const k of ['name', 'days', 'pace', 'tier']) {
    if (!isQuipMap(q?.[k])) out.push(`quips.${k} must be a map of strings or string lists`);
  }
  const items = o?.items;
  if (typeof items !== 'object' || items === null || Array.isArray(items)) out.push('items must be a map');
  else {
    for (const [id, v] of Object.entries(items)) {
      const e = v as Record<string, unknown>;
      for (const f of ['take', 'review', 'reviewUrl']) {
        if (e[f] !== undefined && typeof e[f] !== 'string') out.push(`items.${id}.${f} must be a string`);
      }
    }
  }
  return out;
}

describe('copy.json', () => {
  it('satisfies the Copy shape at runtime', () => {
    expect(problems(copyData)).toEqual([]);
    const typed: Copy = copyData;
    expect(typed.quips.name).toEqual(expect.any(Object));
  });

  it('the checker rejects a string where a map belongs', () => {
    expect(problems({ welcome: '', quips: { name: '', days: {}, pace: {}, tier: {} }, items: {} })).toEqual(['quips.name must be a map of strings or string lists']);
  });

  it('the checker rejects an empty list or a non-string in a list', () => {
    expect(problems({ welcome: '', quips: { name: {}, days: {}, pace: {}, tier: { must: [] } }, items: {} })).toEqual(['quips.tier must be a map of strings or string lists']);
    expect(problems({ welcome: '', quips: { name: {}, days: {}, pace: {}, tier: { must: ['ok', 3] } }, items: {} })).toEqual(['quips.tier must be a map of strings or string lists']);
  });
});
