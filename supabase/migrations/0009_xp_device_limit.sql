-- MyEnglish: raise the per-account XP device limit from 10 to 30. Run once in the SQL editor after 0001-0008.
--
-- The web version counts each browser (and each cleared-storage session) as a device with its own device id,
-- so an account used on a few browsers would hit the old limit of 10 quickly. Only the device limit changes
-- (check and error message); the body is otherwise the definition from 0005_xp_limits.sql, which 0006 and 0007
-- do not redefine. The per-account daily XP caps (5000 a day, 100,000 opening balance) are unchanged, and they
-- count all devices together, so more devices do not raise the maximum XP an account can claim.

create or replace function public.xp_push(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  dev text;
  devices int;
  r record;
  cap int;
  other bigint;
  allowed int;
  n int := 0;
  touched int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'batch must be an array of at most 2000 rows';
  end if;
  if jsonb_array_length(p_rows) = 0 then return 0; end if;

  -- One device per call (the app pushes its own ledger): the caps read the other devices' rows
  select min(e ->> 'device_id'), count(distinct e ->> 'device_id') into dev, devices from jsonb_array_elements(p_rows) e;
  if devices <> 1 or char_length(dev) not between 8 and 64 then
    raise exception 'a batch holds the rows of one device';
  end if;

  -- Pushes of one account run one at a time: each reads what the others wrote
  perform pg_advisory_xact_lock(hashtext('xp_push:' || uid::text));

  if not exists (select 1 from public.xp_daily x where x.user_id = uid and x.device_id = dev) then
    select count(distinct x.device_id) into devices from public.xp_daily x where x.user_id = uid;
    if devices >= 30 then
      raise exception 'device limit: this account already has XP from 30 devices' using errcode = 'P0001';
    end if;
  end if;

  for r in
    select (e ->> 'day')::date as d, greatest(0, (e ->> 'xp')::int) as xp from jsonb_array_elements(p_rows) e
  loop
    continue when r.d <> date '0001-01-01' and (r.d < date '2020-01-01' or r.d > current_date + 1);
    -- 5000 XP a day for the account; the opening balance (XP from before the first sync) 100,000 in all
    cap := case when r.d = date '0001-01-01' then 100000 else 5000 end;
    select coalesce(sum(x.xp), 0) into other
    from public.xp_daily x where x.user_id = uid and x.day = r.d and x.device_id <> dev;
    allowed := greatest(0, least(r.xp, cap - other));
    continue when allowed = 0;

    insert into public.xp_daily (user_id, device_id, day, xp, updated_at)
    values (uid, dev, r.d, allowed, now())
    on conflict (user_id, device_id, day) do update
      set xp = excluded.xp, updated_at = now()
      where public.xp_daily.day <> date '0001-01-01' and excluded.xp > public.xp_daily.xp;
    get diagnostics touched = row_count;
    n := n + touched;
  end loop;
  return n;
end $$;

revoke execute on function public.xp_push(jsonb) from public, anon;
grant execute on function public.xp_push(jsonb) to authenticated;
