create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  description text not null default '' check (char_length(description) <= 3000),
  sport_type text not null check (sport_type in ('futsal', 'cricket')),
  location_text text not null check (char_length(btrim(location_text)) between 2 and 180),
  start_time timestamptz not null,
  end_time timestamptz not null,
  max_teams integer not null check (max_teams between 1 and 64),
  status text not null default 'open'
    check (status in ('draft', 'open', 'full', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_end_after_start check (end_time > start_time)
);

create index if not exists events_discovery_idx
  on public.events (status, start_time asc);
create index if not exists events_sport_start_idx
  on public.events (sport_type, start_time asc);
create index if not exists events_organizer_start_idx
  on public.events (organizer_id, start_time desc);

create table if not exists public.event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  team_name text not null check (char_length(btrim(team_name)) between 2 and 80),
  team_owner_id uuid not null references public.profiles (id) on delete restrict,
  joined_at timestamptz not null default now(),
  participation_status text not null default 'active'
    check (participation_status in ('active', 'withdrawn'))
);

create unique index if not exists event_teams_event_owner_name_unique
  on public.event_teams (event_id, team_owner_id, lower(team_name));
create index if not exists event_teams_event_status_idx
  on public.event_teams (event_id, participation_status);
create index if not exists event_teams_owner_idx
  on public.event_teams (team_owner_id, joined_at desc);

create table if not exists public.event_join_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  requesting_user_id uuid not null references public.profiles (id) on delete restrict,
  team_name text not null check (char_length(btrim(team_name)) between 2 and 80),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_requests_event_owner_name_unique
  on public.event_join_requests (event_id, requesting_user_id, lower(team_name));
create index if not exists event_requests_event_status_idx
  on public.event_join_requests (event_id, status, created_at asc);
create index if not exists event_requests_requester_idx
  on public.event_join_requests (requesting_user_id, created_at desc);

alter table public.events enable row level security;
alter table public.event_teams enable row level security;
alter table public.event_join_requests enable row level security;

revoke all on public.events, public.event_teams, public.event_join_requests from anon, authenticated;
grant select on public.events to anon, authenticated;
grant select (id, event_id, team_name, joined_at, participation_status)
  on public.event_teams to anon, authenticated;
grant select on public.event_join_requests to authenticated;
revoke update on public.profiles from authenticated;
grant update (username, display_name, phone) on public.profiles to authenticated;

drop policy if exists "Public can read published events" on public.events;
create policy "Public can read published events"
  on public.events for select to anon, authenticated
  using (status <> 'draft' or organizer_id = (select auth.uid()));

drop policy if exists "Public can read teams for visible events" on public.event_teams;
create policy "Public can read teams for visible events"
  on public.event_teams for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id and (e.status <> 'draft' or e.organizer_id = (select auth.uid()))
  ));

drop policy if exists "Requesters and event organizers can read requests" on public.event_join_requests;
create policy "Requesters and event organizers can read requests"
  on public.event_join_requests for select to authenticated
  using (
    requesting_user_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = (select auth.uid())
    )
  );

create or replace function public.touch_playlink_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at before update on public.events
  for each row execute function public.touch_playlink_updated_at();
drop trigger if exists event_requests_touch_updated_at on public.event_join_requests;
create trigger event_requests_touch_updated_at before update on public.event_join_requests
  for each row execute function public.touch_playlink_updated_at();

create or replace function public.refresh_playlink_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_event_id uuid := new.event_id;
begin
  update public.events e
  set status = case
    when e.status in ('cancelled', 'completed', 'draft') then e.status
    when (select count(*) from public.event_teams t
          where t.event_id = e.id and t.participation_status = 'active') >= e.max_teams then 'full'
    else 'open'
  end
  where e.id = affected_event_id;
  return new;
end;
$$;

drop trigger if exists event_teams_refresh_capacity on public.event_teams;
create trigger event_teams_refresh_capacity
  after insert or update of participation_status on public.event_teams
  for each row execute function public.refresh_playlink_event_capacity();

