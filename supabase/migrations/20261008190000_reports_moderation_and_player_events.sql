create table if not exists public.playlink_user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (reason in (
    'Harassment or bullying',
    'Threats or unsafe behavior',
    'Hate or discrimination',
    'Spam or scams',
    'Inappropriate content',
    'Impersonation or fake profile',
    'Other'
  )),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint playlink_user_reports_not_self check (reporter_id <> target_user_id)
);

create index if not exists playlink_user_reports_status_created_idx
  on public.playlink_user_reports (status, created_at desc);
create index if not exists playlink_user_reports_target_idx
  on public.playlink_user_reports (target_user_id, created_at desc);
create unique index if not exists playlink_user_reports_one_pending_per_pair_idx
  on public.playlink_user_reports (reporter_id, target_user_id)
  where status = 'pending';

create table if not exists public.playlink_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.playlink_user_reports(id) on delete restrict,
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action_number integer not null check (action_number > 0),
  action_type text not null check (action_type in ('warning', 'temporary_ban', 'permanent_ban')),
  ban_duration text check (ban_duration in ('72h', '168h', '876000h')),
  auth_ban_applied_at timestamptz,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint playlink_moderation_action_duration_consistent check (
    (action_type = 'warning' and ban_duration is null)
    or (action_type = 'temporary_ban' and ban_duration in ('72h', '168h'))
    or (action_type = 'permanent_ban' and ban_duration = '876000h')
  )
);

create index if not exists playlink_moderation_actions_target_created_idx
  on public.playlink_moderation_actions (target_user_id, created_at desc);

create table if not exists public.playlink_user_restrictions (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  action_count integer not null default 0 check (action_count >= 0),
  banned_until timestamptz,
  is_permanently_banned boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.playlink_user_reports enable row level security;
alter table public.playlink_moderation_actions enable row level security;
alter table public.playlink_user_restrictions enable row level security;

revoke all on public.playlink_user_reports, public.playlink_moderation_actions, public.playlink_user_restrictions
  from anon, authenticated;
grant select, insert on public.playlink_user_reports to authenticated;
grant select on public.playlink_moderation_actions to authenticated;
grant select on public.playlink_user_restrictions to authenticated;

drop policy if exists "Users can submit reports" on public.playlink_user_reports;
create policy "Users can submit reports"
  on public.playlink_user_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and target_user_id <> (select auth.uid())
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
  );

drop policy if exists "Reporters and admins can read reports" on public.playlink_user_reports;
create policy "Reporters and admins can read reports"
  on public.playlink_user_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_playlink_admin()));

drop policy if exists "PlayLink admins can read moderation actions" on public.playlink_moderation_actions;
create policy "PlayLink admins can read moderation actions"
  on public.playlink_moderation_actions for select to authenticated
  using ((select public.is_playlink_admin()));

drop policy if exists "Users and admins can read account restrictions" on public.playlink_user_restrictions;
create policy "Users and admins can read account restrictions"
  on public.playlink_user_restrictions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_playlink_admin()));

create or replace function public.enforce_playlink_account_restriction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or (select public.is_playlink_admin()) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' and tg_table_schema = 'public' and tg_table_name = 'player_inbox_messages' then
    if new.user_id = actor_id and new.direction = 'player_to_team' then
      return new;
    end if;
  end if;
  if exists (
    select 1 from public.playlink_user_restrictions r
    where r.user_id = actor_id
      and (r.is_permanently_banned or r.banned_until > now())
  ) then
    raise exception using errcode = '42501', message = 'playlink_account_restricted';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.enforce_playlink_account_restriction() from public, anon, authenticated;

do $$
declare
  table_row record;
begin
  for table_row in
    select n.nspname as schema_name, c.relname as table_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'drop trigger if exists playlink_account_restriction_guard on %I.%I',
      table_row.schema_name, table_row.table_name
    );
    execute format(
      'create trigger playlink_account_restriction_guard before insert or update or delete on %I.%I for each row execute function public.enforce_playlink_account_restriction()',
      table_row.schema_name, table_row.table_name
    );
  end loop;
end;
$$;

create or replace function public.submit_playlink_user_report(
  p_target_user_id uuid,
  p_reason text,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  report_id uuid;
begin
  if actor_id is null or actor_id = p_target_user_id then
    raise exception using errcode = '22023', message = 'invalid_report_target';
  end if;
  if p_reason is null or p_reason not in (
    'Harassment or bullying',
    'Threats or unsafe behavior',
    'Hate or discrimination',
    'Spam or scams',
    'Inappropriate content',
    'Impersonation or fake profile',
    'Other'
  ) then
    raise exception using errcode = '22023', message = 'invalid_report_reason';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_target_user_id and account_type in ('player', 'venue_owner')
  ) then
    raise exception using errcode = '22023', message = 'report_target_not_found';
  end if;
  if char_length(coalesce(p_details, '')) > 2000 then
    raise exception using errcode = '22023', message = 'report_details_too_long';
  end if;

  insert into public.playlink_user_reports (reporter_id, target_user_id, reason, details)
  values (actor_id, p_target_user_id, p_reason, coalesce(trim(p_details), ''))
  returning id into report_id;
  return report_id;
end;
$$;

revoke all on function public.submit_playlink_user_report(uuid, text, text) from public, anon;
grant execute on function public.submit_playlink_user_report(uuid, text, text) to authenticated;

