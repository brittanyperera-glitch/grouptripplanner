import { describe, expect, it } from 'vitest';
import generated from './catalogue.json';
import { AREAS } from '../types';

// The planner iterates AREAS (src/types.ts) while the generated catalogue carries its own `areas`, and the JSON
// is cast to Item[] so tsc never checks an item's area string. An item under a misspelt area is never planned.
const built = generated as unknown as { areas: string[]; items: { id: string; area: string }[] };

describe('areas have one source of truth', () => {
  it('the catalogue area list equals AREAS, in order', () => {
    expect(built.areas).toEqual(AREAS);
  });
  it('every item is in a known area', () => {
    expect(built.items.filter(i => !(AREAS as string[]).includes(i.area)).map(i => `${i.id}: ${i.area}`)).toEqual([]);
  });
});
