import { describe, expect, it } from 'vitest';
import { AREAS, type Category, type Hub, type Item, type Slot } from '../types';
import catalogue from './catalogue.json';

const SLOTS: Slot[] = ['sunrise', 'morning', 'afternoon', 'sunset', 'evening', 'late', 'any'];
const CATEGORIES: Category[] = ['Food', 'Temple', 'History', 'Nature', 'Hike', 'Wildlife', 'Beach', 'Train', 'Adventure', 'Culture', 'Nightlife'];
const HUBS: Hub[] = ['AIR', 'Colombo', 'Jaffna', 'Trincomalee', 'Sigiriya', 'Kandy', 'Kitulgala', 'Nuwara Eliya', 'Ella', 'Tissa', 'Udawalawe', 'Weligama'];

describe('the late scuba entry', () => {
  const scuba = (catalogue as unknown as { items: Item[] }).items.find(i => i.id === 'scuba');
  it('is a late item with the researched Weligama round trip', () => {
    expect(scuba).toBeDefined();
    expect(scuba!.late).toBe(true);
    expect(scuba!.sideTrip).toBe(1.5);
  });
  it('uses only values the app knows', () => {
    expect(AREAS).toContain(scuba!.area);
    expect(SLOTS).toContain(scuba!.slot);
    expect(CATEGORIES).toContain(scuba!.category);
    expect(HUBS).toContain(scuba!.hub);
  });
  it('is the only late item', () => {
    expect((catalogue as unknown as { items: Item[] }).items.filter(i => i.late).map(i => i.id)).toEqual(['scuba']);
  });
});
