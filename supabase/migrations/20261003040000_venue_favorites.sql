create table if not exists public.venue_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id text not null check (char_length(trim(venue_id)) between 1 and 128),
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

alter table public.venue_favorites enable row level security;

revoke all on public.venue_favorites from anon;
grant select, insert, update, delete on public.venue_favorites to authenticated;

create policy "Users can read their own venue favorites"
  on public.venue_favorites for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own venue favorites"
  on public.venue_favorites for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own venue favorites"
  on public.venue_favorites for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own venue favorites"
  on public.venue_favorites for delete
  to authenticated
  using ((select auth.uid()) = user_id);
