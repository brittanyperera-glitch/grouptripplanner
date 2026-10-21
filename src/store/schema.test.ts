import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/schema.sql', 'utf8').replace(/--.*$/gm, '');
// crew_stays added 2026-10-16 for the stays phase: 4 tables carry the anon select/insert/update trio.
// place_suggestions and stays_admin added 2026-10-16 for stays suggestions and pins: 6 tables, measured in schema.sql.
// trip_admin added 2026-10-17 for the Trip admin checklist: 7 tables, measured in schema.sql.
const TABLES = ['responses', 'suggestions', 'knockout_votes', 'crew_stays', 'place_suggestions', 'stays_admin', 'trip_admin'];

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

  // The file is run as a whole in the SQL editor, and a re-run must not fail on a policy that already exists.
  it('drops every anon policy before creating it, and every one needs the trip password', () => {
    const raw = readFileSync('supabase/schema.sql', 'utf8');
    expect(raw).not.toMatch(/--/);
    for (const t of TABLES) {
      for (const verb of ['select', 'insert', 'update']) {
        const create = raw.match(new RegExp(`create policy "anon ${verb}" on ${t} for ${verb} to anon[^;]*;`));
        expect(create?.[0], `${t} ${verb}`).toMatch(/public\.trip_ok\(\)/);
        const drop = raw.indexOf(`drop policy if exists "anon ${verb}" on ${t};`);
        expect(drop, `${t} ${verb} drop`).toBeGreaterThanOrEqual(0);
        expect(drop, `${t} ${verb} drop first`).toBeLessThan(create!.index!);
      }
    }
  });

  it('constrains choice, status and text lengths', () => {
    expect(sql).toMatch(/choice text not null check \(choice in \('a','b'\)\)/);
    expect(sql).toMatch(/status text not null default 'pending' check \(status in \('pending','live','rejected'\)\)/);
    expect(sql).toMatch(/check \(length\(title\) <= 80\)/);
    expect(sql).toMatch(/check \(length\(note\) <= 300\)/);
  });

  it('keeps the name check and the flex column, and adds nothing to the realtime publication', () => {
    // 4 since crew_stays (2026-10-16): responses, suggestions, knockout_votes, crew_stays; measured 4 in schema.sql.
    // 5 since place_suggestions (2026-10-16); stays_admin has no name column; measured 5 in schema.sql.
    // 6 since trip_admin (2026-10-17), one row per person; measured 6 in schema.sql.
    // 7 since complaints (2026-10-20), one row per complaint; measured 7 in schema.sql.
    expect(sql.match(/check \(name in \('Brittany','Alex','Antek','Lazza','Saulie'\)\)/g)).toHaveLength(7);
    expect(sql).toMatch(/flex boolean not null default false/);
    // Changed deliberately (Brittany 2026-10-17): row events deliver nothing under the trip lock (supabase.ts syncs on a broadcast ping), so the publication block was dead config and is gone.
    expect(sql).not.toMatch(/alter publication/);
  });
});
