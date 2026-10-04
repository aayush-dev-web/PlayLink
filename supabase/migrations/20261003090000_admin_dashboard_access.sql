create table if not exists public.playlink_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.playlink_admins enable row level security;
revoke all on public.playlink_admins from anon, authenticated;

create or replace function public.is_playlink_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.playlink_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_playlink_admin() from public, anon;
grant execute on function public.is_playlink_admin() to authenticated;

drop policy if exists "PlayLink admins can read all profiles" on public.profiles;
create policy "PlayLink admins can read all profiles"
  on public.profiles for select
  to authenticated
  using ((select public.is_playlink_admin()));

drop policy if exists "PlayLink admins can read all venues" on public.owner_venues;
create policy "PlayLink admins can read all venues"
  on public.owner_venues for select
  to authenticated
  using ((select public.is_playlink_admin()));

drop policy if exists "PlayLink admins can moderate venues" on public.owner_venues;
create policy "PlayLink admins can moderate venues"
  on public.owner_venues for update
  to authenticated
  using ((select public.is_playlink_admin()))
  with check ((select public.is_playlink_admin()));

drop policy if exists "PlayLink admins can read all bookings" on public.venue_bookings;
create policy "PlayLink admins can read all bookings"
  on public.venue_bookings for select
  to authenticated
  using ((select public.is_playlink_admin()));

drop policy if exists "PlayLink admins can read all reviews" on public.venue_reviews;
create policy "PlayLink admins can read all reviews"
  on public.venue_reviews for select
  to authenticated
  using ((select public.is_playlink_admin()));