create or replace function public.can_manage_playlink_events(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.account_type in ('team_organizer', 'venue_owner')
  );
$$;

create or replace function public.list_playlink_events(
  p_search text default null,
  p_sport text default null,
  p_location text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_available_only boolean default false,
  p_status text default 'upcoming',
  p_limit integer default 24,
  p_offset integer default 0
)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'description', e.description,
    'sport_type', e.sport_type,
    'location_text', e.location_text,
    'start_time', e.start_time,
    'end_time', e.end_time,
    'max_teams', e.max_teams,
    'status', e.status,
    'organizer_id', e.organizer_id,
    'organizer_name', coalesce(nullif(p.display_name, ''), 'PlayLink organizer'),
    'team_count', counts.team_count,
    'created_at', e.created_at
  )
  from public.events e
  join public.profiles p on p.id = e.organizer_id
  cross join lateral (
    select count(*)::integer as team_count
    from public.event_teams t
    where t.event_id = e.id and t.participation_status = 'active'
  ) counts
  where (e.status <> 'draft' or e.organizer_id = (select auth.uid()))
    and (
      p_status = 'upcoming' and e.status in ('open', 'full') and e.start_time >= now()
      or p_status = 'all' and e.status <> 'draft'
      or p_status in ('open', 'full', 'completed', 'cancelled') and e.status = p_status
    )
    and (nullif(btrim(p_search), '') is null
      or e.title ilike '%' || btrim(p_search) || '%'
      or e.description ilike '%' || btrim(p_search) || '%')
    and (nullif(p_sport, '') is null or e.sport_type = p_sport)
    and (nullif(btrim(p_location), '') is null or e.location_text ilike '%' || btrim(p_location) || '%')
    and (p_from is null or e.start_time >= p_from)
    and (p_to is null or e.start_time < p_to)
    and (not coalesce(p_available_only, false) or
      (e.status = 'open' and counts.team_count < e.max_teams))
  order by case when e.start_time >= now() then 0 else 1 end,
    case when e.status = 'open' then 0 else 1 end, e.start_time asc
  limit least(greatest(coalesce(p_limit, 24), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_playlink_event(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  current_user_id uuid := (select auth.uid());
begin
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id, 'title', e.title, 'description', e.description,
      'sport_type', e.sport_type, 'location_text', e.location_text,
      'start_time', e.start_time, 'end_time', e.end_time,
      'max_teams', e.max_teams, 'status', e.status,
      'organizer_id', e.organizer_id, 'organizer_name', coalesce(nullif(p.display_name, ''), 'PlayLink organizer'),
      'organizer_username', p.username, 'created_at', e.created_at
    ),
    'team_count', (select count(*)::integer from public.event_teams t
      where t.event_id = e.id and t.participation_status = 'active'),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'team_name', t.team_name, 'participation_status', t.participation_status,
      'joined_at', t.joined_at,
      'can_manage', t.team_owner_id = current_user_id or e.organizer_id = current_user_id
    ) order by t.joined_at) from public.event_teams t
      where t.event_id = e.id and t.participation_status = 'active'), '[]'::jsonb),
    'my_request', (select jsonb_build_object(
      'id', r.id, 'team_name', r.team_name, 'message', r.message,
      'status', r.status, 'created_at', r.created_at
    ) from public.event_join_requests r
      where r.event_id = e.id and r.requesting_user_id = current_user_id
      order by r.created_at desc limit 1),
    'requests', case when e.organizer_id = current_user_id then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'team_name', r.team_name, 'message', r.message,
        'status', r.status, 'created_at', r.created_at,
        'requester_name', coalesce(nullif(requester.display_name, ''), 'PlayLink member'),
        'requester_username', requester.username
      ) order by r.created_at)
      from public.event_join_requests r
      join public.profiles requester on requester.id = r.requesting_user_id
      where r.event_id = e.id
    ), '[]'::jsonb) else null end
  ) into result
  from public.events e
  join public.profiles p on p.id = e.organizer_id
  where e.id = p_event_id and (e.status <> 'draft' or e.organizer_id = current_user_id);
  return result;
