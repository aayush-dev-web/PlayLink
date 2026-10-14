alter table public.playlink_sports
  add column if not exists is_game boolean not null default true;

insert into public.playlink_sports (name, slug, is_game)
values ('Football', 'football', true), ('Cricket', 'cricket', true), ('Futsal', 'futsal', false)
on conflict (name) do update set
  slug = excluded.slug,
  is_game = excluded.is_game;

update public.profiles
set preferred_sport = 'Football'
where lower(preferred_sport) = 'futsal';

update public.community_teams set sport = 'Football' where lower(sport) = 'futsal';
update public.player_listings set sport = 'Football' where lower(sport) = 'futsal';
update public.events set sport_type = 'football' where lower(sport_type) = 'futsal';

update auth.users
set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{preferred_sport}', '"Football"'::jsonb)
where lower(coalesce(raw_user_meta_data ->> 'preferred_sport', '')) = 'futsal';

update public.playlink_sports
set is_game = false
where name = 'Futsal';

delete from public.playlink_sports
where name not in ('Football', 'Futsal', 'Cricket');

create or replace function public.is_playlink_game(requested_sport text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.playlink_sports
    where is_game
      and (
        lower(name) = lower(trim(requested_sport))
        or slug = lower(trim(requested_sport))
      )
  );
$$;

revoke all on function public.is_playlink_game(text) from public, anon;
grant execute on function public.is_playlink_game(text) to authenticated;

create or replace function public.validate_playlink_sport_field()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_sport text := to_jsonb(new) ->> tg_argv[0];
  game_only boolean := tg_table_name in ('profiles', 'community_teams', 'player_listings', 'events');
begin
  if requested_sport = '' and tg_table_name = 'profiles' then
    return new;
  end if;
  if requested_sport = 'Both' and tg_table_name in ('profiles', 'owner_venues') then
    return new;
  end if;
  if (game_only and not public.is_playlink_game(requested_sport))
    or (not game_only and not public.is_playlink_sport(requested_sport)) then
    raise exception 'Unsupported PlayLink sport: %', requested_sport
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.validate_supported_playlink_sports()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (
    (new.name = 'Football' and new.slug = 'football' and new.is_game)
    or (new.name = 'Cricket' and new.slug = 'cricket' and new.is_game)
    or (new.name = 'Futsal' and new.slug = 'futsal' and not new.is_game)
  ) then
    raise exception 'Only Football, Cricket, and venue-only Futsal are supported.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists playlink_sports_validate_supported on public.playlink_sports;
create trigger playlink_sports_validate_supported
  before insert or update on public.playlink_sports
  for each row execute function public.validate_supported_playlink_sports();

drop function if exists public.get_admin_user_profiles();

create function public.get_admin_user_profiles()
returns table (
  id uuid,
  email text,
  username text,
  display_name text,
  phone text,
  account_type text,
  created_at timestamptz,
  avatar_url text,
  bio text,
  preferred_sport text,
  player_position text,
  skill_level text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  home_location text,
  home_latitude double precision,
  home_longitude double precision,
  banned_until text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, account.email, p.username, p.display_name, p.phone,
    p.account_type, p.created_at, p.avatar_url, p.bio, p.preferred_sport,
    p.player_position, p.skill_level, p.instagram_url, p.facebook_url,
    p.tiktok_url, p.home_location, p.home_latitude, p.home_longitude,
    account.banned_until
  from public.profiles p
  join auth.users account on account.id = p.id
  where (select public.is_playlink_admin())
    and not exists (
      select 1 from public.playlink_admins admin_account
      where admin_account.user_id = p.id
    )
  order by p.created_at desc;
$$;

revoke all on function public.get_admin_user_profiles() from public, anon;
grant execute on function public.get_admin_user_profiles() to authenticated;
