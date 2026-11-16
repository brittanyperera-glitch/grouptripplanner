import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

// The Supabase SQL editor runs the script as one transaction, so one statement that fails on a re-run rolls back
// everything, including tables added since the last run (choice_log went missing live this way).
const files = ['supabase/schema.sql', 'supabase/migrations/2026-11-16-final-stage.sql'];

describe.each(files)('%s can be re-run', file => {
  const sql = fs.readFileSync(file, 'utf8');

  it('drops every policy before creating it', () => {
    const created = [...sql.matchAll(/create policy "([^"]+)" on (\w+)/g)].map(m => `${m[1]} on ${m[2]}`);
    const dropped = new Set([...sql.matchAll(/drop policy if exists "([^"]+)" on (\w+)/g)].map(m => `${m[1]} on ${m[2]}`));
    expect(created.length).toBeGreaterThan(0);
    expect(created.filter(p => !dropped.has(p))).toEqual([]);
  });

  // Pasting into the SQL editor can join every line into one, and a -- comment then swallows the rest of the script.
  it('has no line comments, so it still runs when pasted onto one line', () => {
    expect(sql.match(/--/g)).toBeNull();
  });

  it('gates every anon policy on the trip password', () => {
    const policies = [...sql.matchAll(/create policy [^;]+;/g)].map(m => m[0]);
    expect(policies.length).toBeGreaterThan(0);
    expect(policies.filter(p => !/public\.trip_ok\(\)/.test(p) || /\(true\)/.test(p))).toEqual([]);
  });

  it('creates tables only if missing and never adds to the publication unguarded', () => {
    expect(sql.match(/create table (?!if not exists)/g)).toBeNull();
    expect(sql.match(/^alter publication .* add table/gm)).toBeNull();
  });

  const policiesOn = (table: string, ops: string[]) =>
    [...sql.matchAll(/create policy [^;]+;/g)].map(m => m[0])
      .filter(p => new RegExp(`on ${table} for (${ops.join('|')})\\b`).test(p));

  it('needs the organiser key to write trip_settings and stays_admin', () => {
    for (const table of ['trip_settings', 'stays_admin']) {
      const writes = policiesOn(table, ['insert', 'update']);
      expect(writes.length).toBe(2);
      expect(writes.filter(p => !/public\.admin_ok\(\)/.test(p) || !/public\.trip_ok\(\)/.test(p))).toEqual([]);
    }
  });

  it('reads the organiser key from the x-admin-key header', () => {
    const body = sql.match(/create or replace function public\.admin_ok\(\)[\s\S]*?\$\$;?[\s\S]*?\$\$/)?.[0] ?? '';
    expect(body).toContain("'x-admin-key'");
    expect(body).toContain('admin_secret');
  });

  it('lets only the organiser change the trip password', () => {
    const body = sql.match(/create or replace function public\.set_trip_password[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/not public\.admin_ok\(\)[\s\S]*raise exception/);
  });

  it('has no delete policy and adds nothing to the publication', () => {
    expect(sql.match(/for delete/g)).toBeNull();
    expect(sql.match(/alter publication/g)).toBeNull();
  });
});
