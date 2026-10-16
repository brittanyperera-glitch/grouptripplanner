import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import generated from './catalogue.json';

// The build regenerates src/data/catalogue.json from data/catalogue.json, so a hand edit to the generated
// file is silently lost at deploy. Fields edited by hand must live in the source.
type Row = { id: string; britt?: string; when?: string; slot: string };
const source = (JSON.parse(fs.readFileSync('data/catalogue.json', 'utf8')) as { items: Row[] }).items;
const built = (generated as unknown as { items: Row[] }).items;

describe('generated catalogue matches data/catalogue.json', () => {
  it('has the same places, tips and labels as the source', () => {
    expect(built.map(i => i.id)).toEqual(source.map(i => i.id));
    for (const s of source) {
      const b = built.find(i => i.id === s.id)!;
      expect(b.britt, `${s.id} britt`).toBe(s.britt);
      expect(b.when, `${s.id} when`).toBe(s.when ?? s.slot);
    }
  });
});