create or replace function public.admin_send_player_inbox_message(
  p_user_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  message_id uuid;
begin
  if actor_id is null or not public.is_playlink_admin() then
    raise exception using errcode = '42501', message = 'admin_access_required';
  end if;
  if p_user_id is null or char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_message';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception using errcode = '22023', message = 'message_recipient_not_found';
  end if;

  insert into public.player_inbox_messages (user_id, subject, body, direction)
  values (p_user_id, 'Message from PlayLink Team', trim(p_body), 'team_to_player')
  returning id into message_id;
  return message_id;
end;
$$;

revoke all on function public.admin_send_player_inbox_message(uuid, text) from public, anon;
grant execute on function public.admin_send_player_inbox_message(uuid, text) to authenticated;

create or replace function public.admin_review_playlink_report(
  p_report_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  report_row public.playlink_user_reports%rowtype;
  action_number integer;
  action_kind text;
  duration text;
  message_body text;
  expiry timestamptz;
begin
  if actor_id is null or not public.is_playlink_admin() then
    raise exception using errcode = '42501', message = 'admin_access_required';
  end if;
  if p_decision is null or p_decision not in ('dismiss', 'warn') then
    raise exception using errcode = '22023', message = 'invalid_report_decision';
  end if;

  select * into report_row
  from public.playlink_user_reports
  where id = p_report_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'report_not_found';
  end if;
  if report_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'report_already_reviewed';
  end if;

  if p_decision = 'dismiss' then
    update public.playlink_user_reports
    set status = 'dismissed', reviewed_at = now(), reviewed_by = actor_id
    where id = p_report_id;
    return jsonb_build_object('report_id', p_report_id, 'decision', 'dismissed');
  end if;

  insert into public.playlink_user_restrictions (user_id)
  values (report_row.target_user_id)
  on conflict (user_id) do nothing;

  select action_count + 1 into action_number
  from public.playlink_user_restrictions
  where user_id = report_row.target_user_id
  for update;

  if action_number <= 3 then
    action_kind := 'warning';
  elsif action_number = 4 then
    action_kind := 'temporary_ban';
    duration := '72h';
  elsif action_number = 5 then
    action_kind := 'temporary_ban';
    duration := '168h';
  else
    action_kind := 'permanent_ban';
    duration := '876000h';
  end if;

  if duration = '72h' then
    expiry := now() + interval '72 hours';
  elsif duration = '168h' then
    expiry := now() + interval '168 hours';
  end if;

  insert into public.playlink_moderation_actions (
    report_id, target_user_id, admin_id, action_number, action_type, ban_duration, reason
  ) values (
    p_report_id, report_row.target_user_id, actor_id, action_number, action_kind, duration, report_row.reason
  );

  update public.playlink_user_restrictions
  set action_count = action_number,
      banned_until = case when action_kind = 'temporary_ban' then expiry else banned_until end,
      is_permanently_banned = action_kind = 'permanent_ban' or is_permanently_banned,
      updated_at = now()
  where user_id = report_row.target_user_id;

  update public.playlink_user_reports
  set status = 'actioned', reviewed_at = now(), reviewed_by = actor_id
  where id = p_report_id;

  message_body := case
    when action_kind = 'warning' then format(
      E'Official PlayLink warning %s of 3\n\nA report about your account was reviewed by the PlayLink team. The reported behavior was: %s.\n\nPlease follow the community rules. Further confirmed reports can result in temporary or permanent account restrictions.',
      action_number, report_row.reason
    )
    when action_kind = 'temporary_ban' and action_number = 4 then
      format(E'PlayLink account restriction: 3 days\n\nA report about your account was reviewed by the PlayLink team. Reason: %s.\nYour account access is suspended for 3 days. Further confirmed violations can extend the restriction or permanently disable your account.', report_row.reason)
    when action_kind = 'temporary_ban' then
      format(E'PlayLink account restriction: 1 week\n\nA report about your account was reviewed by the PlayLink team. Reason: %s.\nYour account access is suspended for 1 week. Further confirmed violations can permanently disable your account.', report_row.reason)
    else
      format(E'PlayLink account restriction: permanent\n\nA report about your account was reviewed by the PlayLink team. Reason: %s.\nYour account has been permanently suspended from PlayLink. Contact the PlayLink team if you believe this decision was made in error.', report_row.reason)
  end;

  insert into public.player_inbox_messages (user_id, subject, body)
  values (
    report_row.target_user_id,
    case when action_kind = 'warning' then format('Community warning %s of 3', action_number)
      else 'PlayLink account restriction' end,
    message_body
  );

  return jsonb_build_object(
    'report_id', p_report_id,
    'target_user_id', report_row.target_user_id,
    'decision', action_kind,
    'action_number', action_number,
    'ban_duration', duration
  );
end;
$$;

revoke all on function public.admin_review_playlink_report(uuid, text) from public, anon;
grant execute on function public.admin_review_playlink_report(uuid, text) to authenticated;

create or replace function public.get_my_playlink_restriction()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restricted',
      coalesce(r.is_permanently_banned, false)
      or coalesce(r.banned_until > now(), false),
    'permanent', coalesce(r.is_permanently_banned, false),
    'banned_until', r.banned_until
  )
  from (select auth.uid() as user_id) actor
  left join public.playlink_user_restrictions r on r.user_id = actor.user_id;
$$;

revoke all on function public.get_my_playlink_restriction() from public, anon;
grant execute on function public.get_my_playlink_restriction() to authenticated;
