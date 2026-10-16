import { existsSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import hostelData from './hostels.json';
import legs from '../data/legs.json';

type Rating = { source: string; score: number; outOf: number; reviews: number; checked: string; url: string };
type Hostel = {
  id: string; name: string; hub: string; area: string; mapsUrl: string; rating: Rating; about: string; groupFit: string;
  bunkGbp: number | null; roomGbp: number | null; roomFor: number | null; priceDate: string | null; priceChecked: string; priceNote?: string;
  bookUrl: string; photo: { file: string; source: string }; tag?: 'Social' | 'Quiet'; tagSource?: string; note?: string;
};
type Group = { hub: string; label: string; vibe: string; note?: string };
const { hostels, groups } = hostelData as unknown as { hostels: Hostel[]; groups: Group[] };

const hubs = new Set(legs.flatMap(l => [l.a, l.b]));
const OFF = 'Off route';
const words = (s: string) => s.trim().split(/\s+/).length;
const CITY_PAGE = /hostelworld\.com\/hostels\/asia\//;

describe('hostels content', () => {
  it('has hostels with unique ids', () => {
    expect(hostels.length).toBeGreaterThan(30);
    expect(new Set(hostels.map(h => h.id)).size).toBe(hostels.length);
  });

  it('puts every hostel in a stop that exists in legs.json (or Off route), and every stop has a group entry', () => {
    for (const h of hostels) expect(hubs.has(h.hub as never) || h.hub === OFF, `${h.id} hub ${h.hub}`).toBe(true);
    const gh = groups.map(g => g.hub);
    expect(new Set(gh).size).toBe(gh.length);
    for (const h of hostels) expect(gh, `${h.id} has no group`).toContain(h.hub);
    for (const g of groups) expect(hubs.has(g.hub as never) || g.hub === OFF, `group ${g.hub}`).toBe(true);
  });

  it('gives every hostel a rating with a source url and checked date', () => {
    for (const h of hostels) {
      expect(h.rating.score, h.id).toBeGreaterThan(0);
      expect(h.rating.score, h.id).toBeLessThanOrEqual(h.rating.outOf);
      expect(h.rating.reviews, h.id).toBeGreaterThan(0);
      expect(h.rating.url, h.id).toMatch(/^https:\/\//);
      expect(h.rating.checked, h.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('links each hostel to its own page, not a city listing', () => {
    for (const h of hostels) {
      expect(h.bookUrl, h.id).toMatch(/^https:\/\//);
      expect(CITY_PAGE.test(h.bookUrl), `${h.id} bookUrl is a city page`).toBe(false);
      expect(h.mapsUrl, h.id).toMatch(/^https:\/\/www\.google\.com\/maps\//);
    }
  });

  it('has a bunk price and a room price in GBP, or null with a note saying why', () => {
    for (const h of hostels) {
      for (const v of [h.bunkGbp, h.roomGbp]) expect(v === null || (typeof v === 'number' && v > 0 && v < 500), `${h.id} price`).toBe(true);
      if (h.bunkGbp === null || h.roomGbp === null) expect(h.priceNote?.length, `${h.id} null price needs priceNote`).toBeGreaterThan(5);
      if (h.roomGbp !== null) expect(h.roomFor, `${h.id} roomFor`).toBeGreaterThan(0);
      expect(h.priceChecked, h.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (h.bunkGbp !== null || h.roomGbp !== null) expect(h.priceDate, h.id).toMatch(/^2026-12-\d{2}$/);
    }
  });

  it('has a photo file on disk for every hostel, and the images stay small', () => {
    for (const h of hostels) {
      expect(existsSync(`public/img/hostels/${h.photo.file}`), `${h.id} photo ${h.photo.file}`).toBe(true);
      expect(h.photo.source, h.id).toMatch(/^https:\/\//);
    }
    const bytes = readdirSync('public/img/hostels').reduce((n, f) => n + statSync(`public/img/hostels/${f}`).size, 0);
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
  });

  it('keeps every string short with no em dash', () => {
    const strings: [string, string][] = [];
    for (const h of hostels) for (const k of ['about', 'groupFit', 'note', 'priceNote'] as const) if (h[k]) strings.push([`${h.id}.${k}`, h[k]!]);
    for (const g of groups) for (const k of ['vibe', 'note'] as const) if (g[k]) strings.push([`group ${g.hub}.${k}`, g[k]!]);
    for (const [where, s] of strings) {
      expect(words(s), `${where}: ${s}`).toBeLessThan(25);
      expect(s, where).not.toContain('—');
      expect(s, where).toMatch(/^[\x20-\x7e]+$/);
    }
  });

  it('only tags Social or Quiet, and only with a source for it', () => {
    for (const h of hostels) {
      expect([undefined, 'Social', 'Quiet'], h.id).toContain(h.tag);
      if (h.tag) expect(h.tagSource?.length, `${h.id} tag needs tagSource`).toBeGreaterThan(5);
    }
  });

  it('keeps Arugam Bay off the route, with a December note', () => {
    const off = hostels.filter(h => h.hub === OFF);
    expect(off.length).toBeGreaterThan(0);
    expect(groups.find(g => g.hub === OFF)?.note).toMatch(/December/);
    expect(hostels.filter(h => h.hub !== OFF).some(h => /Arugam/i.test(h.area))).toBe(false);
  });
});
