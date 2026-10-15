-- MyEnglish: profile avatar (one of the app's preset avatars, stored as its short id, e.g. "fox-amber").
-- Run once in the SQL editor after 0001 and 0002. The leaderboard now returns each person's avatar too.

alter table public.profiles
  add column if not exists avatar text check (avatar ~ '^[a-z0-9-]{1,24}$');

-- Owners may change their own avatar (the update policy from 0001 limits rows; this limits columns)
grant update (avatar) on public.profiles to authenticated;

-- The returned columns change, so the function is replaced rather than altered
drop function if exists public.leaderboard(date, date, uuid, text, int);

create function public.leaderboard(
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
  with scope as (
    select p.user_id, p.display_name, p.avatar, p.level, p.streak
    from public.profiles p
    where p_group is null
       or exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p.user_id)
  ),
  scored as (
    select s.user_id, s.display_name, s.avatar, s.level, s.streak,
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
  select r.rnk, r.display_name, r.avatar, r.xp, r.level, r.streak, r.user_id = uid
  from ranked r
  where r.rnk <= greatest(1, least(p_limit, 100)) or r.user_id = uid
  order by r.rnk, r.display_name;
end $$;

revoke execute on function public.leaderboard(date, date, uuid, text, int) from public, anon;
grant execute on function public.leaderboard(date, date, uuid, text, int) to authenticated;
