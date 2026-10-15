import { beforeEach, describe, expect, it } from 'vitest';
import { freshStartFromUrl } from './fresh';

describe('?fresh link', () => {
  beforeEach(() => localStorage.clear());

  it("wipes this browser's trip progress and drops the flag from the URL", () => {
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:resp:Brittany', '{}');
    localStorage.setItem('other-site', 'keep');
    expect(freshStartFromUrl('http://localhost:5173/?fresh')).toBe('http://localhost:5173/');
    expect(Object.keys(localStorage)).toEqual(['other-site']);
  });

  it('leaves progress alone without the flag', () => {
    localStorage.setItem('tp:me', 'Brittany');
    expect(freshStartFromUrl('http://localhost:5173/?quips=1')).toBeNull();
    expect(localStorage.getItem('tp:me')).toBe('Brittany');
  });
});
