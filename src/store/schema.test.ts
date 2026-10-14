import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/schema.sql', 'utf8').replace(/--.*$/gm, '');
const TABLES = ['responses', 'suggestions', 'knockout_votes'];

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
    expect(sql.match(/check \(name in \('Brittany','Alex','Antek','Lazza','Saulie'\)\)/g)).toHaveLength(3);
    expect(sql).toMatch(/flex boolean not null default false/);
    expect(sql).toMatch(/alter publication supabase_realtime add table responses, suggestions, knockout_votes/);
  });
});
