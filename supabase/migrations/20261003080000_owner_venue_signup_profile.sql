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

  if venue_sport not in ('Futsal', 'Cricket', 'Both') then
    venue_sport := 'Futsal';
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
    owner_id,
    name,
    sport,
    area,
    address,
    description,
    price_per_hour,
    image_url,
    maps_url,
    latitude,
    longitude,
    is_active
  )
  values (
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
    case
      when venue_data ->> 'is_active' = 'false' then false
      else true
    end
  );

  return new;
end;
$$;

revoke all on function public.create_owner_venue_from_signup() from public, anon, authenticated;

drop trigger if exists playlink_create_owner_venue_after_signup on auth.users;
create trigger playlink_create_owner_venue_after_signup
  after insert on auth.users
  for each row execute function public.create_owner_venue_from_signup();
