import type { Tier } from '../types';

// Quips play on Must and Skip only: the first of each always, then at most once every GAP cards.
const GAP = 5;

export class QuipGate {
  private card = 0;
  private last = -Infinity;
  private seen = new Set<Tier>();

  next(tier: Tier): boolean {
    this.card += 1;
    if (tier !== 'must' && tier !== 'skip') return false;
    const first = !this.seen.has(tier);
    this.seen.add(tier);
    if (!first && this.card - this.last < GAP) return false;
    this.last = this.card;
    return true;
  }
}
