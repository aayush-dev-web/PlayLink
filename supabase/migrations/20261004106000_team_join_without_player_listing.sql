create or replace function public.request_to_join_team(requested_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  team_row public.community_teams%rowtype;
  invitation_id uuid;
  existing_status text;
begin
  if requesting_user_id is null then
    raise exception 'Sign in to request to join a team.' using errcode = '42501';
  end if;

  select * into team_row
  from public.community_teams
  where id = requested_team_id
  for update;
  if not found or not team_row.is_active or not team_row.is_public then
    raise exception 'This team is not publicly accepting requests.' using errcode = 'P0002';
  end if;
  if team_row.owner_id = requesting_user_id then
    raise exception 'You already own this team.' using errcode = '22023';
  end if;
  if not team_row.recruiting or team_row.members_needed < 1 then
    raise exception 'This team is not currently accepting teammates.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.team_memberships membership
    where membership.team_id = requested_team_id and membership.user_id = requesting_user_id
  ) then
    raise exception 'You are already a member of this team.' using errcode = '23505';
  end if;

  select status into existing_status
  from public.team_invitations
  where team_id = requested_team_id and player_id = requesting_user_id
  for update;
  if existing_status = 'pending' then
    raise exception 'Your request or invitation is already pending.' using errcode = '23505';
  end if;
  if existing_status = 'accepted' then
    raise exception 'You are already a member of this team.' using errcode = '23505';
  end if;

  insert into public.team_invitations (team_id, player_id, invited_by, kind, status, created_at, responded_at)
  values (requested_team_id, requesting_user_id, requesting_user_id, 'request', 'pending', now(), null)
  on conflict (team_id, player_id) do update
    set invited_by = excluded.invited_by,
        kind = 'request',
        status = 'pending',
        created_at = now(),
        responded_at = null
  returning id into invitation_id;
  return invitation_id;
end;
$$;

revoke all on function public.request_to_join_team(uuid) from public, anon;
grant execute on function public.request_to_join_team(uuid) to authenticated;
