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

alter table responses enable row level security;
alter table suggestions enable row level security;
alter table knockout_votes enable row level security;

-- The anon key ships in the browser, so anon can read, add and change rows but never delete them.
drop policy if exists "anon all" on responses;
drop policy if exists "anon all" on suggestions;
drop policy if exists "anon all" on knockout_votes;

create policy "anon select" on responses for select to anon using (true);
create policy "anon insert" on responses for insert to anon with check (true);
create policy "anon update" on responses for update to anon using (true) with check (true);

create policy "anon select" on suggestions for select to anon using (true);
create policy "anon insert" on suggestions for insert to anon with check (true);
create policy "anon update" on suggestions for update to anon using (true) with check (true);

create policy "anon select" on knockout_votes for select to anon using (true);
create policy "anon insert" on knockout_votes for insert to anon with check (true);
create policy "anon update" on knockout_votes for update to anon using (true) with check (true);

alter publication supabase_realtime add table responses, suggestions, knockout_votes;
