create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.community_teams(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint team_invitations_team_player_unique unique (team_id, player_id)
);

create index if not exists team_invitations_player_status_idx
  on public.team_invitations (player_id, status, created_at desc);
create index if not exists team_invitations_team_status_idx
  on public.team_invitations (team_id, status, created_at desc);

create table if not exists public.team_memberships (
  team_id uuid not null references public.community_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_memberships_user_joined_idx
  on public.team_memberships (user_id, joined_at desc);

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.community_teams(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null default 'Teammate',
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists team_messages_team_created_idx
  on public.team_messages (team_id, created_at);

alter table public.team_invitations enable row level security;
alter table public.team_memberships enable row level security;
alter table public.team_messages enable row level security;

revoke all on public.team_invitations, public.team_memberships, public.team_messages from anon, authenticated;
grant select on public.team_invitations, public.team_memberships, public.team_messages to authenticated;
grant insert on public.team_messages to authenticated;

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

drop policy if exists "Team participants can read memberships" on public.team_memberships;
create policy "Team participants can read memberships"
  on public.team_memberships for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.community_teams team
      where team.id = team_id and team.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Team participants can read group messages" on public.team_messages;
create policy "Team participants can read group messages"
  on public.team_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.community_teams team
      where team.id = team_id
        and (
          team.owner_id = (select auth.uid())
          or exists (
            select 1 from public.team_memberships membership
            where membership.team_id = team.id and membership.user_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Team participants can send group messages" on public.team_messages;
create policy "Team participants can send group messages"
  on public.team_messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.community_teams team
      where team.id = team_id
        and (
          team.owner_id = (select auth.uid())
          or exists (
            select 1 from public.team_memberships membership
            where membership.team_id = team.id and membership.user_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Team members can read their teams" on public.community_teams;
create policy "Team members can read their teams"
  on public.community_teams for select
  to authenticated
  using (
    exists (
      select 1 from public.team_memberships membership
      where membership.team_id = id and membership.user_id = (select auth.uid())
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
    raise exception 'An invitation to this player is already pending.' using errcode = '23505';
  end if;
  if existing_status = 'accepted' then
    raise exception 'This player is already a team member.' using errcode = '23505';
  end if;

  insert into public.team_invitations (team_id, player_id, invited_by, status, created_at, responded_at)
  values (requested_team_id, requested_player_id, inviting_user_id, 'pending', now(), null)
  on conflict (team_id, player_id) do update
    set invited_by = excluded.invited_by, status = 'pending', created_at = now(), responded_at = null
  returning id into invitation_id;
  return invitation_id;
end;
$$;

revoke all on function public.invite_player_to_team(uuid, uuid) from public, anon;
grant execute on function public.invite_player_to_team(uuid, uuid) to authenticated;

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
begin
  if responding_user_id is null then
    raise exception 'Sign in to respond to this invitation.' using errcode = '42501';
  end if;
  if requested_response not in ('accepted', 'rejected') then
    raise exception 'Choose accept or reject.' using errcode = '22023';
  end if;

  select * into invitation
  from public.team_invitations
  where id = requested_invitation_id
  for update;
  if not found or invitation.player_id <> responding_user_id then
    raise exception 'This invitation is not available to your account.' using errcode = '42501';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'This invitation has already been answered.' using errcode = '22023';
  end if;

  if requested_response = 'accepted' then
    select * into team_row
    from public.community_teams
    where id = invitation.team_id
    for update;
    if not found or not team_row.is_active or not team_row.recruiting or team_row.members_needed < 1 then
      raise exception 'This team is no longer accepting teammates.' using errcode = '22023';
    end if;
    insert into public.team_memberships (team_id, user_id)
    values (invitation.team_id, responding_user_id)
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

create or replace function public.touch_team_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.community_teams set updated_at = new.created_at where id = new.team_id;
  return new;
end;
$$;

revoke all on function public.touch_team_message() from public, anon, authenticated;

create or replace function public.set_team_message_sender_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_id <> auth.uid() then
    raise exception 'Messages must be sent by the signed-in user.' using errcode = '42501';
  end if;
  select coalesce(nullif(btrim(display_name), ''), 'Teammate')
  into new.sender_name
  from public.profiles
  where id = new.sender_id;
  return new;
end;
$$;

revoke all on function public.set_team_message_sender_name() from public, anon, authenticated;

drop trigger if exists team_message_set_sender_name on public.team_messages;
create trigger team_message_set_sender_name
  before insert on public.team_messages
  for each row execute function public.set_team_message_sender_name();

drop trigger if exists team_message_updates_team on public.team_messages;
create trigger team_message_updates_team
  after insert on public.team_messages
  for each row execute function public.touch_team_message();
