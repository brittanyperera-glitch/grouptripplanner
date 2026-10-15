import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

// The Supabase SQL editor runs the script as one transaction, so one statement that fails on a re-run rolls back
// everything, including tables added since the last run (choice_log went missing live this way).
const sql = fs.readFileSync('supabase/schema.sql', 'utf8');

describe('supabase/schema.sql can be re-run', () => {
  it('drops every policy before creating it', () => {
    const created = [...sql.matchAll(/create policy "([^"]+)" on (\w+)/g)].map(m => `${m[1]} on ${m[2]}`);
    const dropped = new Set([...sql.matchAll(/drop policy if exists "([^"]+)" on (\w+)/g)].map(m => `${m[1]} on ${m[2]}`));
    expect(created.length).toBeGreaterThan(0);
    expect(created.filter(p => !dropped.has(p))).toEqual([]);
  });

  it('creates tables only if missing and never adds to the publication unguarded', () => {
    expect(sql.match(/create table (?!if not exists)/g)).toBeNull();
    expect(sql.match(/^alter publication .* add table/gm)).toBeNull();
  });
});
