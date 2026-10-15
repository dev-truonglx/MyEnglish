-- MyEnglish: accounts, progress sync and XP leaderboard.
-- Run once in the Supabase SQL editor (or `supabase db push`). Idempotent where cheap, but meant for a fresh project.
--
-- Security model: every table has RLS on. Users can only SELECT their own rows; every write and every
-- cross-user read (leaderboard, groups) goes through a SECURITY DEFINER function that checks auth.uid().
-- XP is reported by the client ("casual" ranking): the database only caps it, it cannot prove it.

-- ---------------------------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 3 and 20),
  level int not null default 1 check (level between 1 and 1000),
  streak int not null default 0 check (streak between 0 and 100000),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_display_name_ci on public.profiles (lower(display_name));

alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = user_id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No insert/delete policy: the row is created by the trigger below and removed with the auth user.
revoke update on public.profiles from authenticated;
grant update (display_name, level, streak, updated_at) on public.profiles to authenticated;

-- A profile is created with the account. The name comes from the sign-up metadata; when it is invalid or taken
-- (the app checks display_name_available first, this is the safety net) a unique fallback is used.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if char_length(wanted) not between 3 and 20
     or exists (select 1 from public.profiles where lower(display_name) = lower(wanted)) then
    wanted := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (user_id, display_name) values (new.id, wanted);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.display_name_available(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select char_length(btrim(p_name)) between 3 and 20
     and not exists (select 1 from public.profiles where lower(display_name) = lower(btrim(p_name)));
$$;

-- ---------------------------------------------------------------------------------------------
-- Progress sync: one generic table, merged by the client
-- ---------------------------------------------------------------------------------------------
create table if not exists public.sync_rows (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  key text not null,
  data jsonb not null,
  -- time of the change on the device (last review, last attempt...): last write wins
  ts timestamptz not null,
  -- server time of the write: the pull cursor
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, key)
);
create index if not exists sync_rows_cursor on public.sync_rows (user_id, updated_at);

alter table public.sync_rows enable row level security;
drop policy if exists sync_rows_select_own on public.sync_rows;
create policy sync_rows_select_own on public.sync_rows for select using (auth.uid() = user_id);

-- Push a batch: [{kind, key, data, ts}]. Last write wins on ts; kinds that are append-only (log, event) never
-- overwrite. Returns the number of rows written.
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

  insert into public.sync_rows (user_id, kind, key, data, ts, updated_at)
  select uid, r ->> 'kind', r ->> 'key', r -> 'data', (r ->> 'ts')::timestamptz, clock_timestamp()
  from jsonb_array_elements(p_rows) r
  where r ->> 'kind' in ('card', 'word', 'log', 'event', 'mistake', 'grammar', 'kv')
    and char_length(r ->> 'key') between 1 and 200
    and pg_column_size(r -> 'data') <= 20000
  on conflict (user_id, kind, key) do update
    set data = excluded.data, ts = excluded.ts, updated_at = clock_timestamp()
    where public.sync_rows.ts < excluded.ts and public.sync_rows.kind not in ('log', 'event');
  get diagnostics n = row_count;
  return n;
end $$;

-- Deletes the caller's synced progress and XP (used by "reset all data" in the app). The account and profile stay.
create or replace function public.sync_clear() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.sync_rows where user_id = auth.uid();
  delete from public.xp_daily where user_id = auth.uid();
  update public.profiles set level = 1, streak = 0, updated_at = now() where user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------------------------
-- XP ledger: what each device earned each day. A user's XP is the sum over devices, so two machines used on
-- the same day do not overwrite each other. Day 0001-01-01 holds the XP a device had before the first sync.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.xp_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 64),
  day date not null,
  xp int not null check (xp >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, day)
);
create index if not exists xp_daily_day on public.xp_daily (day);

alter table public.xp_daily enable row level security;
drop policy if exists xp_daily_select_own on public.xp_daily;
create policy xp_daily_select_own on public.xp_daily for select using (auth.uid() = user_id);

