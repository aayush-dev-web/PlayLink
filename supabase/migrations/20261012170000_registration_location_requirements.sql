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
  requested_home_location text;
  requested_home_latitude double precision;
  requested_home_longitude double precision;
  google_signup boolean;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  requested_type := new.raw_user_meta_data ->> 'account_type';
  requested_sport := coalesce(new.raw_user_meta_data ->> 'preferred_sport', '');
  requested_home_location := btrim(coalesce(new.raw_user_meta_data ->> 'home_location', ''));
  google_signup := new.raw_app_meta_data ->> 'provider' = 'google'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google';

  if requested_username !~ '^[a-zA-Z0-9_]{3,24}$' then
    requested_username := 'player_' || substr(replace(new.id::text, '-', ''), 1, 17);
  end if;
  if requested_type is null or requested_type not in ('player', 'team_organizer', 'venue_owner') then
    requested_type := 'player';
  end if;

  if not google_signup then
    if char_length(requested_home_location) not between 2 and 160
      or coalesce(new.raw_user_meta_data ->> 'home_latitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
      or coalesce(new.raw_user_meta_data ->> 'home_longitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$' then
      raise exception 'Registration requires a location name and valid latitude and longitude.'
        using errcode = 'check_violation';
    end if;
    requested_home_latitude := (new.raw_user_meta_data ->> 'home_latitude')::double precision;
    requested_home_longitude := (new.raw_user_meta_data ->> 'home_longitude')::double precision;
    if requested_home_latitude not between -90 and 90
      or requested_home_longitude not between -180 and 180 then
      raise exception 'Registration coordinates are outside their valid range.'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.profiles (
    id, username, display_name, phone, account_type, onboarding_completed,
    preferred_sport, home_location, home_latitude, home_longitude
  ) values (
    new.id,
    requested_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    requested_type,
    not google_signup,
    requested_sport,
    requested_home_location,
    requested_home_latitude,
    requested_home_longitude
  );
  return new;
end;
$$;

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
  venue_latitude double precision;
  venue_longitude double precision;
begin
  if new.raw_user_meta_data ->> 'account_type' <> 'venue_owner' then
    return new;
  end if;

  venue_data := new.raw_user_meta_data -> 'owner_venue';
  venue_name := btrim(coalesce(venue_data ->> 'name', ''));
  venue_area := btrim(coalesce(venue_data ->> 'area', ''));
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
  if coalesce(venue_data ->> 'latitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
    or coalesce(venue_data ->> 'longitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$' then
    raise exception 'Venue owner registration requires venue latitude and longitude.'
      using errcode = 'check_violation';
  end if;
  venue_latitude := (venue_data ->> 'latitude')::double precision;
  venue_longitude := (venue_data ->> 'longitude')::double precision;
  if venue_latitude not between -90 and 90 or venue_longitude not between -180 and 180 then
    raise exception 'Venue coordinates are outside their valid range.'
      using errcode = 'check_violation';
  end if;

  if coalesce(venue_data ->> 'price_per_hour', '') ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
    venue_price := (venue_data ->> 'price_per_hour')::numeric;
  else
    venue_price := 0;
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
  current_user_metadata jsonb;
  needs_onboarding boolean;
  user_home_location text;
  user_home_latitude double precision;
  user_home_longitude double precision;
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

  select u.raw_app_meta_data, u.raw_user_meta_data
  into current_user_app_metadata, current_user_metadata
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

  user_home_location := btrim(coalesce(current_user_metadata ->> 'home_location', ''));
  if char_length(user_home_location) not between 2 and 160
    or coalesce(current_user_metadata ->> 'home_latitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
    or coalesce(current_user_metadata ->> 'home_longitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$' then
    raise exception 'Registration requires a location name and valid latitude and longitude.';
  end if;
  user_home_latitude := (current_user_metadata ->> 'home_latitude')::double precision;
  user_home_longitude := (current_user_metadata ->> 'home_longitude')::double precision;
  if user_home_latitude not between -90 and 90 or user_home_longitude not between -180 and 180 then
    raise exception 'Registration coordinates are outside their valid range.';
  end if;

  if requested_account_type = 'venue_owner' then
    venue_name := btrim(coalesce(requested_owner_venue ->> 'name', ''));
    venue_area := btrim(coalesce(requested_owner_venue ->> 'area', ''));
    venue_sport := coalesce(requested_owner_venue ->> 'sport', 'Futsal');

    if char_length(venue_name) not between 2 and 120
      or char_length(venue_area) not between 2 and 160 then
      raise exception 'Venue name and district or area are required for venue owners.';
    end if;
    if venue_sport <> 'Both' and not public.is_playlink_sport(venue_sport) then
      raise exception 'Choose a valid venue sport.';
    end if;
    if coalesce(requested_owner_venue ->> 'price_per_hour', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
      raise exception 'Enter a valid hourly venue rate.';
    end if;
    venue_price := (requested_owner_venue ->> 'price_per_hour')::numeric;

    if coalesce(requested_owner_venue ->> 'latitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
      or coalesce(requested_owner_venue ->> 'longitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$' then
      raise exception 'Venue owner registration requires venue latitude and longitude.';
    end if;
    venue_latitude := (requested_owner_venue ->> 'latitude')::double precision;
    venue_longitude := (requested_owner_venue ->> 'longitude')::double precision;
    if venue_latitude not between -90 and 90 or venue_longitude not between -180 and 180 then
      raise exception 'Venue coordinates are outside their valid range.';
    end if;
  end if;

  update public.profiles
  set username = lower(requested_username),
      display_name = btrim(requested_display_name),
      phone = nullif(btrim(coalesce(requested_phone, '')), ''),
      account_type = requested_account_type,
      home_location = user_home_location,
      home_latitude = user_home_latitude,
      home_longitude = user_home_longitude,
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
