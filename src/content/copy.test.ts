import { describe, expect, it } from 'vitest';
import copyData from './copy.json';
import type { Copy } from '../state';

const isStringMap = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'string');

function problems(c: unknown): string[] {
  const out: string[] = [];
  const o = c as Record<string, unknown>;
  if (typeof o?.welcome !== 'string') out.push('welcome must be a string');
  const q = o?.quips as Record<string, unknown> | undefined;
  for (const k of ['name', 'days', 'pace', 'tier']) {
    if (!isStringMap(q?.[k])) out.push(`quips.${k} must be a map of strings`);
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
    expect(problems({ welcome: '', quips: { name: '', days: {}, pace: {}, tier: {} }, items: {} })).toEqual(['quips.name must be a map of strings']);
  });
});
