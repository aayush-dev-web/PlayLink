alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists bio text not null default '',
  add column if not exists preferred_sport text not null default '',
  add column if not exists player_position text not null default '',
  add column if not exists skill_level text not null default '',
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists tiktok_url text,
  add column if not exists home_location text not null default '',
  add column if not exists home_latitude double precision,
  add column if not exists home_longitude double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length_check') then
    alter table public.profiles add constraint profiles_bio_length_check
      check (char_length(bio) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_preferred_sport_check') then
    alter table public.profiles add constraint profiles_preferred_sport_check
      check (preferred_sport in ('', 'Futsal', 'Cricket', 'Both'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_skill_level_check') then
    alter table public.profiles add constraint profiles_skill_level_check
      check (skill_level in ('', 'Beginner', 'Intermediate', 'Advanced'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_instagram_url_check') then
    alter table public.profiles add constraint profiles_instagram_url_check
      check (instagram_url is null or instagram_url ~* '^https?://(www\.)?instagram\.com/[^/?#]+/?$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_facebook_url_check') then
    alter table public.profiles add constraint profiles_facebook_url_check
      check (facebook_url is null or facebook_url ~* '^https?://(www\.)?facebook\.com/[^/?#]+/?$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_tiktok_url_check') then
    alter table public.profiles add constraint profiles_tiktok_url_check
      check (tiktok_url is null or tiktok_url ~* '^https?://(www\.)?tiktok\.com/[^/?#]+/?$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_home_coordinates_check') then
    alter table public.profiles add constraint profiles_home_coordinates_check
      check (
        (home_latitude is null and home_longitude is null)
        or (
          home_latitude is not null
          and home_longitude is not null
          and home_latitude between -90 and 90
          and home_longitude between -180 and 180
        )
      );
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('playlink-avatars', 'playlink-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view PlayLink profile photos"
  on storage.objects for select
  to public
  using (bucket_id = 'playlink-avatars');

create policy "Users can upload their own PlayLink profile photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'playlink-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can update their own PlayLink profile photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'playlink-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'playlink-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own PlayLink profile photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'playlink-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