-- Push [{device_id, day, xp}]. A day's XP only grows; it is capped per device and day. The opening balance
-- (day 0001-01-01) is written once.
create or replace function public.xp_push(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'batch must be an array of at most 2000 rows';
  end if;

  insert into public.xp_daily (user_id, device_id, day, xp, updated_at)
  select uid, r ->> 'device_id', d, greatest(0, least((r ->> 'xp')::int, case when d = date '0001-01-01' then 1000000 else 5000 end)), now()
  from (select r, (r ->> 'day')::date as d from jsonb_array_elements(p_rows) r) s(r, d)
  where char_length(r ->> 'device_id') between 8 and 64
    and (d = date '0001-01-01' or (d >= date '2020-01-01' and d <= current_date + 1))
  on conflict (user_id, device_id, day) do update
    set xp = greatest(public.xp_daily.xp, excluded.xp), updated_at = now()
    where public.xp_daily.day <> date '0001-01-01' and excluded.xp > public.xp_daily.xp;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Groups (friends racing each other with an invite code)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 30),
  invite_code text not null unique,
  owner uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on public.group_members (user_id);
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
-- No policies: groups are only reached through the functions below.

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
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.groups g where g.invite_code = code);
  end loop;
  insert into public.groups (name, invite_code, owner) values (btrim(p_name), code, uid) returning groups.id into gid;
  insert into public.group_members (group_id, user_id) values (gid, uid);
  return query select gid, btrim(p_name), code;
end $$;

create or replace function public.join_group(p_code text) returns table (id uuid, name text, invite_code text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.groups;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into g from public.groups where public.groups.invite_code = upper(btrim(p_code));
  if not found then raise exception 'invalid invite code'; end if;
  if (select count(*) from public.group_members where user_id = uid) >= 10 then
    raise exception 'you are in too many groups (max 10)';
  end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 200 then
    raise exception 'this group is full';
  end if;
  insert into public.group_members (group_id, user_id) values (g.id, uid) on conflict do nothing;
  return query select g.id, g.name, g.invite_code;
end $$;

create or replace function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
  -- an empty group is not kept
  delete from public.groups g where g.id = p_group and not exists (select 1 from public.group_members m where m.group_id = g.id);
end $$;

create or replace function public.my_groups() returns table (id uuid, name text, invite_code text, member_count bigint, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.invite_code,
         (select count(*) from public.group_members m where m.group_id = g.id),
         g.owner = auth.uid()
  from public.groups g
  join public.group_members me on me.group_id = g.id and me.user_id = auth.uid()
  order by g.created_at;
$$;

-- ---------------------------------------------------------------------------------------------
-- Leaderboard
--   p_from / p_to : local-date bounds chosen by the client (week starts on Monday). Null p_from = all time
--                   (includes opening balances).
--   p_group       : null = everyone, else only that group (the caller must be a member).
--   p_by          : 'xp' or 'streak'.
-- Returns the top p_limit plus the caller's own row when outside it.
-- ---------------------------------------------------------------------------------------------
create or replace function public.leaderboard(
  p_from date default null, p_to date default null, p_group uuid default null,
  p_by text default 'xp', p_limit int default 50
) returns table (rank bigint, display_name text, xp bigint, level int, streak int, is_me boolean)
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
  with scope as (
    select p.user_id, p.display_name, p.level, p.streak
    from public.profiles p
    where p_group is null
       or exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p.user_id)
  ),
  scored as (
    select s.user_id, s.display_name, s.level, s.streak,
           coalesce((select sum(x.xp) from public.xp_daily x
                     where x.user_id = s.user_id
                       and (p_from is null or x.day >= p_from)
                       and (p_to is null or x.day <= p_to)), 0)::bigint as xp
    from scope s
  ),
  ranked as (
    select rank() over (order by (case when p_by = 'streak' then sc.streak::bigint else sc.xp end) desc) as rnk, sc.*
    from scored sc
    where (case when p_by = 'streak' then sc.streak::bigint else sc.xp end) > 0 or sc.user_id = uid
  )
  select r.rnk, r.display_name, r.xp, r.level, r.streak, r.user_id = uid
  from ranked r
  where r.rnk <= greatest(1, least(p_limit, 100)) or r.user_id = uid
  order by r.rnk, r.display_name;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: nothing is callable by everybody except the name check used on the sign-up form
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.display_name_available(text) to anon, authenticated;
grant execute on function public.sync_push(jsonb), public.xp_push(jsonb), public.sync_clear(),
  public.create_group(text), public.join_group(text), public.leave_group(uuid), public.my_groups(),
  public.leaderboard(date, date, uuid, text, int) to authenticated;
