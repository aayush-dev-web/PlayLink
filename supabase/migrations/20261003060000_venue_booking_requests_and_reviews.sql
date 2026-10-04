alter table public.venue_bookings
  add column if not exists customer_id uuid references public.profiles(id) on delete set null;

alter table public.venue_bookings
  drop constraint if exists venue_bookings_status_check;

alter table public.venue_bookings
  add constraint venue_bookings_status_check
  check (status in ('pending', 'confirmed', 'rejected', 'cancelled', 'completed'));

create index if not exists venue_bookings_customer_starts_at_idx
  on public.venue_bookings(customer_id, starts_at desc);

drop policy if exists "Owners can manage their venue bookings" on public.venue_bookings;
drop policy if exists "Owners can read bookings for their venues" on public.venue_bookings;
drop policy if exists "Players can read their own venue bookings" on public.venue_bookings;
drop policy if exists "Players can request bookings at active venues" on public.venue_bookings;
drop policy if exists "Owners can add bookings for their venues" on public.venue_bookings;
drop policy if exists "Owners can update bookings for their venues" on public.venue_bookings;

create policy "Owners can read bookings for their venues"
  on public.venue_bookings for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.owner_venues
      where id = venue_id and owner_id = (select auth.uid())
    )
  );

create policy "Players can read their own venue bookings"
  on public.venue_bookings for select
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "Players can request bookings at active venues"
  on public.venue_bookings for insert
  to authenticated
  with check (
    customer_id = (select auth.uid())
    and customer_id <> owner_id
    and status = 'pending'
    and exists (
      select 1 from public.owner_venues
      where id = venue_id
        and owner_id = venue_bookings.owner_id
        and is_active
    )
  );

create policy "Owners can add bookings for their venues"
  on public.venue_bookings for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.owner_venues
      where id = venue_id and owner_id = (select auth.uid())
    )
  );

create policy "Owners can update bookings for their venues"
  on public.venue_bookings for update
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

create or replace function public.prevent_unapproved_booking_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and (old.status <> 'confirmed' or new.ends_at > now()) then
    raise exception 'Only an accepted booking can be marked completed after its scheduled end time.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists venue_booking_completion_requires_confirmation on public.venue_bookings;
create trigger venue_booking_completion_requires_confirmation
  before update of status on public.venue_bookings
  for each row execute function public.prevent_unapproved_booking_completion();

alter table public.venue_reviews
  add column if not exists booking_id uuid references public.venue_bookings(id) on delete cascade,
  add column if not exists reviewer_id uuid references public.profiles(id) on delete cascade;

create unique index if not exists venue_reviews_booking_id_unique
  on public.venue_reviews(booking_id)
  where booking_id is not null;

alter table public.venue_reviews
  drop constraint if exists venue_reviews_review_text_check;

alter table public.venue_reviews
  add constraint venue_reviews_review_text_check
  check (char_length(trim(review)) between 3 and 1000)
  not valid;

grant select on public.venue_reviews to anon, authenticated;
grant insert on public.venue_reviews to authenticated;

drop policy if exists "Visitors can read reviews for active venues" on public.venue_reviews;
drop policy if exists "Players can review completed venue bookings" on public.venue_reviews;

create policy "Visitors can read reviews for active venues"
  on public.venue_reviews for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.owner_venues
      where id = venue_id and is_active
    )
  );

create policy "Players can review completed venue bookings"
  on public.venue_reviews for insert
  to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and reviewer_id <> owner_id
    and exists (
      select 1 from public.venue_bookings
      where id = booking_id
        and venue_id = venue_reviews.venue_id
        and owner_id = venue_reviews.owner_id
        and customer_id = (select auth.uid())
        and status = 'completed'
    )
  );
