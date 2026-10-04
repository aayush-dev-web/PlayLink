create or replace function public.get_team_join_request_profile(requested_invitation_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  preferred_sport text,
  player_position text,
  skill_level text,
  home_location text,
  listing_sport text,
  listing_area text,
  listing_level text,
  listing_position text,
  listing_availability text,
  listing_description text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.team_invitations invitation
    join public.community_teams team on team.id = invitation.team_id
    where invitation.id = requested_invitation_id
      and invitation.kind = 'request'
      and invitation.status = 'pending'
      and team.owner_id = auth.uid()
  ) then
    raise exception 'Only the team owner can view a pending join requester profile.' using errcode = '42501';
  end if;

  return query
  select
    profile.id,
    profile.username,
    coalesce(nullif(btrim(profile.display_name), ''), listing.display_name, 'PlayLink player'),
    profile.avatar_url,
    profile.bio,
    profile.preferred_sport,
    profile.player_position,
    profile.skill_level,
    profile.home_location,
    listing.sport,
    listing.area,
    listing.level,
    listing.position,
    listing.availability,
    listing.description
  from public.team_invitations invitation
  join public.profiles profile on profile.id = invitation.player_id
  left join public.player_listings listing
    on listing.user_id = profile.id and listing.is_active
  where invitation.id = requested_invitation_id
    and invitation.kind = 'request'
    and invitation.status = 'pending';
end;
$$;

revoke all on function public.get_team_join_request_profile(uuid) from public, anon;
grant execute on function public.get_team_join_request_profile(uuid) to authenticated;
