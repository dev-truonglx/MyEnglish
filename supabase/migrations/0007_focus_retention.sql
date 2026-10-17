-- MyEnglish: focus session and return-rate reports over every account. Run once in the SQL editor after 0001-0006.
--
-- Nothing new is pushed by the app: the study-day log (kv "myenglish_study_logs_v1", local dates) and the focus
-- session events (kind "event", type focus_started / focus_completed / focus_abandoned, meta.day = local date)
-- already travel with sync. These functions only read them. They are not callable from the app (no grant to
-- anon / authenticated): run them in the SQL editor, e.g.
--
--   select * from public.focus_retention_report(30);
--   select * from public.focus_session_report(30);
--
-- Only accounts that signed in and synced are counted.

create or replace function public.try_date(t text) returns date
language plpgsql immutable as $$
begin
  return t::date;
exception when others then
  return null;
end $$;

create or replace function public.try_jsonb(t text) returns jsonb
language plpgsql immutable as $$
begin
  return t::jsonb;
exception when others then
  return null;
end $$;

-- The focus events of every account, meta parsed (the app stores it as a JSON string)
create or replace function public.focus_events(p_since timestamptz)
returns table (user_id uuid, type text, at timestamptz, meta jsonb)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.data ->> 'type', public.try_timestamptz(s.data ->> 'at'),
    case jsonb_typeof(s.data -> 'meta')
      when 'object' then s.data -> 'meta'
      when 'string' then public.try_jsonb(s.data ->> 'meta')
    end
  from public.sync_rows s
  where s.kind = 'event'
    and s.data ->> 'type' in ('focus_started', 'focus_completed', 'focus_abandoned')
    and coalesce(public.try_timestamptz(s.data ->> 'at'), 'infinity') >= p_since
$$;

-- D1 / D7: of the study days in the window, the share followed by a study day the next day / a week later.
-- Segments: all days, days with a completed focus session, days without. Dates are the learners' local dates; a
-- day is judged only once the day it looks at is over in every time zone (two days of margin).
create or replace function public.focus_retention_report(p_days int default 30)
returns table (metric text, segment text, users bigint, days bigint, returned bigint, rate numeric)
language sql stable security definer set search_path = public as $$
  with study as (
    select s.user_id, public.try_date(kv.key) as day
    from public.sync_rows s
    cross join lateral jsonb_each_text(
      case when jsonb_typeof(public.try_jsonb(s.data ->> 'v')) = 'object' then public.try_jsonb(s.data ->> 'v') else '{}'::jsonb end
    ) kv
    where s.kind = 'kv' and s.key = 'myenglish_study_logs_v1' and kv.value ~ '^[0-9]+$' and kv.value::bigint > 0
  ),
  study_days as (select distinct user_id, day from study where day is not null),
  focus_days as (
    select distinct e.user_id, coalesce(public.try_date(e.meta ->> 'day'), (e.at at time zone 'UTC')::date) as day
    from public.focus_events(now() - make_interval(days => p_days + 10)) e
    where e.type = 'focus_completed'
  ),
  judged as (
    select d.user_id, d.day,
      exists (select 1 from focus_days f where f.user_id = d.user_id and f.day = d.day) as focus,
      exists (select 1 from study_days n where n.user_id = d.user_id and n.day = d.day + 1) as back1,
      exists (select 1 from study_days n where n.user_id = d.user_id and n.day = d.day + 7) as back7
    from study_days d
    where d.day >= current_date - 2 - p_days and d.day < current_date - 2
  ),
  judged_rows as (
    select 'D1'::text as metric, j.user_id, j.focus, j.back1 as back from judged j where j.day + 1 <= current_date - 2
    union all
    select 'D7'::text, j.user_id, j.focus, j.back7 from judged j where j.day + 7 <= current_date - 2
  )
  select r.metric, seg.segment, count(distinct r.user_id), count(*), count(*) filter (where r.back),
    round(avg(r.back::int)::numeric, 3)
  from judged_rows r
  cross join lateral (values ('all'), (case when r.focus then 'focus_day' else 'no_focus_day' end)) seg(segment)
  group by r.metric, seg.segment
  order by r.metric, seg.segment
$$;

-- Focus sessions started in the window, per planned length and in all (planned_min null): how many finished, the
-- active minutes and cards of the finished ones, first-try rate, XP given. A start with no end (app quit) is
-- abandoned.
create or replace function public.focus_session_report(p_days int default 30)
returns table (
  planned_min int, users bigint, sessions bigint, completed bigint, abandoned bigint, completion_rate numeric,
  avg_active_min numeric, avg_cards numeric, first_try_rate numeric, xp_awarded bigint
)
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.user_id, e.type, e.meta ->> 'id' as id, e.meta
    from public.focus_events(now() - make_interval(days => p_days)) e
    where e.meta ->> 'id' is not null
  ),
  num as (
    select ev.*,
      case when ev.meta ->> 'plannedMin' ~ '^[0-9]+$' then (ev.meta ->> 'plannedMin')::int end as planned,
      case when ev.meta ->> 'activeSec' ~ '^[0-9.]+$' then (ev.meta ->> 'activeSec')::numeric end as active_sec,
      case when ev.meta ->> 'cards' ~ '^[0-9]+$' then (ev.meta ->> 'cards')::int end as cards,
      case when ev.meta ->> 'firstTry' ~ '^[0-9]+$' then (ev.meta ->> 'firstTry')::int end as first_try,
      case when ev.meta ->> 'xp' ~ '^[0-9]+$' then (ev.meta ->> 'xp')::int end as xp
    from ev
  ),
  sessions as (
    select n.user_id, n.id, max(n.planned) as planned,
      bool_or(n.type = 'focus_completed') as done,
      max(n.active_sec) filter (where n.type = 'focus_completed') as active_sec,
      max(n.cards) filter (where n.type = 'focus_completed') as cards,
      max(n.first_try) filter (where n.type = 'focus_completed') as first_try,
      coalesce(max(n.xp) filter (where n.type = 'focus_completed'), 0) as xp
    from num n
    group by n.user_id, n.id
  )
  select s.planned, count(distinct s.user_id), count(*), count(*) filter (where s.done), count(*) filter (where not s.done),
    round(avg(s.done::int)::numeric, 3),
    round(avg(s.active_sec) / 60, 1),
    round(avg(s.cards), 1),
    round(sum(s.first_try)::numeric / nullif(sum(s.cards), 0), 3),
    sum(s.xp)::bigint
  from sessions s
  group by grouping sets ((s.planned), ())
  order by s.planned nulls last
$$;

revoke execute on function public.focus_events(timestamptz) from public, anon, authenticated;
revoke execute on function public.focus_retention_report(int) from public, anon, authenticated;
revoke execute on function public.focus_session_report(int) from public, anon, authenticated;
grant execute on function public.focus_events(timestamptz) to service_role;
grant execute on function public.focus_retention_report(int) to service_role;
grant execute on function public.focus_session_report(int) to service_role;
