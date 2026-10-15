import { beforeEach, describe, expect, it } from 'vitest';
import { EPOCH, freshStartForEpoch } from './fresh';

// Brittany 2026-10-16: after wiping the shared database, everyone starts again from the opening page.
describe('fresh start for a new epoch', () => {
  beforeEach(() => localStorage.clear());

  it('clears saved progress once, keeps the trip password, then leaves it alone', () => {
    localStorage.setItem('tp:me', 'Antek');
    localStorage.setItem('tp:resp:Antek', '{}');
    localStorage.setItem('tp-trip-key', 'made-up');
    expect(freshStartForEpoch()).toBe(true);
    expect(localStorage.getItem('tp:me')).toBeNull();
    expect(localStorage.getItem('tp:resp:Antek')).toBeNull();
    expect(localStorage.getItem('tp-trip-key')).toBe('made-up');
    expect(localStorage.getItem('tp-epoch')).toBe(EPOCH);

    localStorage.setItem('tp:me', 'Antek');
    expect(freshStartForEpoch()).toBe(false);
    expect(localStorage.getItem('tp:me')).toBe('Antek');
  });

  it('clears again when the epoch moves on', () => {
    localStorage.setItem('tp-epoch', '2020-01-01');
    localStorage.setItem('tp:me', 'Lazza');
    expect(freshStartForEpoch()).toBe(true);
    expect(localStorage.getItem('tp:me')).toBeNull();
  });
});
