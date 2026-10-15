-- MyEnglish: conflicts are settled by PROGRESS first, then by time.
-- Run once in the SQL editor after 0001-0003.
--
-- Before: the later change (ts) won. A machine that was behind but studied later could overwrite a card the
-- other machine had taken further. Now, for cards, grammar lessons and mistakes, the row with more reviews
-- (`prog` = data.reps, which only ever grows) wins, and the later change only breaks a tie.
-- Everything else keeps "the later change wins". Logs and events are still only ever added.
-- A profile's level can no longer go down (XP never does: the ledger keeps the larger value per device and day).

alter table public.sync_rows add column if not exists prog bigint not null default 0;

update public.sync_rows
set prog = case when (data ->> 'reps') ~ '^[0-9]{1,9}$' then (data ->> 'reps')::bigint else 0 end
where kind in ('card', 'grammar', 'mistake');

create or replace function public.sync_push(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'batch must be an array of at most 1000 rows';
  end if;

  insert into public.sync_rows (user_id, kind, key, data, ts, prog, updated_at)
  select uid, r ->> 'kind', r ->> 'key', r -> 'data', (r ->> 'ts')::timestamptz,
         case when r ->> 'kind' in ('card', 'grammar', 'mistake') and (r -> 'data' ->> 'reps') ~ '^[0-9]{1,9}$'
              then (r -> 'data' ->> 'reps')::bigint else 0 end,
         clock_timestamp()
  from jsonb_array_elements(p_rows) r
  where r ->> 'kind' in ('card', 'word', 'log', 'event', 'mistake', 'grammar', 'kv')
    and char_length(r ->> 'key') between 1 and 200
    and pg_column_size(r -> 'data') <= 20000
  on conflict (user_id, kind, key) do update
    set data = excluded.data, ts = excluded.ts, prog = excluded.prog, updated_at = clock_timestamp()
    -- more progress wins; the later change breaks a tie (kinds without progress all have prog 0)
    where (excluded.prog, excluded.ts) > (public.sync_rows.prog, public.sync_rows.ts)
      and public.sync_rows.kind not in ('log', 'event');
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- A level never goes down. "Reset all data" (sync_clear) is the one way back to 1.
create or replace function public.profiles_keep_level() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('myenglish.allow_level_reset', true), '') <> 'on' then
    new.level := greatest(old.level, new.level);
  end if;
  return new;
end $$;

drop trigger if exists profiles_keep_level on public.profiles;
create trigger profiles_keep_level before update on public.profiles
  for each row execute function public.profiles_keep_level();

create or replace function public.sync_clear() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.sync_rows where user_id = auth.uid();
  delete from public.xp_daily where user_id = auth.uid();
  perform set_config('myenglish.allow_level_reset', 'on', true);
  update public.profiles set level = 1, streak = 0, updated_at = now() where user_id = auth.uid();
end $$;

revoke execute on function public.sync_clear() from public, anon;
grant execute on function public.sync_clear() to authenticated;
