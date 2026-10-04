create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null default '',
  phone text,
  account_type text not null default 'player'
    check (account_type in ('player', 'team_organizer', 'venue_owner')),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

grant select, update on public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.is_username_available(requested_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_username ~ '^[a-zA-Z0-9_]{3,24}$'
    and not exists (
      select 1
      from public.profiles
      where lower(username) = lower(requested_username)
    );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

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
    requested_username := 'player_' || replace(new.id::text, '-', '');
  end if;

  if requested_type is null or requested_type not in ('player', 'team_organizer', 'venue_owner') then
    requested_type := 'player';
  end if;

  insert into public.profiles (id, username, display_name, phone, account_type)
  values (
    new.id,
    requested_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    requested_type
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_playlink on auth.users;
create trigger on_auth_user_created_playlink
  after insert on auth.users
  for each row execute procedure public.handle_new_playlink_user();
