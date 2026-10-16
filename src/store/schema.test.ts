import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/schema.sql', 'utf8').replace(/--.*$/gm, '');
// crew_stays added 2026-10-16 for the stays phase: 4 tables carry the anon select/insert/update trio.
const TABLES = ['responses', 'suggestions', 'knockout_votes', 'crew_stays'];

describe('supabase/schema.sql', () => {
  it('grants anon select, insert and update on every table, and never delete or for all', () => {
    expect(sql).not.toMatch(/for all/i);
    expect(sql).not.toMatch(/for delete/i);
    for (const t of TABLES) {
      for (const verb of ['select', 'insert', 'update']) {
        expect(sql, `${t} ${verb}`).toMatch(new RegExp(`create policy "anon ${verb}" on ${t} for ${verb} to anon`));
      }
    }
  });

  it('constrains choice, status and text lengths', () => {
    expect(sql).toMatch(/choice text not null check \(choice in \('a','b'\)\)/);
    expect(sql).toMatch(/status text not null default 'pending' check \(status in \('pending','live','rejected'\)\)/);
    expect(sql).toMatch(/check \(length\(title\) <= 80\)/);
    expect(sql).toMatch(/check \(length\(note\) <= 300\)/);
  });

  it('keeps the name check, the flex column and the realtime publication', () => {
    // 4 since crew_stays (2026-10-16): responses, suggestions, knockout_votes, crew_stays; measured 4 in schema.sql.
    expect(sql.match(/check \(name in \('Brittany','Alex','Antek','Lazza','Saulie'\)\)/g)).toHaveLength(4);
    expect(sql).toMatch(/flex boolean not null default false/);
    // Added through a guarded loop so a re-run does not fail on a table that is already published.
    expect(sql).toMatch(/array\['responses','suggestions','knockout_votes'\]/);
    expect(sql).toMatch(/alter publication supabase_realtime add table %I/);
  });
});
