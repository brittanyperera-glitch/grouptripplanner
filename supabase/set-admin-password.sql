/* Replace PUT-THE-ORGANISER-PASSWORD-HERE, run it in the Supabase SQL editor, then close the tab without saving the query. Running it again changes the password. A blank or unchanged placeholder is refused, since a blank stored password would open organiser writes to a request with no key. */
do $$
declare pw text := 'PUT-THE-ORGANISER-PASSWORD-HERE';
begin
  if btrim(coalesce(pw, '')) = '' or pw like 'PUT-THE-%' then
    raise exception 'organiser password must be set to a real value';
  end if;
  insert into admin_secret (id, key_hash) values (1, encode(extensions.digest(lower(btrim(pw)), 'sha256'), 'hex')) on conflict (id) do update set key_hash = excluded.key_hash;
end
$$;
