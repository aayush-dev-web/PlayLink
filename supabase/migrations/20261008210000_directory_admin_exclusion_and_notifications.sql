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
    and not exists (
      select 1 from public.playlink_admins admin_account
      where admin_account.user_id = p.id
    )
  order by p.created_at desc;
$$;

revoke all on function public.get_public_player_profiles() from public;
grant execute on function public.get_public_player_profiles() to anon, authenticated;

create or replace function public.search_players_for_team_invite(search_query text)
returns table (user_id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with normalized_query as (
    select lower(trim(both '@' from btrim(coalesce(search_query, '')))) as username_query,
      lower(btrim(coalesce(search_query, ''))) as name_query
  )
  select listing.user_id, profile.username, listing.display_name
  from public.player_listings listing
  join public.profiles profile on profile.id = listing.user_id
  cross join normalized_query query
  where (select auth.uid()) is not null
    and listing.is_active
    and listing.user_id <> (select auth.uid())
    and not exists (
      select 1 from public.playlink_admins admin_account
      where admin_account.user_id = listing.user_id
    )
    and length(query.username_query) >= 2
    and (
      strpos(lower(profile.username), query.username_query) > 0
      or strpos(lower(listing.display_name), query.name_query) > 0
    )
  order by
    case when lower(profile.username) = query.username_query then 0 else 1 end,
    profile.username
  limit 10;
$$;

revoke all on function public.search_players_for_team_invite(text) from public, anon;
grant execute on function public.search_players_for_team_invite(text) to authenticated;

create or replace function public.get_playlink_admin_notifications()
returns table (
  id text,
  kind text,
  title text,
  body text,
  href text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.is_playlink_admin()), false) then
    raise exception 'PlayLink admin access is required.';
  end if;

  return query
  select activity.id, activity.kind, activity.title, activity.body,
    activity.href, activity.created_at
  from (
    select 'account:' || profile.id::text as id, 'account'::text as kind,
      'New account created'::text as title,
      coalesce(nullif(profile.display_name, ''), profile.username, 'PlayLink member')::text as body,
      '/admin'::text as href, profile.created_at
    from public.profiles profile
    where not exists (
      select 1 from public.playlink_admins admin_account
      where admin_account.user_id = profile.id
    )

    union all

    select 'event:' || event.id::text, 'event', 'New event posted',
      event.title, '/admin', event.created_at
    from public.events event
    where event.status <> 'draft'

    union all

    select 'team:' || team.id::text, 'team', 'New team created',
      team.name, '/admin', team.created_at
    from public.community_teams team

    union all

    select 'report:' || report.id::text, 'report', 'New user report',
      report.reason || ' · ' || coalesce(target.display_name, target.username, 'PlayLink member'),
      '/admin', report.created_at
    from public.playlink_user_reports report
    left join public.profiles target on target.id = report.target_user_id

    union all

    select 'appeal:' || appeal.id::text, 'appeal', 'Warning appeal submitted',
      coalesce(player.display_name, player.username, 'PlayLink member'),
      '/admin', appeal.created_at
    from public.playlink_moderation_appeals appeal
    left join public.profiles player on player.id = appeal.user_id

    union all

    select 'booking:' || booking.id::text, 'booking', 'New venue booking',
      booking.customer_name || ' · ' || booking.sport, '/admin', booking.created_at
    from public.venue_bookings booking

    union all

    select 'review:' || review.id::text, 'review', 'New venue review',
      review.reviewer_name || ' · ' || coalesce(nullif(review.review, ''), 'Rated a venue'),
      '/admin', review.created_at
    from public.venue_reviews review

    union all

    select 'message:' || message.id::text, 'message', 'New PlayLink Team message',
      coalesce(nullif(player.display_name, ''), player.username, 'PlayLink member'),
      '/admin', message.created_at
    from public.player_inbox_messages message
    left join public.profiles player on player.id = message.user_id
    where message.direction = 'player_to_team'

    union all

    select 'venue:' || venue.id::text, 'venue', 'New venue listed',
      venue.name, '/admin', venue.created_at
    from public.owner_venues venue
  ) activity
  order by activity.created_at desc
  limit 30;
end;
$$;

revoke all on function public.get_playlink_admin_notifications() from public, anon;
grant execute on function public.get_playlink_admin_notifications() to authenticated;
