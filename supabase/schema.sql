create table if not exists responses (
  name text primary key check (name in ('Brittany','Alex','Antek','Lazza','Saulie')),
  days int,
  flex boolean not null default false,
  pace int,
  ranking jsonb,
  rated text[] not null default '{}',
  submitted boolean not null default false,
  updated_at timestamptz default now()
);

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name in ('Brittany','Alex','Antek','Lazza','Saulie')),
  title text not null check (length(title) <= 80),
  area text,
  note text check (length(note) <= 300),
  status text not null default 'pending' check (status in ('pending','live','rejected')),
  created_at timestamptz default now()
);

create table if not exists knockout_votes (
  fork_id text,
  name text check (name in ('Brittany','Alex','Antek','Lazza','Saulie')),
  choice text not null check (choice in ('a','b')),
  primary key (fork_id, name)
);

/* Every choice as it was made, never updated or deleted, so the starting opinions survive re-ranks and changed votes. */
create table if not exists choice_log (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('tier','rerank','knockout','days','pace','suggest')),
  ref text,
  value jsonb,
  at timestamptz not null default now()
);

/* Stays phase: one row per person (quiz answers, lock-in, ranks, bingo). Not in the realtime publication: the app reloads on a broadcast ping. */
create table if not exists crew_stays (
  name text primary key check (name in ('Brittany','Alex','Antek','Lazza','Saulie')),
  prefs jsonb not null default '[]',
  quiz_done boolean not null default false,
  locked boolean not null default false,
  ranks jsonb not null default '{}',
  bingo jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

/* Stays phase: places the crew suggest per area. Anon cannot delete, so a suggestion is taken down by status 'withdrawn'. */
create table if not exists place_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name in ('Brittany','Alex','Antek','Lazza','Saulie')),
  area text not null,
  kind text not null,
  title text not null,
  link text,
  price_gbp numeric,
  stay_type text,
  rooms text,
  why text,
  photo text,
  hostel_id text,
  status text not null default 'live',
  created_at timestamptz not null default now()
);

/* Stays phase: Brittany's pins and scouts, kept in one row. */
create table if not exists stays_admin (
  id int primary key check (id = 1),
  pins jsonb not null default '[]',
  scouts jsonb not null default '{}',
  closed jsonb not null default '[]'
);
alter table stays_admin add column if not exists closed jsonb not null default '[]';
alter table stays_admin add column if not exists nights jsonb not null default '{}';

alter table responses enable row level security;
alter table suggestions enable row level security;
alter table knockout_votes enable row level security;
alter table choice_log enable row level security;
/* Trip admin checklist: one row per person, items is a map of item id to that person's entry (done, price, reference, note). Not in the realtime publication. */
create table if not exists trip_admin (
  name text primary key check (name in ('Brittany','Alex','Antek','Lazza','Saulie')),
  items jsonb not null default '{}' check (octet_length(items::text) <= 20000),
  updated_at timestamptz not null default now()
);

/* Complaints from the Group tab: append-only, so anon gets insert and select but no update. */
create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name in ('Brittany','Alex','Antek','Lazza','Saulie')),
  text text not null check (length(text) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table crew_stays enable row level security;
alter table complaints enable row level security;
alter table place_suggestions enable row level security;
alter table stays_admin enable row level security;
alter table trip_admin enable row level security;

/* The trip password. Only its sha256 is stored, and anon has no policy on this table, so it cannot be read. */
/* Set or change it with supabase/set-trip-password.sql, never in this file. */
create extension if not exists pgcrypto with schema extensions;
create table if not exists trip_secret (
  id int primary key default 1 check (id = 1),
  key_hash text not null
);
alter table trip_secret enable row level security;

/* True when the request carries the trip password in its x-trip-key header. The app also calls it to check a typed password. */
create or replace function public.trip_ok() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from trip_secret
    where key_hash = encode(digest(lower(btrim(coalesce(current_setting('request.headers', true)::json->>'x-trip-key', ''))), 'sha256'), 'hex')
  )
