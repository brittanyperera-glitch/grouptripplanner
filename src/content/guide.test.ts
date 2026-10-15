import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import guide from './guide.json';

type Entry = { title?: string; body?: string; list?: string[]; after?: string };
type Section = { id: string; label: string; intro?: string; entries?: Entry[]; phrases?: { english: string; sinhala: string; say: string }[] };
const sections = (guide as { sections: Section[] }).sections;

const read = (f: string) => readFileSync(`${process.cwd()}/docs/guide/${f}`, 'utf8');
const TAG = /\s*`\[drafted in Britt's tone\]`/g;
const clean = (s: string) => s.replace(TAG, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

// Every piece of text the guide shows, from the json.
const shown = new Set<string>();
for (const s of sections) {
  if (s.intro) shown.add(s.intro);
  for (const e of s.entries ?? []) for (const t of [e.title, e.body, e.after, ...(e.list ?? [])]) if (t) shown.add(t);
  for (const p of s.phrases ?? []) [p.english, p.sinhala, p.say].forEach(t => shown.add(t));
}

// Every piece of text in the md: titles, bodies, sub-list items, loose paragraphs, table cells.
function expected(file: string): string[] {
  const out: string[] = [];
  let started = false;
  for (const raw of read(file).split('\n')) {
    if (raw.startsWith('## ')) { started = true; continue; }
    if (!started || !raw.trim() || /^\|[-| ]+\|$/.test(raw.trim())) continue;
    const line = raw.trim();
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(clean);
      if (cells[0] !== 'English') out.push(...cells);
    } else if (/^\s+- /.test(raw)) {
      out.push(clean(raw.replace(/^\s+- /, '')));
    } else if (line.startsWith('- **')) {
      const m = /^- \*\*(.+?)\*\*(?:\s*`\[drafted in Britt's tone\]`)?:?\s*(.*)$/.exec(line);
      if (!m) throw new Error(`unparsed: ${line}`);
      out.push(clean(m[1].replace(/:$/, '')));
      if (m[2]) out.push(clean(m[2]));
    } else if (line.startsWith('- ')) {
      out.push(clean(line.slice(2)));
    } else {
      out.push(clean(line));
    }
  }
  return out;
}

describe('guide.json mirrors docs/guide', () => {
  for (const file of ['food.md', 'packing-and-phrases.md']) {
    it(`has every entry of ${file}, word for word`, () => {
      const missing = expected(file).filter(t => !shown.has(t));
      expect(missing).toEqual([]);
    });
  }

  it('shows nothing the md has dropped', () => {
    const inMd = new Set([...expected('food.md'), ...expected('packing-and-phrases.md')]);
    expect([...shown].filter(t => !inMd.has(t))).toEqual([]);
  });

  it('has the five sections in order (packing cut by Brittany 2026-10-15)', () => {
    expect(sections.map(s => s.id)).toEqual(['Food', 'Fruit', 'Desserts', 'Beaches', 'Phrases']);
  });

  it('carries no draft tags and no em dashes', () => {
    const all = JSON.stringify(guide);
    expect(all).not.toMatch(/drafted in Britt/);
    expect(all).not.toContain('—');
  });
});
