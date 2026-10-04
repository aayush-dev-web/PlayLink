alter table public.community_teams
  add column if not exists available_days text[] not null default '{}';

create or replace function public.search_players_for_team_invite(search_query text)
returns table (user_id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with normalized_query as (
    select lower(trim(both '@' from btrim(coalesce(search_query, '')))) as username_query,
      lower(btrim(coalesce(search_query, ''))) as name_query
  )
  select listing.user_id, profile.username, listing.display_name
  from public.player_listings listing
  join public.profiles profile on profile.id = listing.user_id
  cross join normalized_query query
  where (select auth.uid()) is not null
    and listing.is_active
    and listing.user_id <> (select auth.uid())
    and length(query.username_query) >= 2
    and (
      strpos(lower(profile.username), query.username_query) > 0
      or strpos(lower(listing.display_name), query.name_query) > 0
    )
  order by
    case when lower(profile.username) = query.username_query then 0 else 1 end,
    profile.username
  limit 10;
$$;

revoke all on function public.search_players_for_team_invite(text) from public, anon;
grant execute on function public.search_players_for_team_invite(text) to authenticated;
