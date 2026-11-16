import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

// The Supabase SQL editor runs the script as one transaction, so one statement that fails on a re-run rolls back
// everything, including tables added since the last run (choice_log went missing live this way).
describe('supabase/schema.sql can be re-run', () => {
  const sql = fs.readFileSync('supabase/schema.sql', 'utf8');

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

  it('tells the organiser to set the organiser password after schema.sql, and no longer says the app sends no header', () => {
    const readme = fs.readFileSync('README.md', 'utf8');
    expect(readme).toMatch(/set-admin-password\.sql/);
    expect(readme).not.toContain('does not send');
    expect(sql).not.toContain('does not send');
  });

  it('reads the organiser key from the x-admin-key header', () => {
    const body = sql.match(/create or replace function public\.admin_ok\(\)[\s\S]*?\$\$;?[\s\S]*?\$\$/)?.[0] ?? '';
    expect(body).toContain("'x-admin-key'");
    expect(body).toContain('admin_secret');
  });

  it('refuses a request with no organiser key before it hashes anything', () => {
    const body = sql.match(/create or replace function public\.admin_ok\(\)[\s\S]*?\$\$;?[\s\S]*?\$\$/)?.[0] ?? '';
    const guard = body.search(/btrim\(coalesce\([^;]*'x-admin-key'[^;]*, ''\)\) = ''/);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('digest('));
  });

  it('lets only the organiser change the trip password', () => {
    const body = sql.match(/create or replace function public\.set_trip_password[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/not public\.admin_ok\(\)[\s\S]*raise exception/);
  });

  it('never lets an or widen a policy past the trip password', () => {
    const policies = [...sql.matchAll(/create policy [^;]+;/g)].map(m => m[0]);
    expect(policies.filter(p => /\bor\b/i.test(p))).toEqual([]);
  });

  it('gives travellers and booking_claims select, insert and update on the trip password alone', () => {
    for (const table of ['travellers', 'booking_claims']) {
      for (const op of ['select', 'insert', 'update']) {
        const found = policiesOn(table, [op]);
        expect(found.length, `${table} ${op}`).toBe(1);
        expect(found[0], `${table} ${op}`).toMatch(/public\.trip_ok\(\)/);
        expect(found[0], `${table} ${op}`).not.toMatch(/admin_ok/);
      }
    }
  });

  it('closes both organiser functions to public and opens them to anon only', () => {
    for (const fn of ['admin_ok\\(\\)', 'set_trip_password\\(text\\)']) {
      expect(sql, `${fn} revoke`).toMatch(new RegExp(`revoke all on function public\\.${fn} from public;`));
      expect(sql, `${fn} grant`).toMatch(new RegExp(`grant execute on function public\\.${fn} to anon;`));
    }
  });

  it('refuses a blank trip password, which trip_ok would match on a request with no key', () => {
    const body = sql.match(/create or replace function public\.set_trip_password[\s\S]*?\$\$;/)?.[0] ?? '';
    const guard = body.search(/btrim\(coalesce\(new_key, ''\)\) = ''[\s\S]*?raise exception/);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('insert into trip_secret'));
  });

  it('has no delete policy and adds nothing to the publication', () => {
    expect(sql.match(/for delete/g)).toBeNull();
    expect(sql.match(/alter publication/g)).toBeNull();
  });
});

describe('supabase/set-admin-password.sql', () => {
  const sql = fs.readFileSync('supabase/set-admin-password.sql', 'utf8');

  it('raises on a blank or placeholder password before it inserts', () => {
    const guard = sql.search(/btrim\(coalesce\(pw, ''\)\) = ''[\s\S]*?raise exception/);
    expect(guard).toBeGreaterThan(-1);
    expect(sql).toMatch(/pw like 'PUT-THE-%'/);
    expect(guard).toBeLessThan(sql.indexOf('insert into admin_secret'));
  });
});

describe('supabase/set-trip-password.sql', () => {
  const sql = fs.readFileSync('supabase/set-trip-password.sql', 'utf8');

  it('raises on a blank or placeholder password before it inserts', () => {
    const guard = sql.search(/btrim\(coalesce\(pw, ''\)\) = ''[\s\S]*?raise exception/);
    expect(guard).toBeGreaterThan(-1);
    expect(sql).toMatch(/pw like 'PUT-THE-%'/);
    expect(guard).toBeLessThan(sql.indexOf('insert into trip_secret'));
  });
});
