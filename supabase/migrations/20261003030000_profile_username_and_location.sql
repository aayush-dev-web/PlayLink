grant update (
  username,
  display_name,
  avatar_url,
  bio,
  preferred_sport,
  player_position,
  skill_level,
  instagram_url,
  facebook_url,
  tiktok_url,
  home_location,
  home_latitude,
  home_longitude
) on public.profiles to authenticated;

update public.profiles
set username = lower(username)
where username <> lower(username);

create or replace function public.is_profile_username_available(requested_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and requested_username ~ '^[a-zA-Z0-9_]{3,24}$'
    and not exists (
      select 1
      from public.profiles p
      where lower(p.username) = lower(requested_username)
        and p.id <> (select auth.uid())
    );
$$;

revoke all on function public.is_profile_username_available(text) from public, anon;
grant execute on function public.is_profile_username_available(text) to authenticated;

create or replace function public.suggest_profile_usernames(requested_username text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select coalesce(
      nullif(trim(both '_' from regexp_replace(lower(coalesce(requested_username, '')), '[^a-z0-9_]', '', 'g')), ''),
      'player'
    ) as base_name
  ),
  candidates as (
    select left(input.base_name, 21) || '_' || lpad(sequence.value::text, 2, '0') as username
    from input
    cross join generate_series(1, 12) as sequence(value)
  )
  select coalesce(array_agg(candidates.username order by candidates.username), array[]::text[])
  from candidates
  where not exists (
    select 1
    from public.profiles p
    where lower(p.username) = lower(candidates.username)
      and (
        (select auth.uid()) is null
        or p.id <> (select auth.uid())
      )
  );
$$;

revoke all on function public.suggest_profile_usernames(text) from public;
grant execute on function public.suggest_profile_usernames(text) to anon, authenticated;
