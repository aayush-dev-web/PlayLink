create table if not exists public.player_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  sport text not null check (sport in ('Futsal', 'Cricket')),
  area text not null check (char_length(btrim(area)) between 2 and 160),
  level text not null check (level in ('Beginner', 'Intermediate', 'Advanced', 'Competitive', 'All levels')),
  position text not null default '',
  availability text not null check (availability in ('Weeknights', 'Weekends', 'Flexible')),
  available_days text[] not null default '{}',
  looking_for_team boolean not null default true,
  description text not null default '' check (char_length(description) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  sport text not null check (sport in ('Futsal', 'Cricket')),
  area text not null check (char_length(btrim(area)) between 2 and 160),
  level text not null check (level in ('Beginner', 'Intermediate', 'Advanced', 'Competitive', 'All levels')),
  availability text not null check (availability in ('Weeknights', 'Weekends', 'Flexible')),
  members_needed smallint not null default 0 check (members_needed between 0 and 100),
  recruiting boolean not null default true,
  description text not null default '' check (char_length(description) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_listings_discovery_idx
  on public.player_listings (is_active, sport, area);
create index if not exists community_teams_discovery_idx
  on public.community_teams (is_active, sport, area, recruiting);
create index if not exists community_teams_owner_idx
  on public.community_teams (owner_id, created_at desc);

alter table public.player_listings enable row level security;
alter table public.community_teams enable row level security;

revoke all on public.player_listings, public.community_teams from anon, authenticated;
grant select on public.player_listings, public.community_teams to anon, authenticated;
grant insert, update, delete on public.player_listings to authenticated;
grant insert, update, delete on public.community_teams to authenticated;

drop policy if exists "Public can read active player listings" on public.player_listings;
create policy "Public can read active player listings"
  on public.player_listings for select to anon, authenticated
  using (is_active or user_id = (select auth.uid()));

drop policy if exists "Players manage their own listing" on public.player_listings;
create policy "Players manage their own listing"
  on public.player_listings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Public can read active community teams" on public.community_teams;
create policy "Public can read active community teams"
  on public.community_teams for select to anon, authenticated
  using (is_active or owner_id = (select auth.uid()));

drop policy if exists "Team organizers manage their own teams" on public.community_teams;
create policy "Team organizers manage their own teams"
  on public.community_teams for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and account_type = 'team_organizer'
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and account_type = 'team_organizer'
    )
  );

create or replace function public.touch_community_listing_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists player_listings_touch_updated_at on public.player_listings;
create trigger player_listings_touch_updated_at
  before update on public.player_listings
  for each row execute function public.touch_community_listing_updated_at();

drop trigger if exists community_teams_touch_updated_at on public.community_teams;
create trigger community_teams_touch_updated_at
  before update on public.community_teams
  for each row execute function public.touch_community_listing_updated_at();
