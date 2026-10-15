-- MyEnglish: "my standing" for the rank widgets (Today card, sidebar line, end-of-session delta).
-- Run once in the SQL editor after 0001_init.sql. One light call instead of loading a whole board:
-- the caller's rank, how many take part, their XP and the people just above and just below them.
--   p_from  : first day counted (local date chosen by the client, e.g. Monday); null = all time
--   p_group : null = everyone, else only that group (the caller must be a member)
-- Ties share a rank. Only people with XP in the period count, plus the caller.

create or replace function public.my_standing(p_from date default null, p_group uuid default null)
returns table (rank bigint, total bigint, xp bigint, above_name text, above_xp bigint, below_name text, below_xp bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_group is not null and not exists (select 1 from public.group_members where group_id = p_group and user_id = uid) then
    raise exception 'not a member of this group';
  end if;

  return query
  with scope as (
    select p.user_id, p.display_name
    from public.profiles p
    where p_group is null
       or exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p.user_id)
  ),
  scored as (
    select s.user_id, s.display_name,
           coalesce((select sum(x.xp) from public.xp_daily x
                     where x.user_id = s.user_id and (p_from is null or x.day >= p_from)), 0)::bigint as pts
    from scope s
  ),
  counted as (
    select * from scored where pts > 0 or user_id = uid
  ),
  me as (
    select pts from counted where user_id = uid
  )
  select
    (select count(*) from counted c where c.pts > (select pts from me)) + 1,
    (select count(*) from counted),
    (select pts from me),
    (select c.display_name from counted c where c.pts > (select pts from me) order by c.pts asc, c.display_name limit 1),
    (select c.pts from counted c where c.pts > (select pts from me) order by c.pts asc, c.display_name limit 1),
    (select c.display_name from counted c where c.pts < (select pts from me) and c.user_id <> uid order by c.pts desc, c.display_name limit 1),
    (select c.pts from counted c where c.pts < (select pts from me) and c.user_id <> uid order by c.pts desc, c.display_name limit 1)
  where exists (select 1 from me);
end $$;

revoke execute on function public.my_standing(date, uuid) from public, anon;
grant execute on function public.my_standing(date, uuid) to authenticated;
