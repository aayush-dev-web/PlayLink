create table if not exists public.owner_venues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  sport text not null check (sport in ('Futsal', 'Cricket', 'Both')),
  area text not null check (char_length(trim(area)) between 2 and 160),
  address text not null default '',
  description text not null default '',
  price_per_hour numeric(10, 2) not null default 0 check (price_per_hour >= 0),
  image_url text not null default '',
  maps_url text not null default '',
  latitude double precision,
  longitude double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_venues_coordinates_check check (
    (latitude is null and longitude is null)
    or (
      latitude is not null
      and longitude is not null
      and latitude between -90 and 90
      and longitude between -180 and 180
    )
  )
);

create table if not exists public.venue_availability (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.owner_venues(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  price_per_hour numeric(10, 2) not null default 0 check (price_per_hour >= 0),
  created_at timestamptz not null default now(),
  constraint venue_availability_time_check check (end_time > start_time),
  constraint venue_availability_slot_unique unique (venue_id, weekday, start_time)
);

create table if not exists public.venue_bookings (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.owner_venues(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 120),
  customer_contact text not null default '',
  sport text not null check (sport in ('Futsal', 'Cricket')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint venue_bookings_time_check check (ends_at > starts_at)
);

create table if not exists public.venue_reviews (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.owner_venues(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_name text not null,
  rating smallint not null check (rating between 1 and 5),
  review text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists owner_venues_owner_id_idx on public.owner_venues(owner_id);
create index if not exists venue_availability_owner_weekday_idx on public.venue_availability(owner_id, weekday);
create index if not exists venue_bookings_owner_starts_at_idx on public.venue_bookings(owner_id, starts_at);
create index if not exists venue_reviews_owner_created_at_idx on public.venue_reviews(owner_id, created_at desc);

alter table public.owner_venues enable row level security;
alter table public.venue_availability enable row level security;
alter table public.venue_bookings enable row level security;
alter table public.venue_reviews enable row level security;

revoke all on public.owner_venues, public.venue_availability, public.venue_bookings, public.venue_reviews from anon, authenticated;
grant select on public.owner_venues to anon, authenticated;
grant insert, update on public.owner_venues to authenticated;
grant select, insert, update, delete on public.venue_availability to authenticated;
grant select, insert, update on public.venue_bookings to authenticated;
grant select on public.venue_reviews to authenticated;

create policy "Visitors can browse active owner venues"
  on public.owner_venues for select
  to anon, authenticated
  using (is_active);

create policy "Owners can read all their venues"
  on public.owner_venues for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and account_type = 'venue_owner'
    )
  );

create policy "Owners can create their venues"
  on public.owner_venues for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and account_type = 'venue_owner'
    )
  );

create policy "Owners can update their venues"
  on public.owner_venues for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and account_type = 'venue_owner'
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and account_type = 'venue_owner'
    )
  );

create policy "Owners can manage their venue availability"
  on public.venue_availability for all
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.owner_venues
      where id = venue_id and owner_id = (select auth.uid())
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.owner_venues
      where id = venue_id and owner_id = (select auth.uid())
    )
  );

create policy "Owners can manage their venue bookings"
  on public.venue_bookings for all
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.owner_venues
      where id = venue_id and owner_id = (select auth.uid())
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.owner_venues
      where id = venue_id and owner_id = (select auth.uid())
    )
  );

create policy "Owners can read reviews for their venues"
  on public.venue_reviews for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.owner_venues
      where id = venue_id and owner_id = (select auth.uid())
    )
  );
