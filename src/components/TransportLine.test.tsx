import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import legsData from '../data/legs.json';
import { DayRows } from '../screens/MyTrip';
import type { DayEntry, Leg, Plan } from '../types';
import { hm, transportOf, transportText } from './TransportLine';

const legs = legsData as unknown as Leg[];
const find = (a: string, b: string) => legs.find(l => l.a === a && l.b === b)!;

describe('km in legs.json', () => {
  it('carries the km column of every hub-to-hub row through, and none for the estimated leg', () => {
    expect(find('Sigiriya', 'Kandy').km).toBe(89.3);
    expect(find('Colombo', 'Kandy').km).toBe(121);
    expect(find('AIR', 'Colombo').km).toBe(33.8);
    expect(find('Weligama', 'Colombo').km).toBeUndefined();
    expect(legs.filter(l => l.km === undefined).map(l => `${l.a}-${l.b}`)).toEqual(['Weligama-Colombo']);
  });
  it('matches the research tables row for row', () => {
    const rows = ['research/google_listings.md', 'research/maps_legs_extra.md']
      .flatMap(f => readFileSync(f, 'utf8').split('\n').filter(l => l.startsWith('|') && /->/.test(l)).map(l => l.split('|').slice(1, -1).map(c => c.trim())));
    for (const l of legs) {
      const row = rows.find(r => l.src.includes(r[0].replace(/^\d+\s+/, '') + ' ' + r[1]));
      expect(row, l.src).toBeDefined();
      expect(l.km ?? '-').toBe(row![2] === '-' ? '-' : Number(row![2]));
    }
  });
});

describe('transport line', () => {
  const drive = (from: DayEntry['from'], to: DayEntry['to'], label: string, hours: number): DayEntry => ({ kind: 'drive', label, hours, from, to });
  const plan = (entries: DayEntry[]): Plan => ({
    route: [], areas: [], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
    days: [{ n: 1, area: null, spare: 0, rainSlack: false, entries }],
  });

  it('formats hours as "2 h 50"', () => {
    expect([hm(2.833), hm(3), hm(0.8)]).toEqual(['2 h 50', '3 h', '48 min']);
  });

  it('a drive leg shows mode, places, time and km', () => {
    render(<DayRows legs={legs} plan={plan([drive('Sigiriya', 'Kandy', 'Drive from Sigiriya to Kandy', find('Sigiriya', 'Kandy').hours)])} />);
    expect(screen.getByText('Drive · Sigiriya to Kandy · 2 h 58 · 89 km')).toBeInTheDocument();
  });

  it('a drive leg with no measured km shows no km, and a leg whose time does not match the measurement gets none either', () => {
    const est = find('Weligama', 'Colombo');
    render(<DayRows legs={legs} plan={plan([drive('Weligama', 'Colombo', 'Drive from Weligama to Colombo', est.hours)])} />);
    expect(screen.getByText('Drive · Weligama to Colombo · 2 h')).toBeInTheDocument();
    expect(screen.queryByText(/km/)).toBeNull();
    expect(transportOf(drive('Sigiriya', 'Kandy', 'Drive from Sigiriya to Kandy', 5), legs)?.km).toBeUndefined();
  });

  it('a train shows its own line with an "about" time and no distance', () => {
    const t = transportOf({ kind: 'train', label: 'Nanu Oya to Ella train', hours: 2.5, itemId: 'train', from: 'Nuwara Eliya', to: 'Ella' }, legs)!;
    expect(transportText(t)).toBe('Train · Nanu Oya to Ella · about 2 h 30');
  });

  it('activities and free time have no transport line', () => {
    expect(transportOf({ kind: 'activity', label: 'x', hours: 1 }, legs)).toBeNull();
  });
});
