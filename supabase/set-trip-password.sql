/* Replace PUT-THE-PASSWORD-HERE, run it in the Supabase SQL editor, then close the tab without saving the query. Running it again changes the password. */
insert into trip_secret (id, key_hash) values (1, encode(extensions.digest('PUT-THE-PASSWORD-HERE', 'sha256'), 'hex')) on conflict (id) do update set key_hash = excluded.key_hash;
