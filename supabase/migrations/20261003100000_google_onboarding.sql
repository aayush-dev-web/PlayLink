alter table public.profiles
  add column if not exists onboarding_completed boolean not null default true;

update public.profiles p
set onboarding_completed = false
from auth.users u
where u.id = p.id
  and (
    u.raw_app_meta_data ->> 'provider' = 'google'
    or coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
  )
  and p.username = 'player_' || substr(replace(p.id::text, '-', ''), 1, 17);

create or replace function public.handle_new_playlink_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  requested_type text;
  google_signup boolean;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  requested_type := new.raw_user_meta_data ->> 'account_type';
  google_signup := new.raw_app_meta_data ->> 'provider' = 'google'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google';

  if requested_username !~ '^[a-zA-Z0-9_]{3,24}$' then
    requested_username := 'player_' || substr(replace(new.id::text, '-', ''), 1, 17);
  end if;

  if requested_type is null or requested_type not in ('player', 'team_organizer', 'venue_owner') then
    requested_type := 'player';
  end if;

  insert into public.profiles (
    id, username, display_name, phone, account_type, onboarding_completed
  )
  values (
    new.id,
    requested_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    requested_type,
    not google_signup
  );
  return new;
end;
$$;

create or replace function public.complete_google_profile(
  requested_username text,
  requested_display_name text,
  requested_phone text,
  requested_account_type text,
  requested_owner_venue jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_app_metadata jsonb;
  needs_onboarding boolean;
  venue_name text;
  venue_area text;
  venue_sport text;
  venue_price numeric(10, 2);
  venue_latitude double precision;
  venue_longitude double precision;
begin
  if current_user_id is null then
    raise exception 'Sign in before completing registration.';
  end if;

  select u.raw_app_meta_data
  into current_user_app_metadata
  from auth.users u
  where u.id = current_user_id;

  if not (
    current_user_app_metadata ->> 'provider' = 'google'
    or coalesce(current_user_app_metadata -> 'providers', '[]'::jsonb) ? 'google'
  ) then
    raise exception 'Google sign-in is required to complete this registration.';
  end if;

  select p.onboarding_completed
  into needs_onboarding
  from public.profiles p
  where p.id = current_user_id
  for update;

  if needs_onboarding is null then
    raise exception 'PlayLink profile is missing. Apply the profile migrations before retrying.';
  end if;
  if needs_onboarding then
    raise exception 'This Google profile has already been completed.';
  end if;

  if requested_username !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Username must be 3 to 24 letters, numbers, or underscores.';
  end if;
  if char_length(btrim(requested_display_name)) not between 2 and 80 then
    raise exception 'Name must be between 2 and 80 characters.';
  end if;
  if requested_account_type not in ('player', 'venue_owner') then
    raise exception 'Choose a valid PlayLink account type.';
  end if;

  if requested_account_type = 'venue_owner' then
    venue_name := btrim(coalesce(requested_owner_venue ->> 'name', ''));
    venue_area := btrim(coalesce(requested_owner_venue ->> 'area', ''));
    venue_sport := coalesce(requested_owner_venue ->> 'sport', 'Futsal');

    if char_length(venue_name) not between 2 and 120
      or char_length(venue_area) not between 2 and 160 then
      raise exception 'Venue name and district or area are required for venue owners.';
    end if;
    if venue_sport not in ('Futsal', 'Cricket', 'Both') then
      raise exception 'Choose a valid venue sport.';
    end if;
    if coalesce(requested_owner_venue ->> 'price_per_hour', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
      raise exception 'Enter a valid hourly venue rate.';
    end if;
    venue_price := (requested_owner_venue ->> 'price_per_hour')::numeric;

    if coalesce(requested_owner_venue ->> 'latitude', '') <> ''
      and coalesce(requested_owner_venue ->> 'longitude', '') <> '' then
      if requested_owner_venue ->> 'latitude' !~ '^-?[0-9]{1,3}(\.[0-9]{1,8})?$'
        or requested_owner_venue ->> 'longitude' !~ '^-?[0-9]{1,3}(\.[0-9]{1,8})?$' then
        raise exception 'Enter valid venue coordinates.';
      end if;
      venue_latitude := (requested_owner_venue ->> 'latitude')::double precision;
      venue_longitude := (requested_owner_venue ->> 'longitude')::double precision;
      if venue_latitude not between -90 and 90 or venue_longitude not between -180 and 180 then
        raise exception 'Venue coordinates are outside their valid range.';
      end if;
    elsif coalesce(requested_owner_venue ->> 'latitude', '') <> ''
      or coalesce(requested_owner_venue ->> 'longitude', '') <> '' then
      raise exception 'Enter both latitude and longitude, or leave both blank.';
    end if;
  end if;

  update public.profiles
  set username = lower(requested_username),
      display_name = btrim(requested_display_name),
      phone = nullif(btrim(coalesce(requested_phone, '')), ''),
      account_type = requested_account_type,
      onboarding_completed = true
  where id = current_user_id;

  if requested_account_type = 'venue_owner'
    and not exists (
      select 1 from public.owner_venues v where v.owner_id = current_user_id
    ) then
    insert into public.owner_venues (
      owner_id, name, sport, area, address, description, price_per_hour,
      image_url, maps_url, latitude, longitude, is_active
    )
    values (
      current_user_id,
      venue_name,
      venue_sport,
      venue_area,
      left(coalesce(requested_owner_venue ->> 'address', ''), 240),
      left(coalesce(requested_owner_venue ->> 'description', ''), 1000),
      venue_price,
      left(coalesce(requested_owner_venue ->> 'image_url', ''), 2048),
      left(coalesce(requested_owner_venue ->> 'maps_url', ''), 2048),
      venue_latitude,
      venue_longitude,
      coalesce(requested_owner_venue ->> 'is_active', 'true') <> 'false'
    );
  end if;
end;
$$;

revoke all on function public.complete_google_profile(text, text, text, text, jsonb) from public, anon;
grant execute on function public.complete_google_profile(text, text, text, text, jsonb) to authenticated;
