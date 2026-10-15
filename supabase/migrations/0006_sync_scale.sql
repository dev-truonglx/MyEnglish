-- MyEnglish: scale and hardening. Run once in the SQL editor after 0001-0005.
--
-- What changes:
--   * leaderboard: sums xp_daily once (one grouped scan) and joins the profiles, instead of one subquery per
--     profile. Same arguments, same columns, same ranks.
--   * standing_board (new): the rank widgets' data in ONE call (top N + me + the person above + the person below
--     + how many take part), replacing my_standing + leaderboard.
--   * sync_push: a row with an unreadable `ts` is skipped instead of failing the whole batch; a row key repeated
--     inside a batch no longer fails it; one account may store at most 300,000 rows (sync_usage).
--   * profiles.sync_epoch: bumped by sync_clear ("reset all data"), so another device can notice the reset.
--   * create_group: invite codes come from gen_random_uuid() (CSPRNG) instead of md5(random()).
--   * display names are normalised (spaces collapsed and trimmed) and checked (3-20 characters) by a trigger.
--   * the select/update-own policies use (select auth.uid()), which Postgres evaluates once per query.

-- ---------------------------------------------------------------------------------------------
-- RLS policies: (select auth.uid()) is an init-plan, evaluated once per query instead of once per row
-- ---------------------------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using ((select auth.uid()) = user_id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists sync_rows_select_own on public.sync_rows;
create policy sync_rows_select_own on public.sync_rows for select using ((select auth.uid()) = user_id);
drop policy if exists xp_daily_select_own on public.xp_daily;
create policy xp_daily_select_own on public.xp_daily for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- Display names: one normal form, enforced where the name is written
-- ---------------------------------------------------------------------------------------------
-- "  Al   ice " and "Al ice" are the same name. The unique index on lower(display_name) only works if every
-- writer (sign-up trigger, the app's rename) stores the same form, so the database does it.
create or replace function public.profiles_normalise_name() returns trigger
language plpgsql as $$
begin
  new.display_name := btrim(regexp_replace(new.display_name, '\s+', ' ', 'g'));
  if char_length(new.display_name) not between 3 and 20 then
    raise exception 'display name must be 3-20 characters';
  end if;
  return new;
end $$;

drop trigger if exists profiles_normalise_name on public.profiles;
create trigger profiles_normalise_name before insert or update of display_name on public.profiles
  for each row execute function public.profiles_normalise_name();

-- The sign-up form asks before creating the account, so it applies the same normal form
create or replace function public.display_name_available(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select char_length(s.n) between 3 and 20
     and not exists (select 1 from public.profiles where lower(display_name) = lower(s.n))
  from (select btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')) as n) s;
$$;

-- A profile is created with the account; the name comes from the sign-up metadata. Invalid or taken (the app
-- checks display_name_available first, this is the safety net): a unique fallback.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '\s+', ' ', 'g'));
begin
  if char_length(wanted) not between 3 and 20
     or exists (select 1 from public.profiles where lower(display_name) = lower(wanted)) then
    wanted := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (user_id, display_name) values (new.id, wanted);
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Invite codes from a CSPRNG (md5(random()) is predictable): 10 hex characters of a random v4 uuid
-- ---------------------------------------------------------------------------------------------
create or replace function public.create_group(p_name text) returns table (id uuid, name text, invite_code text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  code text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if char_length(btrim(p_name)) not between 2 and 30 then raise exception 'group name must be 2-30 characters'; end if;
  if (select count(*) from public.group_members where user_id = uid) >= 10 then
    raise exception 'you are in too many groups (max 10)';
  end if;
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.groups g where g.invite_code = code);
  end loop;
  insert into public.groups (name, invite_code, owner) values (btrim(p_name), code, uid) returning groups.id into gid;
  insert into public.group_members (group_id, user_id) values (gid, uid);
  return query select gid, btrim(p_name), code;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Leaderboard: aggregate the ledger once, then join the profiles (0003 ran a subquery per profile)
-- ---------------------------------------------------------------------------------------------
create or replace function public.leaderboard(
  p_from date default null, p_to date default null, p_group uuid default null,
  p_by text default 'xp', p_limit int default 50
) returns table (rank bigint, display_name text, avatar text, xp bigint, level int, streak int, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_by not in ('xp', 'streak') then raise exception 'p_by must be xp or streak'; end if;
  if p_group is not null and not exists (select 1 from public.group_members where group_id = p_group and user_id = uid) then
    raise exception 'not a member of this group';
  end if;

  return query
  with agg as (
    -- XP of the period per person (only group members when a group is asked for)
    select x.user_id, sum(x.xp)::bigint as pts
    from public.xp_daily x
    where (p_from is null or x.day >= p_from)
      and (p_to is null or x.day <= p_to)
      and (p_group is null
           or x.user_id in (select m.user_id from public.group_members m where m.group_id = p_group))
    group by x.user_id
  ),
  scored as (
    -- by XP: the people with XP in the period. UNION also removes the caller's duplicate row below.
    select p.user_id, p.display_name, p.avatar, p.level, p.streak, a.pts as score_xp
    from agg a join public.profiles p on p.user_id = a.user_id
    where p_by = 'xp' and a.pts > 0
    union
    -- by streak: the people of the scope with a streak, each with the XP of the period
    select p.user_id, p.display_name, p.avatar, p.level, p.streak, coalesce(a.pts, 0)::bigint
    from public.profiles p left join agg a on a.user_id = p.user_id
    where p_by = 'streak' and p.streak > 0
      and (p_group is null
           or p.user_id in (select m.user_id from public.group_members m where m.group_id = p_group))
    union
    -- the caller is always on the board
    select p.user_id, p.display_name, p.avatar, p.level, p.streak, coalesce(a.pts, 0)::bigint
    from public.profiles p left join agg a on a.user_id = p.user_id
    where p.user_id = uid
  ),
  ranked as (
    select rank() over (order by (case when p_by = 'streak' then sc.streak::bigint else sc.score_xp end) desc) as rnk, sc.*
    from scored sc
  )
  select r.rnk, r.display_name, r.avatar, r.score_xp, r.level, r.streak, r.user_id = uid
  from ranked r
  where r.rnk <= greatest(1, least(p_limit, 100)) or r.user_id = uid
  order by r.rnk, r.display_name;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Standing board: everything the rank widgets show, in one call (replaces my_standing + leaderboard)
--   p_from  : first day counted (null = all time)   p_group : null = everyone, else a group of the caller
--   p_limit : size of the top part (1..100)
-- Counted = people with XP in the period, plus the caller. Rows: the top p_limit, the caller (is_me), the person
-- just above the caller (is_above: the least XP that is still more than the caller's) and just below (is_below),
-- each person once. total = how many are counted.
-- ---------------------------------------------------------------------------------------------
create or replace function public.standing_board(p_from date default null, p_group uuid default null, p_limit int default 10)
returns table (rank bigint, display_name text, avatar text, xp bigint, level int, streak int,
               is_me boolean, is_above boolean, is_below boolean, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_group is not null and not exists (select 1 from public.group_members where group_id = p_group and user_id = uid) then
    raise exception 'not a member of this group';
  end if;

  return query
  with agg as (
    select x.user_id, sum(x.xp)::bigint as pts
    from public.xp_daily x
    where (p_from is null or x.day >= p_from)
      and (p_group is null
           or x.user_id in (select m.user_id from public.group_members m where m.group_id = p_group))
    group by x.user_id
  ),
  counted as (
    select p.user_id, p.display_name, p.avatar, p.level, p.streak, a.pts
    from agg a join public.profiles p on p.user_id = a.user_id
    where a.pts > 0
    union
    select p.user_id, p.display_name, p.avatar, p.level, p.streak, coalesce(a.pts, 0)::bigint
    from public.profiles p left join agg a on a.user_id = p.user_id
    where p.user_id = uid
  ),
  ranked as (
    select c.*, rank() over (order by c.pts desc) as rnk, count(*) over () as cnt from counted c
  ),
  me as (
    select r.pts from ranked r where r.user_id = uid
  ),
  above as (
    select r.user_id from ranked r where r.pts > (select m.pts from me m) order by r.pts asc, r.display_name limit 1
  ),
  below as (
    select r.user_id from ranked r
    where r.pts < (select m.pts from me m) and r.user_id <> uid order by r.pts desc, r.display_name limit 1
  )
  select r.rnk, r.display_name, r.avatar, r.pts, r.level, r.streak,
         r.user_id = uid,
         r.user_id in (select a.user_id from above a),
         r.user_id in (select b.user_id from below b),
         r.cnt
  from ranked r
  where r.rnk <= greatest(1, least(p_limit, 100))
     or r.user_id = uid
     or r.user_id in (select a.user_id from above a)
     or r.user_id in (select b.user_id from below b)
  order by r.rnk, r.display_name;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Sync: tolerant timestamps, a storage quota per account, a reset counter
-- ---------------------------------------------------------------------------------------------
-- Casts text to timestamptz; null when it is not one (a cast error must not abort a whole batch). STABLE, not
-- IMMUTABLE: the result of a text -> timestamptz cast depends on the session's TimeZone.
create or replace function public.try_timestamptz(t text) returns timestamptz
language plpgsql stable as $$
begin
  return t::timestamptz;
exception when others then
  return null;
end $$;

-- Rows stored per account (inserted rows only; updates do not add). Written only by sync_push / sync_clear.
create table if not exists public.sync_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rows bigint not null default 0
);
alter table public.sync_usage enable row level security;
revoke all on public.sync_usage from anon, authenticated;
-- No policies: not readable through the API either.

-- Rows that exist before this migration count
insert into public.sync_usage (user_id, rows)
select s.user_id, count(*) from public.sync_rows s group by s.user_id
on conflict (user_id) do nothing;

-- Same merge rules as 0004 (progress first, then time; logs and events are only ever added), plus:
--   * rows with an unreadable ts are skipped, the rest of the batch is written
--   * a key repeated inside one batch would make ON CONFLICT fail the whole batch ("cannot affect row a second
--     time"): only the row that would win a sequential merge is kept
--   * storage quota 300,000 rows per account, checked against the batch size before anything is written
create or replace function public.sync_push(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
  added int;
  used bigint;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'batch must be an array of at most 1000 rows';
  end if;
  if jsonb_array_length(p_rows) = 0 then return 0; end if;

  -- Pushes of one account run one at a time, so two of them cannot both pass the quota
  perform pg_advisory_xact_lock(hashtext('sync_push:' || uid::text));
  select u.rows into used from public.sync_usage u where u.user_id = uid;
  if coalesce(used, 0) + jsonb_array_length(p_rows) > 300000 then
    raise exception 'storage quota exceeded' using errcode = 'P0001';
  end if;

  with src as (
    select distinct on (r ->> 'kind', r ->> 'key')
           r ->> 'kind' as kind, r ->> 'key' as key, r -> 'data' as data, s.t as ts,
           case when r ->> 'kind' in ('card', 'grammar', 'mistake') and (r -> 'data' ->> 'reps') ~ '^[0-9]{1,9}$'
                then (r -> 'data' ->> 'reps')::bigint else 0 end as prog
    from (select e as r, public.try_timestamptz(e ->> 'ts') as t from jsonb_array_elements(p_rows) e) s
    where s.t is not null
      and s.r ->> 'kind' in ('card', 'word', 'log', 'event', 'mistake', 'grammar', 'kv')
      and char_length(s.r ->> 'key') between 1 and 200
      and pg_column_size(s.r -> 'data') <= 20000
    order by r ->> 'kind', r ->> 'key', 5 desc, s.t desc
  ),
  w as (
    insert into public.sync_rows (user_id, kind, key, data, ts, prog, updated_at)
    select uid, src.kind, src.key, src.data, src.ts, src.prog, clock_timestamp() from src
    on conflict (user_id, kind, key) do update
      set data = excluded.data, ts = excluded.ts, prog = excluded.prog, updated_at = clock_timestamp()
      -- more progress wins; the later change breaks a tie (kinds without progress all have prog 0)
      where (excluded.prog, excluded.ts) > (public.sync_rows.prog, public.sync_rows.ts)
        and public.sync_rows.kind not in ('log', 'event')
    returning (xmax = 0) as inserted   -- xmax is 0 on a freshly inserted row, not on an updated one
  )
  select count(*), count(*) filter (where w.inserted) into n, added from w;

  if added > 0 then
    insert into public.sync_usage (user_id, rows) values (uid, added)
    on conflict (user_id) do update set rows = public.sync_usage.rows + excluded.rows;
  end if;
  return n;
end $$;

-- Reset counter: other devices compare it with the value they last saw and know the account was reset
alter table public.profiles add column if not exists sync_epoch int not null default 0;
-- (no grant: authenticated can read it through the select policy but only these functions change it)

-- "Reset all data": progress, XP and the storage count go, level and streak go back to start, the epoch moves on.
-- The 0004 trigger keeps levels from going down unless the flag below is set; the 0005 streak guard only acts when a
-- streak is raised, so 0 passes.
create or replace function public.sync_clear() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.sync_rows where user_id = auth.uid();
  delete from public.xp_daily where user_id = auth.uid();
  delete from public.sync_usage where user_id = auth.uid();
  perform set_config('myenglish.allow_level_reset', 'on', true);
  update public.profiles
  set level = 1, streak = 0, sync_epoch = sync_epoch + 1, updated_at = now()
  where user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: authenticated only; the name check is also open to anon (the sign-up form)
-- ---------------------------------------------------------------------------------------------
revoke execute on function public.profiles_normalise_name() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.display_name_available(text) from public;
grant execute on function public.display_name_available(text) to anon, authenticated;
revoke execute on function public.create_group(text) from public, anon;
grant execute on function public.create_group(text) to authenticated;
revoke execute on function public.leaderboard(date, date, uuid, text, int) from public, anon;
grant execute on function public.leaderboard(date, date, uuid, text, int) to authenticated;
revoke execute on function public.standing_board(date, uuid, int) from public, anon;
grant execute on function public.standing_board(date, uuid, int) to authenticated;
revoke execute on function public.try_timestamptz(text) from public, anon;
grant execute on function public.try_timestamptz(text) to authenticated;
revoke execute on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;
revoke execute on function public.sync_clear() from public, anon;
grant execute on function public.sync_clear() to authenticated;
