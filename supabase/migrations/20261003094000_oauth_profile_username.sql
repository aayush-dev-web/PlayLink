create or replace function public.handle_new_playlink_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  requested_type text;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  requested_type := new.raw_user_meta_data ->> 'account_type';

  if requested_username !~ '^[a-zA-Z0-9_]{3,24}$' then
    requested_username := 'player_' || substr(replace(new.id::text, '-', ''), 1, 17);
  end if;

  if requested_type is null or requested_type not in ('player', 'team_organizer', 'venue_owner') then
    requested_type := 'player';
  end if;

  insert into public.profiles (id, username, display_name, phone, account_type)
  values (
    new.id,
    requested_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    requested_type
  );
  return new;
end;
$$;
