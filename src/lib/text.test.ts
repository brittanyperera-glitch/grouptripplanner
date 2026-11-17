import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as dayParts from '../screens/dayParts';
import * as stayflow from './stayflow';
import { andList } from './text';

const sources = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
});

describe('andList', () => {
  it('joins with commas and a last "and", and leaves one or none alone', () => {
    expect(andList([])).toBe('');
    expect(andList(['Ella'])).toBe('Ella');
    expect(andList(['Alex', 'Saulie'])).toBe('Alex and Saulie');
    expect(andList(['Ella', 'Kandy and Knuckles', 'Colombo'])).toBe('Ella, Kandy and Knuckles and Colombo');
  });
  it('is imported from text.ts: no module re-exports it and no other source joins "A, B and C" by hand', () => {
    expect('andList' in stayflow).toBe(false);
    expect('andList' in dayParts).toBe(false);
    expect(sources('src').filter(f => /\.join\(', '\)\}? and /.test(readFileSync(f, 'utf8')))).toEqual(['src/lib/text.ts']);
  });
});
