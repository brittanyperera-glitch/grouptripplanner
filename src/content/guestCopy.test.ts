import { describe, expect, it } from 'vitest';
import copy from './copy.json';

const GUESTS = {
  Tuktuk: { title: 'The local legend', quip: "shouldn't you be driving?" },
  Aunty: { title: 'The TownCCTV', quip: 'welcome aunty!' },
  Groom: { title: 'The bachelor', quip: 'congratulations on the wedding :)' },
} as const;
type Id = keyof typeof GUESTS;
const players = copy.players as Record<string, { title: string; stats: { label: string; value: number }[] }>;
const words = (s: string) => s.trim().split(/\s+/).length;

describe.each(Object.keys(GUESTS) as Id[])('guest %s', id => {
  const p = players[id];
  it('keeps the fixed title and quip', () => {
    expect(p.title).toBe(GUESTS[id].title);
    expect((copy.quips.name as Record<string, string>)[id]).toBe(GUESTS[id].quip);
  });
  it('has three distinct custom stats like the five, integer 1..10', () => {
    expect(p.stats).toHaveLength(3);
    expect(new Set(p.stats.map(s => s.label)).size).toBe(3);
    for (const s of p.stats) {
      expect(['Charm', 'Local knowledge', 'Energy']).not.toContain(s.label);
      expect(Number.isInteger(s.value) && s.value >= 1 && s.value <= 10).toBe(true);
    }
  });
  it('visible strings under 25 words, no em dash or curly quotes', () => {
    const strs = [p.title, GUESTS[id].quip, ...p.stats.map(s => s.label)];
    for (const s of strs) {
      expect(words(s)).toBeLessThan(25);
      expect(s).not.toMatch(/[—‘’“”]/);
    }
  });
});
