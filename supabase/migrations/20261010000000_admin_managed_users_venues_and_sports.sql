create table if not exists public.playlink_sports (
  name text primary key check (char_length(btrim(name)) between 2 and 40),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

insert into public.playlink_sports (name, slug)
values ('Futsal', 'futsal'), ('Cricket', 'cricket')
on conflict do nothing;

alter table public.playlink_sports enable row level security;
revoke all on public.playlink_sports from anon, authenticated;
grant select on public.playlink_sports to anon, authenticated;
grant insert on public.playlink_sports to authenticated;

drop policy if exists "Anyone can read PlayLink sports" on public.playlink_sports;
create policy "Anyone can read PlayLink sports"
  on public.playlink_sports for select to anon, authenticated
  using (true);

drop policy if exists "PlayLink admins can add sports" on public.playlink_sports;
create policy "PlayLink admins can add sports"
  on public.playlink_sports for insert to authenticated
  with check ((select public.is_playlink_admin()));

drop policy if exists "PlayLink admins can create venues" on public.owner_venues;
create policy "PlayLink admins can create venues"
  on public.owner_venues for insert to authenticated
  with check ((select public.is_playlink_admin()));

drop policy if exists "PlayLink admins can upload venue photos" on storage.objects;
create policy "PlayLink admins can upload venue photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'playlink-venue-photos'
    and (storage.foldername(name))[2] = 'venues'
    and (select public.is_playlink_admin())
  );

drop policy if exists "PlayLink admins can update venue photos" on storage.objects;
create policy "PlayLink admins can update venue photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'playlink-venue-photos'
    and (storage.foldername(name))[2] = 'venues'
    and (select public.is_playlink_admin())
  )
  with check (
    bucket_id = 'playlink-venue-photos'
    and (storage.foldername(name))[2] = 'venues'
    and (select public.is_playlink_admin())
  );

drop policy if exists "Team organizers manage their own teams" on public.community_teams;
create policy "PlayLink members manage their own teams"
  on public.community_teams for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and account_type in ('player', 'venue_owner', 'team_organizer')
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and account_type in ('player', 'venue_owner', 'team_organizer')
    )
  );

create or replace function public.is_playlink_sport(requested_sport text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.playlink_sports
    where lower(name) = lower(trim(requested_sport))
       or slug = lower(trim(requested_sport))
  );
$$;

revoke all on function public.is_playlink_sport(text) from public, anon;
grant execute on function public.is_playlink_sport(text) to authenticated;

