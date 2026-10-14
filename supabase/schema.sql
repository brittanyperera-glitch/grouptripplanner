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
  title text not null,
  area text,
  note text,
  status text not null default 'pending',
  created_at timestamptz default now()
);

create table if not exists knockout_votes (
  fork_id text,
  name text check (name in ('Brittany','Alex','Antek','Lazza','Saulie')),
  choice text not null,
  primary key (fork_id, name)
);

alter table responses enable row level security;
alter table suggestions enable row level security;
alter table knockout_votes enable row level security;

create policy "anon all" on responses for all to anon using (true) with check (true);
create policy "anon all" on suggestions for all to anon using (true) with check (true);
create policy "anon all" on knockout_votes for all to anon using (true) with check (true);

alter publication supabase_realtime add table responses, suggestions, knockout_votes;
