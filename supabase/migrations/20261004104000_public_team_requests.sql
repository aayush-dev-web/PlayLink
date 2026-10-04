alter table public.community_teams
  add column if not exists is_public boolean not null default true;

alter table public.team_invitations
  add column if not exists kind text not null default 'invite';

alter table public.team_invitations
  drop constraint if exists team_invitations_kind_check;
alter table public.team_invitations
  add constraint team_invitations_kind_check check (kind in ('invite', 'request'));

drop policy if exists "Team organizers manage their own teams" on public.community_teams;
drop policy if exists "Authenticated users manage their own teams" on public.community_teams;
create policy "Authenticated users manage their own teams"
  on public.community_teams for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Public can read active community teams" on public.community_teams;
create or replace function public.is_team_member(requested_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_memberships membership
    where membership.team_id = requested_team_id
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_team_invited_user(requested_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_invitations invitation
    where invitation.team_id = requested_team_id
      and invitation.player_id = (select auth.uid())
      and invitation.status = 'pending'
  );
$$;

revoke all on function public.is_team_member(uuid) from public, anon;
revoke all on function public.is_team_invited_user(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to anon, authenticated;
grant execute on function public.is_team_invited_user(uuid) to anon, authenticated;

drop policy if exists "Team members can read their teams" on public.community_teams;
create policy "Public can read active community teams"
  on public.community_teams for select
  to anon, authenticated
  using (
    (is_active and is_public)
    or owner_id = (select auth.uid())
    or public.is_team_member(id)
    or public.is_team_invited_user(id)
  );

drop policy if exists "Players and team owners can read team invitations" on public.team_invitations;
create policy "Players and team owners can read team invitations"
  on public.team_invitations for select
  to authenticated
  using (
    player_id = (select auth.uid())
    or exists (
      select 1 from public.community_teams team
      where team.id = team_id and team.owner_id = (select auth.uid())
    )
  );

create or replace function public.invite_player_to_team(requested_team_id uuid, requested_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inviting_user_id uuid := auth.uid();
  team_row public.community_teams%rowtype;
  invitation_id uuid;
  existing_status text;
begin
  if inviting_user_id is null then
    raise exception 'Sign in to invite a player.' using errcode = '42501';
  end if;
  if requested_player_id is null or requested_player_id = inviting_user_id then
    raise exception 'Choose another player to invite.' using errcode = '22023';
  end if;

  select * into team_row
  from public.community_teams
  where id = requested_team_id
  for update;
  if not found or team_row.owner_id <> inviting_user_id then
    raise exception 'Only a team owner can send invitations.' using errcode = '42501';
  end if;
  if not team_row.is_active or not team_row.recruiting or team_row.members_needed < 1 then
    raise exception 'This team is not currently accepting teammates.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.player_listings listing
    where listing.user_id = requested_player_id and listing.is_active
  ) then
    raise exception 'This player does not have an active player listing.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.team_memberships membership
    where membership.team_id = requested_team_id and membership.user_id = requested_player_id
  ) then
    raise exception 'This player is already a team member.' using errcode = '23505';
  end if;

  select status into existing_status
  from public.team_invitations
  where team_id = requested_team_id and player_id = requested_player_id
  for update;
  if existing_status = 'pending' then
    raise exception 'A team request or invitation is already pending.' using errcode = '23505';
  end if;
  if existing_status = 'accepted' then
    raise exception 'This player is already a team member.' using errcode = '23505';
  end if;

  insert into public.team_invitations (team_id, player_id, invited_by, kind, status, created_at, responded_at)
  values (requested_team_id, requested_player_id, inviting_user_id, 'invite', 'pending', now(), null)
  on conflict (team_id, player_id) do update
    set invited_by = excluded.invited_by,
        kind = 'invite',
        status = 'pending',
        created_at = now(),
        responded_at = null
  returning id into invitation_id;
  return invitation_id;
end;
$$;

revoke all on function public.invite_player_to_team(uuid, uuid) from public, anon;
grant execute on function public.invite_player_to_team(uuid, uuid) to authenticated;

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
  if not exists (
    select 1 from public.player_listings listing
    where listing.user_id = requesting_user_id and listing.is_active
  ) then
    raise exception 'Publish an active player profile before requesting to join a team.' using errcode = '22023';
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

create or replace function public.respond_to_team_invitation(requested_invitation_id uuid, requested_response text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  responding_user_id uuid := auth.uid();
  invitation public.team_invitations%rowtype;
  team_row public.community_teams%rowtype;
  expected_responder_id uuid;
begin
  if responding_user_id is null then
    raise exception 'Sign in to respond to this team action.' using errcode = '42501';
  end if;
  if requested_response not in ('accepted', 'rejected') then
    raise exception 'Choose accept or reject.' using errcode = '22023';
  end if;

  select * into invitation
  from public.team_invitations
  where id = requested_invitation_id
  for update;
  if not found then
    raise exception 'This invitation or request was not found.' using errcode = 'P0002';
  end if;
  select * into team_row from public.community_teams where id = invitation.team_id for update;
  if not found then
    raise exception 'This team is no longer available.' using errcode = 'P0002';
  end if;
  expected_responder_id := case when invitation.kind = 'invite' then invitation.player_id else team_row.owner_id end;
  if responding_user_id <> expected_responder_id then
    raise exception 'Only the invited player or team owner can respond to this request.' using errcode = '42501';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'This invitation or request has already been answered.' using errcode = '22023';
  end if;

  if requested_response = 'accepted' then
    if not team_row.is_active or not team_row.recruiting or team_row.members_needed < 1 then
      raise exception 'This team is no longer accepting teammates.' using errcode = '22023';
    end if;
    insert into public.team_memberships (team_id, user_id)
    values (invitation.team_id, invitation.player_id)
    on conflict (team_id, user_id) do nothing;
    update public.community_teams
    set members_needed = greatest(members_needed - 1, 0),
        recruiting = members_needed > 1,
        updated_at = now()
    where id = invitation.team_id;
  end if;

  update public.team_invitations
  set status = requested_response, responded_at = now()
  where id = requested_invitation_id;
  return invitation.team_id;
end;
$$;

revoke all on function public.respond_to_team_invitation(uuid, text) from public, anon;
grant execute on function public.respond_to_team_invitation(uuid, text) to authenticated;
