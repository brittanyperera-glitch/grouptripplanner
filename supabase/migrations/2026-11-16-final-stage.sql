/* The organiser password. Only its sha256 is stored, and anon has no policy on this table, so it cannot be read. */
/* Set or change it with supabase/set-admin-password.sql, never in this file. */
create table if not exists admin_secret (
  id int primary key default 1 check (id = 1),
  key_hash text not null
);
alter table admin_secret enable row level security;

/* True when the request carries the organiser password in its x-admin-key header. */
create or replace function public.admin_ok() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from admin_secret
    where key_hash = encode(digest(lower(btrim(coalesce(current_setting('request.headers', true)::json->>'x-admin-key', ''))), 'sha256'), 'hex')
  )
$$;
revoke all on function public.admin_ok() from public;
grant execute on function public.admin_ok() to anon;

/* Final stage: the organiser's trip settings in one row (start date, edited plan, booking dates, change log). Writes need the organiser password too. Not in the realtime publication. */
create table if not exists trip_settings (
  id int primary key default 1 check (id = 1),
  start_date date,
  plan jsonb check (octet_length(plan::text) <= 20000),
  booking_dates jsonb not null default '{}' check (octet_length(booking_dates::text) <= 20000),
  overrides jsonb not null default '[]' check (octet_length(overrides::text) <= 20000),
  updated_at timestamptz not null default now()
);

/* Final stage: arrival and departure per traveller, as Sri Lanka local 'YYYY-MM-DDTHH:mm' text. */
create table if not exists travellers (
  name text primary key check (name in ('Brittany','Alex','Antek','Lazza','Saulie')),
  arrive_local text,
  arrive_flight text check (char_length(arrive_flight) <= 12),
  depart_local text,
  depart_flight text check (char_length(depart_flight) <= 12),
  updated_at timestamptz not null default now()
);

/* Final stage: who is booking each item. A null owner is unclaimed, and anon cannot delete. */
create table if not exists booking_claims (
  item_id text primary key check (char_length(item_id) between 1 and 80),
  owner text check (owner is null or owner in ('Brittany','Alex','Antek','Lazza','Saulie')),
  updated_at timestamptz not null default now()
);

alter table stays_admin add column if not exists fallen jsonb not null default '[]';

alter table trip_settings enable row level security;
alter table travellers enable row level security;
alter table booking_claims enable row level security;

/* Lets the organiser change the friends' trip password from the app. */
create or replace function public.set_trip_password(new_key text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.admin_ok() then
    raise exception 'organiser key required';
  end if;
  insert into trip_secret (id, key_hash) values (1, encode(digest(lower(btrim(new_key)), 'sha256'), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
end
$$;
revoke all on function public.set_trip_password(text) from public;
grant execute on function public.set_trip_password(text) to anon;

drop policy if exists "anon select" on trip_settings;
drop policy if exists "anon insert" on trip_settings;
drop policy if exists "anon update" on trip_settings;
drop policy if exists "anon select" on travellers;
drop policy if exists "anon insert" on travellers;
drop policy if exists "anon update" on travellers;
drop policy if exists "anon select" on booking_claims;
drop policy if exists "anon insert" on booking_claims;
drop policy if exists "anon update" on booking_claims;
drop policy if exists "anon insert" on stays_admin;
drop policy if exists "anon update" on stays_admin;

create policy "anon select" on trip_settings for select to anon using (public.trip_ok());
create policy "anon insert" on trip_settings for insert to anon with check (public.trip_ok() and public.admin_ok());
create policy "anon update" on trip_settings for update to anon using (public.trip_ok() and public.admin_ok()) with check (public.trip_ok() and public.admin_ok());
create policy "anon select" on travellers for select to anon using (public.trip_ok());
create policy "anon insert" on travellers for insert to anon with check (public.trip_ok());
create policy "anon update" on travellers for update to anon using (public.trip_ok()) with check (public.trip_ok());
create policy "anon select" on booking_claims for select to anon using (public.trip_ok());
create policy "anon insert" on booking_claims for insert to anon with check (public.trip_ok());
create policy "anon update" on booking_claims for update to anon using (public.trip_ok()) with check (public.trip_ok());
create policy "anon insert" on stays_admin for insert to anon with check (public.trip_ok() and public.admin_ok());
create policy "anon update" on stays_admin for update to anon using (public.trip_ok() and public.admin_ok()) with check (public.trip_ok() and public.admin_ok());

notify pgrst, 'reload schema';
