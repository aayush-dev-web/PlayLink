drop trigger if exists playlink_sports_validate_supported on public.playlink_sports;
drop function if exists public.validate_supported_playlink_sports();

create or replace function public.admin_delete_playlink_sport(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sport_row public.playlink_sports%rowtype;
begin
  if not coalesce((select public.is_playlink_admin()), false) then
    raise exception 'PlayLink admin access is required.' using errcode = '42501';
  end if;
  if p_slug is null or btrim(p_slug) = '' then
    raise exception 'Choose a sport to delete.' using errcode = '22023';
  end if;

  select * into sport_row
  from public.playlink_sports
  where slug = lower(btrim(p_slug));
  if not found then
    raise exception 'That sport could not be found.' using errcode = 'P0002';
  end if;

  if sport_row.is_game and (select count(*) from public.playlink_sports where is_game) <= 1 then
    raise exception 'At least one game sport must remain.' using errcode = '23514';
  end if;
  if (select count(*) from public.playlink_sports) <= 1 then
    raise exception 'At least one sport must remain.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(btrim(coalesce(preferred_sport, ''))) in (lower(sport_row.name), lower(sport_row.slug))
    union all
    select 1 from public.community_teams
    where lower(btrim(coalesce(sport, ''))) in (lower(sport_row.name), lower(sport_row.slug))
    union all
    select 1 from public.player_listings
    where lower(btrim(coalesce(sport, ''))) in (lower(sport_row.name), lower(sport_row.slug))
    union all
    select 1 from public.events
    where lower(btrim(coalesce(sport_type, ''))) in (lower(sport_row.name), lower(sport_row.slug))
    union all
    select 1 from public.owner_venues
    where lower(btrim(coalesce(sport, ''))) in (lower(sport_row.name), lower(sport_row.slug))
    union all
    select 1 from public.venue_bookings
    where lower(btrim(coalesce(sport, ''))) in (lower(sport_row.name), lower(sport_row.slug))
  ) then
    raise exception 'This sport is already used by profiles, games, venues, or bookings. Update those records before deleting it.'
      using errcode = '23503';
  end if;

  delete from public.playlink_sports where slug = sport_row.slug;
end;
$$;

revoke all on function public.admin_delete_playlink_sport(text) from public, anon;
grant execute on function public.admin_delete_playlink_sport(text) to authenticated;