$$;
revoke all on function public.trip_ok() from public;
grant execute on function public.trip_ok() to anon;

/* The anon key ships in the browser, so every policy also needs the trip password; anon can never delete. */
/* Every policy is dropped before it is created, so the script can be re-run on a database that already has some of it. */
drop policy if exists "anon all" on responses;
drop policy if exists "anon all" on suggestions;
drop policy if exists "anon all" on knockout_votes;
drop policy if exists "anon select" on responses;
drop policy if exists "anon insert" on responses;
drop policy if exists "anon update" on responses;
drop policy if exists "anon select" on suggestions;
drop policy if exists "anon insert" on suggestions;
drop policy if exists "anon update" on suggestions;
drop policy if exists "anon select" on knockout_votes;
drop policy if exists "anon insert" on knockout_votes;
drop policy if exists "anon update" on knockout_votes;
drop policy if exists "anon select" on choice_log;
drop policy if exists "anon insert" on choice_log;
drop policy if exists "anon select" on complaints;
drop policy if exists "anon insert" on complaints;
drop policy if exists "anon select" on crew_stays;
drop policy if exists "anon insert" on crew_stays;
drop policy if exists "anon update" on crew_stays;
drop policy if exists "anon select" on place_suggestions;
drop policy if exists "anon insert" on place_suggestions;
drop policy if exists "anon update" on place_suggestions;
drop policy if exists "anon select" on stays_admin;
drop policy if exists "anon insert" on stays_admin;
drop policy if exists "anon update" on stays_admin;
drop policy if exists "anon select" on trip_admin;
drop policy if exists "anon insert" on trip_admin;
drop policy if exists "anon update" on trip_admin;

create policy "anon select" on responses for select to anon using (public.trip_ok());
create policy "anon insert" on responses for insert to anon with check (public.trip_ok());
create policy "anon update" on responses for update to anon using (public.trip_ok()) with check (public.trip_ok());

create policy "anon select" on suggestions for select to anon using (public.trip_ok());
create policy "anon insert" on suggestions for insert to anon with check (public.trip_ok());
create policy "anon update" on suggestions for update to anon using (public.trip_ok()) with check (public.trip_ok());

create policy "anon select" on knockout_votes for select to anon using (public.trip_ok());
create policy "anon insert" on knockout_votes for insert to anon with check (public.trip_ok());
create policy "anon update" on knockout_votes for update to anon using (public.trip_ok()) with check (public.trip_ok());

create policy "anon select" on choice_log for select to anon using (public.trip_ok());
create policy "anon insert" on choice_log for insert to anon with check (public.trip_ok());

create policy "anon select" on complaints for select to anon using (public.trip_ok());
create policy "anon insert" on complaints for insert to anon with check (public.trip_ok());

create policy "anon select" on crew_stays for select to anon using (public.trip_ok());
create policy "anon insert" on crew_stays for insert to anon with check (public.trip_ok());
create policy "anon update" on crew_stays for update to anon using (public.trip_ok()) with check (public.trip_ok());

create policy "anon select" on place_suggestions for select to anon using (public.trip_ok());
create policy "anon insert" on place_suggestions for insert to anon with check (public.trip_ok());
create policy "anon update" on place_suggestions for update to anon using (public.trip_ok()) with check (public.trip_ok());

create policy "anon select" on stays_admin for select to anon using (public.trip_ok());
create policy "anon insert" on stays_admin for insert to anon with check (public.trip_ok());
create policy "anon update" on stays_admin for update to anon using (public.trip_ok()) with check (public.trip_ok());

create policy "anon select" on trip_admin for select to anon using (public.trip_ok());
create policy "anon insert" on trip_admin for insert to anon with check (public.trip_ok());
create policy "anon update" on trip_admin for update to anon using (public.trip_ok()) with check (public.trip_ok());

notify pgrst, 'reload schema';
