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

alter table responses enable row level security;
alter table suggestions enable row level security;
alter table knockout_votes enable row level security;
alter table choice_log enable row level security;

/* The anon key ships in the browser, so anon can read, add and change rows but never delete them. */
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

create policy "anon select" on responses for select to anon using (true);
create policy "anon insert" on responses for insert to anon with check (true);
create policy "anon update" on responses for update to anon using (true) with check (true);

create policy "anon select" on suggestions for select to anon using (true);
create policy "anon insert" on suggestions for insert to anon with check (true);
create policy "anon update" on suggestions for update to anon using (true) with check (true);

create policy "anon select" on knockout_votes for select to anon using (true);
create policy "anon insert" on knockout_votes for insert to anon with check (true);
create policy "anon update" on knockout_votes for update to anon using (true) with check (true);

create policy "anon select" on choice_log for select to anon using (true);
create policy "anon insert" on choice_log for insert to anon with check (true);

/* Adding a table that is already in the publication is an error, so add only the missing ones. */
do $$
declare t text;
begin
  foreach t in array array['responses','suggestions','knockout_votes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
