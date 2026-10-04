insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'playlink-venue-photos',
  'playlink-venue-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view PlayLink venue photos" on storage.objects;
create policy "Public can view PlayLink venue photos"
  on storage.objects for select
  to public
  using (bucket_id = 'playlink-venue-photos');

drop policy if exists "Venue owners can upload their venue photos" on storage.objects;
create policy "Venue owners can upload their venue photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'playlink-venue-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'venues'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.account_type = 'venue_owner'
    )
  );

drop policy if exists "Venue owners can update their venue photos" on storage.objects;
create policy "Venue owners can update their venue photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'playlink-venue-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'venues'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.account_type = 'venue_owner'
    )
  )
  with check (
    bucket_id = 'playlink-venue-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'venues'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.account_type = 'venue_owner'
    )
  );

drop policy if exists "Venue owners can delete their venue photos" on storage.objects;
create policy "Venue owners can delete their venue photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'playlink-venue-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'venues'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.account_type = 'venue_owner'
    )
  );
