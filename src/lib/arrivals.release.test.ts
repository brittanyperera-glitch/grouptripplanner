import { describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import type { Item, Leg, Person, Traveller } from '../types';
import { arrivalFlags, leaveByEach } from './arrivals';
import { groupResult } from './group';
import { CHECKIN } from './planner';
import { RELEASE } from './release';

const tr = (name: Person, departLocal: string): Traveller =>
  ({ name, arriveLocal: '2026-12-01T09:00', arriveFlight: null, departLocal, departFlight: null, updatedAt: '' });

describe('the released plan, last day', () => {
  const g = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legs as Leg[], [], RELEASE);
  const lastDay = g.final!.days.at(-1)!;
  const drive = lastDay.entries.filter(e => e.kind === 'drive' && (e.to === undefined || e.to === 'AIR')).reduce((s, e) => s + e.hours, 0);
  const t = { Lazza: tr('Lazza', '2026-12-09T03:15'), Alex: tr('Alex', '2026-12-09T14:30') };

  it('gives each traveller their own leave-by and flags only the 03:15 flyer', () => {
    const by = leaveByEach(t, lastDay);
    const mins = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)) / 60000;
    expect(mins('2026-12-09T03:15') - mins(by.Lazza!)).toBeCloseTo((CHECKIN + drive) * 60, 0);
    expect(mins('2026-12-09T14:30') - mins(by.Alex!)).toBeCloseTo((CHECKIN + drive) * 60, 0);
    expect(by.Alex!.slice(11, 13)).not.toBe('00');
    expect(by.Alex!.slice(0, 10)).toBe('2026-12-09');
    expect(arrivalFlags(t, '2026-12-01', 9, lastDay).map(x => [x.name, x.kind])).toEqual([['Lazza', 'early']]);
  });
});
