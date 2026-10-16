import copy from '../content/walkthrough.json';
import { WALKTHROUGH_KEY, todayKey } from './walkthroughKey';

export { WALKTHROUGH_KEY, todayKey };
export const WALKTHROUGH_IDS = Object.keys(copy.items);

export interface WalkItem { id: string; count?: number }
export type Segment = { text: string; accent: boolean };

export const shouldShow = (items: unknown[], today: string, lastSeen: string | null): boolean => items.length > 0 && lastSeen !== today;

export const readSeen = (): string | null => { try { return localStorage.getItem(WALKTHROUGH_KEY); } catch { return null; } };
export const markSeen = (now: Date = new Date()): void => { try { localStorage.setItem(WALKTHROUGH_KEY, todayKey(now)); } catch { /* storage unavailable: it may show again */ } };

/** Fills {name}, and turns a "{3 head-to-heads}" placeholder into the item's real count with the right plural. */
export function fill(template: string, name: string, count?: number): string {
  return template.replace(/\{([^}]+)\}/g, (_, inner: string) => {
    if (inner === 'name') return `{${name}}`;
    const m = inner.match(/^\d+ (.+)$/);
    if (m && count !== undefined) return `{${count} ${count === 1 ? m[1].replace(/s$/, '') : m[1]}}`;
    return `{${inner}}`;
  });
}

/** Splits "a {b} c" into plain and accent segments. */
export const segments = (s: string): Segment[] =>
  s.split(/(\{[^}]+\})/).filter(Boolean).map(t => (t.startsWith('{') ? { text: t.slice(1, -1), accent: true } : { text: t, accent: false }));

// Some lines need a different verb for one ("1 idea is"), so the copy can carry a lineOne.
export const lineFor = (item: WalkItem, name: string): Segment[] => {
  const e = (copy.items as Record<string, { line: string; lineOne?: string }>)[item.id];
  return segments(fill(item.count === 1 && e.lineOne ? e.lineOne : e.line, name, item.count));
};
export const buttonFor = (item: WalkItem): string => (copy.items as Record<string, { button: string }>)[item.id].button;