create or replace function public.playlink_sport_slug(requested_sport text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select slug
  from public.playlink_sports
  where lower(name) = lower(trim(requested_sport))
     or slug = lower(trim(requested_sport))
  limit 1;
$$;

revoke all on function public.playlink_sport_slug(text) from public, anon;
grant execute on function public.playlink_sport_slug(text) to authenticated;

create or replace function public.create_owner_venue_from_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  venue_data jsonb;
  venue_name text;
  venue_area text;
  venue_sport text;
  venue_price numeric(10, 2);
  venue_latitude numeric;
  venue_longitude numeric;
begin
  if new.raw_user_meta_data ->> 'account_type' <> 'venue_owner' then
    return new;
  end if;

  venue_data := new.raw_user_meta_data -> 'owner_venue';
  venue_name := trim(coalesce(venue_data ->> 'name', ''));
  venue_area := trim(coalesce(venue_data ->> 'area', ''));
  venue_sport := coalesce(venue_data ->> 'sport', 'Futsal');

  if char_length(venue_name) not between 2 and 120
    or char_length(venue_area) not between 2 and 160 then
    raise exception 'Venue owner registration requires a valid venue name and district or area.'
      using errcode = 'check_violation';
  end if;
  if venue_sport <> 'Both' and not public.is_playlink_sport(venue_sport) then
    raise exception 'Venue owner registration requires a supported sport.'
      using errcode = 'check_violation';
  end if;

  if coalesce(venue_data ->> 'price_per_hour', '') ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
    venue_price := (venue_data ->> 'price_per_hour')::numeric;
  else
    venue_price := 0;
  end if;

  if coalesce(venue_data ->> 'latitude', '') ~ '^-?[0-9]{1,3}(\.[0-9]{1,8})?$'
    and coalesce(venue_data ->> 'longitude', '') ~ '^-?[0-9]{1,3}(\.[0-9]{1,8})?$' then
    venue_latitude := (venue_data ->> 'latitude')::numeric;
    venue_longitude := (venue_data ->> 'longitude')::numeric;
    if venue_latitude not between -90 and 90 or venue_longitude not between -180 and 180 then
      venue_latitude := null;
      venue_longitude := null;
    end if;
  end if;

  insert into public.owner_venues (
    owner_id, name, sport, area, address, description, price_per_hour,
    image_url, maps_url, latitude, longitude, is_active
  ) values (
    new.id,
    venue_name,
    venue_sport,
    venue_area,
    left(coalesce(venue_data ->> 'address', ''), 240),
    left(coalesce(venue_data ->> 'description', ''), 1000),
    venue_price,
    left(coalesce(venue_data ->> 'image_url', ''), 2048),
    left(coalesce(venue_data ->> 'maps_url', ''), 2048),
    venue_latitude,
    venue_longitude,
    case when venue_data ->> 'is_active' = 'false' then false else true end
  );

  return new;
end;
$$;

revoke all on function public.create_owner_venue_from_signup() from public, anon, authenticated;

create or replace function public.validate_playlink_sport_field()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_sport text := to_jsonb(new) ->> tg_argv[0];
begin
  if requested_sport = '' and tg_table_name = 'profiles' then
    return new;
  end if;
  if requested_sport = 'Both' and tg_table_name in ('profiles', 'owner_venues') then
    return new;
  end if;
  if not public.is_playlink_sport(requested_sport) then
    raise exception 'Unsupported PlayLink sport: %', requested_sport
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_playlink_sport_field() from public, anon, authenticated;

create or replace function public.get_admin_user_profiles()
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
  home_longitude double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, account.email, p.username, p.display_name, p.phone,
    p.account_type, p.created_at, p.avatar_url, p.bio, p.preferred_sport,
    p.player_position, p.skill_level, p.instagram_url, p.facebook_url,
    p.tiktok_url, p.home_location, p.home_latitude, p.home_longitude
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

alter table public.profiles drop constraint if exists profiles_preferred_sport_check;
alter table public.owner_venues drop constraint if exists owner_venues_sport_check;
alter table public.venue_bookings drop constraint if exists venue_bookings_sport_check;
alter table public.player_listings drop constraint if exists player_listings_sport_check;
alter table public.community_teams drop constraint if exists community_teams_sport_check;
alter table public.events drop constraint if exists events_sport_type_check;

drop trigger if exists profiles_validate_sport on public.profiles;
create trigger profiles_validate_sport
  before insert or update of preferred_sport on public.profiles
  for each row execute function public.validate_playlink_sport_field('preferred_sport');

create or replace function public.handle_new_playlink_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  requested_type text;
  requested_sport text;
  google_signup boolean;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  requested_type := new.raw_user_meta_data ->> 'account_type';
  requested_sport := coalesce(new.raw_user_meta_data ->> 'preferred_sport', '');
  google_signup := new.raw_app_meta_data ->> 'provider' = 'google'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google';

  if requested_username !~ '^[a-zA-Z0-9_]{3,24}$' then
    requested_username := 'player_' || substr(replace(new.id::text, '-', ''), 1, 17);
  end if;
  if requested_type is null or requested_type not in ('player', 'team_organizer', 'venue_owner') then
    requested_type := 'player';
  end if;

  insert into public.profiles (
    id, username, display_name, phone, account_type, onboarding_completed, preferred_sport
  ) values (
    new.id,
    requested_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    requested_type,
    not google_signup,
    requested_sport
  );
  return new;
end;
$$;

revoke all on function public.handle_new_playlink_user() from public, anon, authenticated;

drop trigger if exists owner_venues_validate_sport on public.owner_venues;
create trigger owner_venues_validate_sport
  before insert or update of sport on public.owner_venues
  for each row execute function public.validate_playlink_sport_field('sport');

drop trigger if exists venue_bookings_validate_sport on public.venue_bookings;
create trigger venue_bookings_validate_sport
  before insert or update of sport on public.venue_bookings
  for each row execute function public.validate_playlink_sport_field('sport');

drop trigger if exists player_listings_validate_sport on public.player_listings;
create trigger player_listings_validate_sport
  before insert or update of sport on public.player_listings
  for each row execute function public.validate_playlink_sport_field('sport');

drop trigger if exists community_teams_validate_sport on public.community_teams;
create trigger community_teams_validate_sport
  before insert or update of sport on public.community_teams
  for each row execute function public.validate_playlink_sport_field('sport');

drop trigger if exists events_validate_sport on public.events;
create trigger events_validate_sport
  before insert or update of sport_type on public.events
  for each row execute function public.validate_playlink_sport_field('sport_type');

create or replace function public.create_playlink_event(
  p_title text, p_sport_type text, p_description text, p_location_text text,
  p_start_time timestamptz, p_end_time timestamptz, p_max_teams integer,
  p_organizer_team_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_event_id uuid;
  event_sport text;
begin
  if actor_id is null or not public.can_manage_playlink_events(actor_id) then
    raise exception using errcode = 'P0001', message = 'organizer_role_required';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 100
    or char_length(coalesce(p_description, '')) > 3000
    or not public.is_playlink_sport(p_sport_type)
    or char_length(btrim(coalesce(p_location_text, ''))) not between 2 and 180
    or p_start_time <= now() or p_end_time <= p_start_time
    or p_max_teams not between 1 and 64
    or char_length(btrim(coalesce(p_organizer_team_name, ''))) > 80 then
    raise exception using errcode = 'P0001', message = 'invalid_event_details';
  end if;
  event_sport := public.playlink_sport_slug(p_sport_type);
  insert into public.events (
    organizer_id, title, sport_type, description, location_text,
    start_time, end_time, max_teams, status
  ) values (
    actor_id, btrim(p_title), event_sport, coalesce(p_description, ''),
    btrim(p_location_text), p_start_time, p_end_time, p_max_teams, 'open'
  ) returning id into new_event_id;

  if nullif(btrim(p_organizer_team_name), '') is not null then
    insert into public.event_teams (event_id, team_name, team_owner_id)
    values (new_event_id, btrim(p_organizer_team_name), actor_id);
  end if;
  return new_event_id;
end;
$$;

create or replace function public.update_playlink_event(
  p_event_id uuid, p_title text, p_sport_type text, p_description text,
  p_location_text text, p_start_time timestamptz, p_end_time timestamptz,
  p_max_teams integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  event_row public.events%rowtype;
  active_count integer;
  event_sport text;
begin
  select * into event_row from public.events where id = p_event_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'event_not_found'; end if;
  if event_row.organizer_id <> actor_id then
    raise exception using errcode = 'P0001', message = 'not_event_organizer';
  end if;
  if event_row.status not in ('open', 'full') or event_row.start_time <= now() then
    raise exception using errcode = 'P0001', message = 'event_not_editable';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 100
    or char_length(coalesce(p_description, '')) > 3000
    or not public.is_playlink_sport(p_sport_type)
    or char_length(btrim(coalesce(p_location_text, ''))) not between 2 and 180
    or p_start_time <= now() or p_end_time <= p_start_time
    or p_max_teams not between 1 and 64 then
    raise exception using errcode = 'P0001', message = 'invalid_event_details';
  end if;
  event_sport := public.playlink_sport_slug(p_sport_type);
  select count(*)::integer into active_count from public.event_teams
    where event_id = p_event_id and participation_status = 'active';
  if p_max_teams < active_count then
    raise exception using errcode = 'P0001', message = 'capacity_below_participants';
  end if;
  update public.events set title = btrim(p_title), sport_type = event_sport,
    description = coalesce(p_description, ''), location_text = btrim(p_location_text),
    start_time = p_start_time, end_time = p_end_time, max_teams = p_max_teams,
    status = case when active_count >= p_max_teams then 'full' else 'open' end
  where id = p_event_id;
end;
$$;

revoke all on function public.create_playlink_event(text, text, text, text, timestamptz, timestamptz, integer, text) from public, anon;
grant execute on function public.create_playlink_event(text, text, text, text, timestamptz, timestamptz, integer, text) to authenticated;
revoke all on function public.update_playlink_event(uuid, text, text, text, text, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.update_playlink_event(uuid, text, text, text, text, timestamptz, timestamptz, integer) to authenticated;
