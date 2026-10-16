import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import copy from '../content/walkthrough.json';
import { lineFor, markSeen, readSeen, shouldShow, todayKey, WALKTHROUGH_IDS, WALKTHROUGH_KEY } from './walkthrough';

const text = (id: string, count?: number) => lineFor({ id, count }, 'Lazza').map(s => s.text).join('');

describe('shouldShow', () => {
  const some = [{}];
  it('truth table', () => {
    expect(shouldShow([], '2026-10-16', null)).toBe(false);
    expect(shouldShow(some, '2026-10-16', null)).toBe(true);
    expect(shouldShow(some, '2026-10-16', '2026-10-16')).toBe(false);
    expect(shouldShow(some, '2026-10-17', '2026-10-16')).toBe(true);
    expect(shouldShow([], '2026-10-17', '2026-10-16')).toBe(false);
  });
});

describe('todayKey', () => {
  it('uses the local date, not UTC', () => {
    expect(todayKey(new Date(2026, 9, 16, 23, 30))).toBe('2026-10-16');
    expect(todayKey(new Date(2026, 9, 16, 0, 5))).toBe('2026-10-16');
    expect(todayKey(new Date(2026, 0, 5, 9))).toBe('2026-01-05');
  });
});

describe('storage', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  it('round trips under the documented key', () => {
    markSeen(new Date(2026, 9, 16, 12));
    expect(localStorage.getItem(WALKTHROUGH_KEY)).toBe('2026-10-16');
    expect(readSeen()).toBe('2026-10-16');
  });
  it('does not throw when storage does', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readSeen()).toBeNull();
    expect(() => markSeen()).not.toThrow();
  });
  it('key name is stable', () => { expect(WALKTHROUGH_KEY).toBe('tp:walkthrough-day'); });
});

describe('lineFor counts', () => {
  it('plural and singular with the real count', () => {
    expect(text('votes', 1)).toContain('1 head-to-head.');
    expect(text('votes', 5)).toContain('5 head-to-heads.');
    expect(text('rate', 12)).toContain('12 places ');
    // Changed deliberately: the old assertion encoded "1 idea are", a grammar defect; one now takes "is".
    expect(text('approve', 1)).toBe('1 idea is awaiting your royal approval.');
    expect(text('approve', 2)).toBe('2 ideas are awaiting your royal approval.');
    expect(text('rate', 1)).toBe('There is still 1 place you have not judged. Rude.');
  });
  it('marks the count as an accent segment and leaves non-count braces alone', () => {
    expect(lineFor({ id: 'votes', count: 3 }, 'L').filter(s => s.accent).map(s => s.text)).toEqual(['3 head-to-heads']);
    expect(text('stayRank')).toContain('top 2');
  });
});

describe('copy', () => {
  const strings = (o: unknown): string[] => (typeof o === 'string' ? [o] : Object.values(o as object).flatMap(strings));
  it('has no "beta", no em dash, and every string under 25 words', () => {
    for (const s of strings(copy)) {
      expect(s.toLowerCase()).not.toContain('beta');
      expect(s).not.toContain('—');
      expect(s.split(/\s+/).length).toBeLessThan(25);
    }
  });
  it('carries the five existing and five Stays ids', () => {
    expect(WALKTHROUGH_IDS).toEqual(expect.arrayContaining(['votes', 'final', 'rate', 'approve', 'awards', 'stayQuiz', 'stayAdd', 'stayLock', 'stayRank', 'stayVote']));
  });
});

describe('id coverage', () => {
  // Reads the union straight from source so an id added to OpenItem without copy fails here.
  const src = readFileSync('src/lib/openItems.ts', 'utf8');
  const union = src.match(/id:\s*((?:'[A-Za-z]+'\s*\|?\s*)+);/)?.[1] ?? '';
  const ids = [...union.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]);
  it('parses a non-empty id union from openItems.ts', () => { expect(ids.length).toBeGreaterThanOrEqual(5); });
  it('every OpenItem id has a copy entry with a line and a button', () => {
    for (const id of ids) {
      const e = (copy.items as Record<string, { line?: string; button?: string }>)[id];
      expect(e?.line, id).toBeTruthy();
      expect(e?.button, id).toBeTruthy();
    }
  });
});