end;
$$;

create or replace function public.my_playlink_event_requests()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'event_id', r.event_id, 'event_title', e.title,
    'start_time', e.start_time, 'team_name', r.team_name, 'status', r.status,
    'created_at', r.created_at
  )
  from public.event_join_requests r
  join public.events e on e.id = r.event_id
  where r.requesting_user_id = (select auth.uid())
  order by r.created_at desc
  limit 30;
$$;

create or replace function public.create_playlink_event(
  p_title text, p_sport_type text, p_description text, p_location_text text,
  p_start_time timestamptz, p_end_time timestamptz, p_max_teams integer,
  p_organizer_team_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_event_id uuid;
begin
  if actor_id is null or not public.can_manage_playlink_events(actor_id) then
    raise exception using errcode = 'P0001', message = 'organizer_role_required';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 100
    or char_length(coalesce(p_description, '')) > 3000
    or p_sport_type not in ('futsal', 'cricket')
    or char_length(btrim(coalesce(p_location_text, ''))) not between 2 and 180
    or p_start_time <= now() or p_end_time <= p_start_time
    or p_max_teams not between 1 and 64
    or char_length(btrim(coalesce(p_organizer_team_name, ''))) > 80 then
    raise exception using errcode = 'P0001', message = 'invalid_event_details';
  end if;
  insert into public.events (
    organizer_id, title, sport_type, description, location_text,
    start_time, end_time, max_teams, status
  ) values (
    actor_id, btrim(p_title), p_sport_type, coalesce(p_description, ''),
    btrim(p_location_text), p_start_time, p_end_time, p_max_teams, 'open'
  ) returning id into new_event_id;

  if nullif(btrim(p_organizer_team_name), '') is not null then
    insert into public.event_teams (event_id, team_name, team_owner_id)
    values (new_event_id, btrim(p_organizer_team_name), actor_id);
  end if;
  return new_event_id;
end;
$$;

create or replace function public.request_to_join_playlink_event(
  p_event_id uuid, p_team_name text, p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  event_row public.events%rowtype;
  request_id uuid;
  team_count integer;
begin
  if actor_id is null or not public.can_manage_playlink_events(actor_id) then
    raise exception using errcode = 'P0001', message = 'organizer_role_required';
  end if;
  if char_length(btrim(coalesce(p_team_name, ''))) not between 2 and 80
    or char_length(coalesce(p_message, '')) > 1000 then
    raise exception using errcode = 'P0001', message = 'invalid_request_details';
  end if;
  select * into event_row from public.events where id = p_event_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'event_not_found'; end if;
  if event_row.organizer_id = actor_id then
    raise exception using errcode = 'P0001', message = 'organizer_cannot_request';
  end if;
  if event_row.status <> 'open' or event_row.start_time <= now() then
    raise exception using errcode = 'P0001', message = 'event_not_open';
  end if;
  select count(*)::integer into team_count from public.event_teams
    where event_id = p_event_id and participation_status = 'active';
  if team_count >= event_row.max_teams then
    update public.events set status = 'full' where id = p_event_id;
    raise exception using errcode = 'P0001', message = 'event_full';
  end if;
  if exists (select 1 from public.event_teams t
      where t.event_id = p_event_id and t.team_owner_id = actor_id
        and lower(t.team_name) = lower(btrim(p_team_name))) then
    raise exception using errcode = 'P0001', message = 'team_already_joined';
  end if;
  insert into public.event_join_requests (event_id, requesting_user_id, team_name, message)
    values (p_event_id, actor_id, btrim(p_team_name), coalesce(p_message, ''))
    returning id into request_id;
  return request_id;
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'request_already_exists';
end;
$$;

create or replace function public.review_playlink_event_request(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_event_id uuid;
  event_row public.events%rowtype;
  request_row public.event_join_requests%rowtype;
  active_count integer;
begin
  select event_id into target_event_id from public.event_join_requests where id = p_request_id;
  if target_event_id is null then raise exception using errcode = 'P0001', message = 'request_not_found'; end if;
  select * into event_row from public.events where id = target_event_id for update;
  if event_row.organizer_id <> actor_id then
    raise exception using errcode = 'P0001', message = 'not_event_organizer';
  end if;
  select * into request_row from public.event_join_requests where id = p_request_id for update;
  if request_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'request_not_pending';
  end if;
  if p_approve then
    if event_row.status <> 'open' or event_row.start_time <= now() then
      raise exception using errcode = 'P0001', message = 'event_not_open';
    end if;
    select count(*)::integer into active_count from public.event_teams
      where event_id = target_event_id and participation_status = 'active';
    if active_count >= event_row.max_teams then
      update public.events set status = 'full' where id = target_event_id;
      raise exception using errcode = 'P0001', message = 'event_full';
    end if;
    if exists (select 1 from public.event_teams t
      where t.event_id = target_event_id
        and t.team_owner_id = request_row.requesting_user_id
        and lower(t.team_name) = lower(request_row.team_name)) then
      raise exception using errcode = 'P0001', message = 'team_already_joined';
    end if;
    insert into public.event_teams (event_id, team_name, team_owner_id)
      values (target_event_id, request_row.team_name, request_row.requesting_user_id);
    update public.event_join_requests set status = 'approved' where id = p_request_id;
  else
    update public.event_join_requests set status = 'rejected' where id = p_request_id;
  end if;
end;
$$;

create or replace function public.update_playlink_event(
  p_event_id uuid, p_title text, p_sport_type text, p_description text,
  p_location_text text, p_start_time timestamptz, p_end_time timestamptz,
  p_max_teams integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  event_row public.events%rowtype;
  active_count integer;
begin
  select * into event_row from public.events where id = p_event_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'event_not_found'; end if;
  if event_row.organizer_id <> actor_id then
    raise exception using errcode = 'P0001', message = 'not_event_organizer';
  end if;
  if event_row.status not in ('open', 'full') or event_row.start_time <= now() then
    raise exception using errcode = 'P0001', message = 'event_not_editable';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 100
    or char_length(coalesce(p_description, '')) > 3000
    or p_sport_type not in ('futsal', 'cricket')
    or char_length(btrim(coalesce(p_location_text, ''))) not between 2 and 180
    or p_start_time <= now() or p_end_time <= p_start_time
    or p_max_teams not between 1 and 64 then
    raise exception using errcode = 'P0001', message = 'invalid_event_details';
  end if;
  select count(*)::integer into active_count from public.event_teams
    where event_id = p_event_id and participation_status = 'active';
  if p_max_teams < active_count then
    raise exception using errcode = 'P0001', message = 'capacity_below_participants';
  end if;
  update public.events set title = btrim(p_title), sport_type = p_sport_type,
    description = coalesce(p_description, ''), location_text = btrim(p_location_text),
    start_time = p_start_time, end_time = p_end_time, max_teams = p_max_teams,
    status = case when active_count >= p_max_teams then 'full' else 'open' end
  where id = p_event_id;
end;
$$;

create or replace function public.cancel_playlink_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  event_row public.events%rowtype;
begin
  select * into event_row from public.events where id = p_event_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'event_not_found'; end if;
  if event_row.organizer_id <> actor_id then
    raise exception using errcode = 'P0001', message = 'not_event_organizer';
  end if;
  if event_row.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'event_not_cancellable';
  end if;
  update public.events set status = 'cancelled' where id = p_event_id;
  update public.event_join_requests set status = 'withdrawn'
    where event_id = p_event_id and status = 'pending';
end;
$$;

create or replace function public.complete_playlink_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  event_row public.events%rowtype;
begin
  select * into event_row from public.events where id = p_event_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'event_not_found'; end if;
  if event_row.organizer_id <> actor_id then
    raise exception using errcode = 'P0001', message = 'not_event_organizer';
  end if;
  if event_row.status not in ('open', 'full') or event_row.end_time > now() then
    raise exception using errcode = 'P0001', message = 'event_not_completeable';
  end if;
  update public.events set status = 'completed' where id = p_event_id;
  update public.event_join_requests set status = 'withdrawn'
    where event_id = p_event_id and status = 'pending';
end;
$$;

create or replace function public.withdraw_playlink_event_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  team_row public.event_teams%rowtype;
  event_organizer_id uuid;
begin
  select * into team_row from public.event_teams where id = p_team_id;
  if not found then raise exception using errcode = 'P0001', message = 'team_not_found'; end if;
  select e.organizer_id into event_organizer_id from public.events e where e.id = team_row.event_id for update;
  if actor_id <> team_row.team_owner_id and actor_id <> event_organizer_id then
    raise exception using errcode = 'P0001', message = 'not_authorized';
  end if;
  if team_row.participation_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'team_not_active';
  end if;
  update public.event_teams set participation_status = 'withdrawn' where id = p_team_id;
  update public.event_join_requests set status = 'withdrawn'
    where event_id = team_row.event_id and requesting_user_id = team_row.team_owner_id
      and lower(team_name) = lower(team_row.team_name) and status = 'approved';
end;
$$;

create or replace function public.withdraw_playlink_event_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.event_join_requests set status = 'withdrawn'
  where id = p_request_id and requesting_user_id = (select auth.uid()) and status = 'pending';
  if not found then raise exception using errcode = 'P0001', message = 'request_not_withdrawable'; end if;
end;
$$;

revoke all on function public.can_manage_playlink_events(uuid) from public, anon, authenticated;
revoke all on function public.list_playlink_events(text, text, text, timestamptz, timestamptz, boolean, text, integer, integer) from public;
revoke all on function public.get_playlink_event(uuid) from public;
revoke all on function public.my_playlink_event_requests() from public, anon;
revoke all on function public.create_playlink_event(text, text, text, text, timestamptz, timestamptz, integer, text) from public, anon;
revoke all on function public.request_to_join_playlink_event(uuid, text, text) from public, anon;
revoke all on function public.review_playlink_event_request(uuid, boolean) from public, anon;
revoke all on function public.update_playlink_event(uuid, text, text, text, text, timestamptz, timestamptz, integer) from public, anon;
revoke all on function public.cancel_playlink_event(uuid) from public, anon;
revoke all on function public.complete_playlink_event(uuid) from public, anon;
revoke all on function public.withdraw_playlink_event_team(uuid) from public, anon;
revoke all on function public.withdraw_playlink_event_request(uuid) from public, anon;

grant execute on function public.list_playlink_events(text, text, text, timestamptz, timestamptz, boolean, text, integer, integer) to anon, authenticated;
grant execute on function public.get_playlink_event(uuid) to anon, authenticated;
grant execute on function public.my_playlink_event_requests() to authenticated;
grant execute on function public.create_playlink_event(text, text, text, text, timestamptz, timestamptz, integer, text) to authenticated;
grant execute on function public.request_to_join_playlink_event(uuid, text, text) to authenticated;
grant execute on function public.review_playlink_event_request(uuid, boolean) to authenticated;
grant execute on function public.update_playlink_event(uuid, text, text, text, text, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.cancel_playlink_event(uuid) to authenticated;
grant execute on function public.complete_playlink_event(uuid) to authenticated;
grant execute on function public.withdraw_playlink_event_team(uuid) to authenticated;
grant execute on function public.withdraw_playlink_event_request(uuid) to authenticated;
