import { describe, expect, it } from 'vitest';
import type { Day, DayEntry, Person, Traveller } from '../types';
import { arrivalFlags, lastArrival, leaveBy } from './arrivals';

const tr = (name: Person, arriveLocal: string | null, departLocal: string | null): Traveller =>
  ({ name, arriveLocal, arriveFlight: null, departLocal, departFlight: null, updatedAt: '' });
const drive = (hours: number): DayEntry => ({ kind: 'drive', label: 'drive', hours });
const day = (...entries: DayEntry[]): Day => ({ n: 9, area: null, entries, spare: 0, rainSlack: false });

describe('arrivalFlags', () => {
  const start = '2026-12-01';
  it('flags a day-2 landing as late', () => {
    const f = arrivalFlags({ Alex: tr('Alex', '2026-12-02T09:00', '2026-12-09T20:00') }, start, 9);
    expect(f.map(x => [x.name, x.kind])).toEqual([['Alex', 'late']]);
  });
  it('flags leaving on day 8 of 9 as early', () => {
    const f = arrivalFlags({ Alex: tr('Alex', '2026-12-01T09:00', '2026-12-08T20:00') }, start, 9);
    expect(f.map(x => [x.name, x.kind])).toEqual([['Alex', 'early']]);
  });
  it('flags missing arrival or departure, and nothing else on a null start', () => {
    const t = { Alex: tr('Alex', null, '2026-12-09T20:00'), Antek: tr('Antek', '2026-12-05T09:00', null) };
    expect(arrivalFlags(t, start, 9).map(x => x.kind)).toEqual(['missing', 'missing']);
    const late = { Alex: tr('Alex', '2026-12-05T09:00', '2026-12-02T20:00'), Antek: tr('Antek', null, null) };
    expect(arrivalFlags(late, null, 9).map(x => [x.name, x.kind])).toEqual([['Antek', 'missing']]);
  });
  it('is quiet for someone on day 1 and the last day', () => {
    expect(arrivalFlags({ Alex: tr('Alex', '2026-12-01T06:00', '2026-12-09T23:00') }, start, 9)).toEqual([]);
  });
});

describe('lastArrival', () => {
  it('is the latest landing, or null with none', () => {
    const t = { Alex: tr('Alex', '2026-12-01T09:00', null), Lazza: tr('Lazza', '2026-12-02T01:10', null) };
    expect(lastArrival(t)).toBe('2026-12-02T01:10');
    expect(lastArrival({})).toBeNull();
  });
});

describe('leaveBy', () => {
  it('is departure minus 3 h check-in minus the drive', () => {
    expect(leaveBy({ Alex: tr('Alex', null, '2026-12-09T14:30') }, day(drive(1.5), drive(1)))).toBe('2026-12-09T09:00');
  });
  it('crosses back to the previous date', () => {
    expect(leaveBy({ Alex: tr('Alex', null, '2026-12-09T01:30') }, day(drive(2.5)))).toBe('2026-12-08T20:00');
    expect(leaveBy({ Alex: tr('Alex', null, '2026-12-01T00:00') }, day())).toBe('2026-11-30T21:00');
  });
  it('lets the earliest departure that day set it', () => {
    const t = { Alex: tr('Alex', null, '2026-12-09T18:00'), Antek: tr('Antek', null, '2026-12-09T14:30') };
    expect(leaveBy(t, day(drive(2.5)))).toBe('2026-12-09T09:00');
  });
  it('is null with no departure', () => {
    expect(leaveBy({ Alex: tr('Alex', null, null) }, day(drive(2)))).toBeNull();
  });
});

describe('malformed dates and times', () => {
  it('flags a malformed arrival or departure as missing, and a malformed start as no start', () => {
    const t = { Alex: tr('Alex', 'tomorrow', '2026-12-09T20:00'), Antek: tr('Antek', '2026-12-05T09:00', '9 Dec 8pm') };
    expect(arrivalFlags(t, '2026-12-01', 9).map(x => [x.name, x.kind])).toEqual([['Alex', 'missing'], ['Antek', 'missing']]);
    const ok = { Alex: tr('Alex', '2026-12-05T09:00', '2026-12-02T20:00') };
    expect(arrivalFlags(ok, 'soon', 9)).toEqual([]);
  });
  it('lastArrival and leaveBy ignore them', () => {
    const t = { Alex: tr('Alex', 'soon', '2026-12-09T9pm'), Lazza: tr('Lazza', '2026-12-02T01:10', '2026-12-09T14:30') };
    expect(lastArrival(t)).toBe('2026-12-02T01:10');
    expect(lastArrival({ Alex: tr('Alex', '2026-12-02', null) })).toBeNull();
    expect(leaveBy(t, day(drive(0)))).toBe('2026-12-09T11:30');
    expect(leaveBy({ Alex: tr('Alex', null, 'soon') }, day())).toBeNull();
  });
});
