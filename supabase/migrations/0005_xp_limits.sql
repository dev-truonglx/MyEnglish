-- MyEnglish: XP and streak limits per account. Run once in the SQL editor after 0001–0004.
--
-- Before: xp_push capped XP per (device, day) but accepted any number of device ids, so one account could
-- post 5000 XP a day (and a 1,000,000 opening balance) for every made-up device id; profiles.streak was
-- whatever the app wrote. Now:
--   * a day's XP is capped per account (all devices together), and so is the opening balance
--   * an account holds XP from at most 10 devices (a reinstall gets a new device id, hence the margin)
--   * the streak written to the profile cannot exceed the days that actually have XP
-- XP is still reported by the app ("casual" ranking): these limits bound what a modified client can claim.

-- Per-account lookups of a day (the caps below, the leaderboard's period sums)
create index if not exists xp_daily_user_day on public.xp_daily (user_id, day);

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
    if devices >= 10 then
      raise exception 'device limit: this account already has XP from 10 devices' using errcode = 'P0001';
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

-- The streak a profile may show: at most the days with XP in the streak's span. The app's streak can bridge a
-- missed day with a freeze (one per 7 active days, at most 2), so the span is the claimed streak plus a few days.
-- A day of study that earned no XP (only reading or pronunciation, say) does not count here.
create or replace function public.profiles_guard_streak() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  xp_days int;
begin
  if new.streak is distinct from old.streak and new.streak > 0 then
    select count(distinct x.day) into xp_days
    from public.xp_daily x
    where x.user_id = new.user_id and x.xp > 0
      and x.day between current_date - (new.streak + 4) and current_date + 1;
    new.streak := least(new.streak, xp_days);
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_streak on public.profiles;
create trigger profiles_guard_streak before update of streak on public.profiles
  for each row execute function public.profiles_guard_streak();
