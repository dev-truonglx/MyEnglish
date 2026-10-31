-- MyEnglish: web push notifications for reminders while the browser tab is closed.
-- Run once in the SQL editor after 0001-0009.
--
-- The browser schedules reminder times and uploads the plan to push_plan.
-- An Edge Function cron reads pending reminders and sends Web Push notifications
-- using the user's stored subscriptions. The server never invents reminders.

-- ---------------------------------------------------------------------------------------------
-- push_subscriptions: Web Push subscription endpoints per user
-- ---------------------------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  last_ok_at timestamptz
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions for select
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- push_plan: scheduled reminder items uploaded by the browser
-- ---------------------------------------------------------------------------------------------
create table if not exists public.push_plan (
  user_id uuid not null references auth.users on delete cascade,
  at timestamptz not null,
  title text not null,
  body text not null,
  due int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  skipped text,
  primary key (user_id, at)
);

create index if not exists push_plan_pending_idx on public.push_plan (at)
  where sent_at is null and skipped is null;

alter table public.push_plan enable row level security;
drop policy if exists push_plan_select_own on public.push_plan;
create policy push_plan_select_own on public.push_plan for select
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- RPC: push_subscribe
-- ---------------------------------------------------------------------------------------------
create or replace function public.push_subscribe(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_ua text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_endpoint is null or not (p_endpoint like 'https://%') or char_length(p_endpoint) > 1000 then
    raise exception 'invalid endpoint';
  end if;

  if p_p256dh is null or char_length(p_p256dh) = 0 or char_length(p_p256dh) > 200 then
    raise exception 'invalid p256dh';
  end if;

  if p_auth is null or char_length(p_auth) = 0 or char_length(p_auth) > 200 then
    raise exception 'invalid auth';
  end if;

  if p_ua is not null and char_length(p_ua) > 300 then
    raise exception 'invalid user_agent';
  end if;

  -- Upsert: an endpoint moving to another account takes the new user_id
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent, created_at)
  values (p_endpoint, uid, p_p256dh, p_auth, p_ua, now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        created_at = excluded.created_at;

  -- At most 10 subscriptions per user (oldest removed)
  delete from public.push_subscriptions
  where user_id = uid
    and endpoint not in (
      select endpoint
      from public.push_subscriptions
      where user_id = uid
      order by created_at desc, endpoint desc
      limit 10
    );
end $$;

-- ---------------------------------------------------------------------------------------------
-- RPC: push_unsubscribe
-- ---------------------------------------------------------------------------------------------
create or replace function public.push_unsubscribe(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = uid;
end $$;

-- ---------------------------------------------------------------------------------------------
-- RPC: push_plan_set
-- ---------------------------------------------------------------------------------------------
create or replace function public.push_plan_set(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inserted_count int := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 12 then
    raise exception 'items must be an array of at most 12 elements';
  end if;

  -- Concurrent plan updates for one user run one at a time
  perform pg_advisory_xact_lock(hashtext('push_plan_set:' || uid::text));

  -- Delete caller rows older than 7 days
  delete from public.push_plan
  where user_id = uid and at < now() - interval '7 days';

  -- Delete caller's future unsent rows before replacing with the new plan
  delete from public.push_plan
  where user_id = uid and sent_at is null and at > now();

  if jsonb_array_length(p_items) = 0 then
    return 0;
  end if;

  insert into public.push_plan (user_id, at, title, body, due, created_at)
  select
    uid,
    (item ->> 'at')::timestamptz,
    (item ->> 'title'),
    coalesce(item ->> 'body', ''),
    coalesce((item ->> 'due')::int, 0),
    now()
  from jsonb_array_elements(p_items) as item
  where (item ->> 'at') is not null
    and (item ->> 'title') is not null
    and char_length(item ->> 'title') between 1 and 80
    and char_length(coalesce(item ->> 'body', '')) <= 200
    and (item ->> 'due' is null or ((item ->> 'due') ~ '^[0-9]+$' and (item ->> 'due')::int >= 0))
    and (item ->> 'at')::timestamptz between now() and (now() + interval '48 hours')
  on conflict (user_id, at) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: no direct mutations; authenticated may read own rows and execute RPCs
-- ---------------------------------------------------------------------------------------------
revoke all on public.push_subscriptions, public.push_plan from anon, authenticated;
grant select on public.push_subscriptions, public.push_plan to authenticated;

revoke execute on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

revoke execute on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_unsubscribe(text) to authenticated;

revoke execute on function public.push_plan_set(jsonb) from public, anon;
grant execute on function public.push_plan_set(jsonb) to authenticated;
