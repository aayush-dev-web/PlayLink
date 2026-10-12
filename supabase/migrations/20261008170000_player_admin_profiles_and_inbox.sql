create or replace function public.sync_designated_playlink_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) = 'aayushfourth@gmail.com'
    and new.email_confirmed_at is not null then
    insert into public.playlink_admins (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  else
    delete from public.playlink_admins
    where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_designated_playlink_admin() from public, anon, authenticated;

drop trigger if exists sync_designated_playlink_admin_insert on auth.users;
create trigger sync_designated_playlink_admin_insert
  after insert on auth.users
  for each row execute function public.sync_designated_playlink_admin();

drop trigger if exists sync_designated_playlink_admin_update on auth.users;
create trigger sync_designated_playlink_admin_update
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.sync_designated_playlink_admin();

insert into public.playlink_admins (user_id)
select id
from auth.users
where lower(email) = 'aayushfourth@gmail.com'
  and email_confirmed_at is not null
on conflict (user_id) do nothing;

create or replace function public.get_public_player_profiles()
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url,
    p.instagram_url, p.facebook_url, p.tiktok_url, p.created_at
  from public.profiles p
  where p.account_type = 'player'
  order by p.created_at desc;
$$;

revoke all on function public.get_public_player_profiles() from public;
grant execute on function public.get_public_player_profiles() to anon, authenticated;

create or replace function public.get_admin_user_profiles()
returns table (
  id uuid,
  email text,
  username text,
  display_name text,
  phone text,
  account_type text,
  created_at timestamptz,
  avatar_url text,
  bio text,
  preferred_sport text,
  player_position text,
  skill_level text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  home_location text,
  home_latitude double precision,
  home_longitude double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, account.email, p.username, p.display_name, p.phone,
    p.account_type, p.created_at, p.avatar_url, p.bio, p.preferred_sport,
    p.player_position, p.skill_level, p.instagram_url, p.facebook_url,
    p.tiktok_url, p.home_location, p.home_latitude, p.home_longitude
  from public.profiles p
  join auth.users account on account.id = p.id
  where (select public.is_playlink_admin())
  order by p.created_at desc;
$$;

revoke all on function public.get_admin_user_profiles() from public, anon;
grant execute on function public.get_admin_user_profiles() to authenticated;

create table if not exists public.player_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject text not null,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  direction text not null default 'team_to_player'
    check (direction in ('team_to_player', 'player_to_team')),
  created_at timestamptz not null default now()
);

create index if not exists player_inbox_messages_user_created_idx
  on public.player_inbox_messages (user_id, created_at desc);

alter table public.player_inbox_messages enable row level security;
revoke all on public.player_inbox_messages from anon, authenticated;
grant select, insert on public.player_inbox_messages to authenticated;

drop policy if exists "Users can read their PlayLink inbox" on public.player_inbox_messages;
create policy "Users can read their PlayLink inbox"
  on public.player_inbox_messages for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can send PlayLink feedback" on public.player_inbox_messages;
create policy "Users can send PlayLink feedback"
  on public.player_inbox_messages for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and direction = 'player_to_team'
  );

drop policy if exists "PlayLink admins can read user inbox messages" on public.player_inbox_messages;
create policy "PlayLink admins can read user inbox messages"
  on public.player_inbox_messages for select
  to authenticated
  using ((select public.is_playlink_admin()));

create or replace function public.send_new_player_welcome_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_name text := coalesce(nullif(trim(new.display_name), ''), new.username, 'there');
begin
  insert into public.player_inbox_messages (user_id, subject, body)
  values (
    new.id,
    'Welcome to PlayLink!',
    format(
      E'Hi %s,\n\nWelcome to **PlayLink!** 🎉\n\nThank you for joining us. We’d love to know how your experience has been so far.\n\nSince you’re one of our new users, your feedback is especially valuable to us. Could you take a moment to share:\n\n- How has your experience been using PlayLink so far?\n- What features did you find useful or enjoyable?\n- Was anything confusing or difficult to use?\n- Is there anything you would like us to improve or add?\n- Do you have any suggestions that could make PlayLink better?\n\nThere are no wrong answers — your honest feedback will help us improve PlayLink and create a better experience for everyone.\n\nThank you for being part of the PlayLink community! 🏆\n\nBest regards,\n**The PlayLink Team**\n*Connect. Play. Compete.*',
      player_name
    )
  );
  return new;
end;
$$;

revoke all on function public.send_new_player_welcome_message() from public, anon, authenticated;

drop trigger if exists send_new_player_welcome_message_after_profile_insert on public.profiles;
create trigger send_new_player_welcome_message_after_profile_insert
  after insert on public.profiles
  for each row execute function public.send_new_player_welcome_message();
