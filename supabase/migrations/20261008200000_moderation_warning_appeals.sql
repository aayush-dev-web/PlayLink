alter table public.playlink_moderation_actions
  add column if not exists voided_at timestamptz;

create table if not exists public.playlink_moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique references public.playlink_moderation_actions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  appeal_details text not null check (char_length(btrim(appeal_details)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'upheld', 'reversed')),
  admin_response text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create index if not exists playlink_moderation_appeals_status_created_idx
  on public.playlink_moderation_appeals (status, created_at desc);

alter table public.playlink_moderation_appeals enable row level security;
revoke all on public.playlink_moderation_appeals from anon, authenticated;
grant select on public.playlink_moderation_appeals to authenticated;

drop policy if exists "Users and admins can read moderation appeals" on public.playlink_moderation_appeals;
create policy "Users and admins can read moderation appeals"
  on public.playlink_moderation_appeals for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_playlink_admin()));

create or replace function public.submit_playlink_warning_appeal(
  p_action_id uuid,
  p_appeal_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  appeal_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'sign_in_required';
  end if;
  if char_length(btrim(coalesce(p_appeal_details, ''))) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_appeal_details';
  end if;
  if not exists (
    select 1
    from public.playlink_moderation_actions a
    where a.id = p_action_id
      and a.target_user_id = actor_id
      and a.action_type = 'warning'
      and a.voided_at is null
  ) then
    raise exception using errcode = '22023', message = 'warning_not_appealable';
  end if;

  insert into public.playlink_moderation_appeals (action_id, user_id, appeal_details)
  values (p_action_id, actor_id, trim(p_appeal_details))
  returning id into appeal_id;
  return appeal_id;
end;
$$;

revoke all on function public.submit_playlink_warning_appeal(uuid, text) from public, anon;
grant execute on function public.submit_playlink_warning_appeal(uuid, text) to authenticated;

create or replace function public.get_my_playlink_warning_appeals()
returns table (
  action_id uuid,
  action_number integer,
  reason text,
  action_created_at timestamptz,
  appeal_id uuid,
  appeal_details text,
  appeal_status text,
  admin_response text,
  appeal_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.action_number, a.reason, a.created_at,
    appeal.id, appeal.appeal_details, appeal.status, appeal.admin_response, appeal.created_at
  from public.playlink_moderation_actions a
  left join public.playlink_moderation_appeals appeal on appeal.action_id = a.id
    and appeal.user_id = (select auth.uid())
  where a.target_user_id = (select auth.uid())
    and a.action_type = 'warning'
    and a.voided_at is null
  order by a.created_at desc;
$$;

revoke all on function public.get_my_playlink_warning_appeals() from public, anon;
grant execute on function public.get_my_playlink_warning_appeals() to authenticated;

create or replace function public.admin_review_playlink_warning_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_response text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  appeal_row public.playlink_moderation_appeals%rowtype;
  action_row public.playlink_moderation_actions%rowtype;
  restriction_count integer;
  message_body text;
begin
  if actor_id is null or not public.is_playlink_admin() then
    raise exception using errcode = '42501', message = 'admin_access_required';
  end if;
  if p_decision is null or p_decision not in ('uphold', 'reverse') then
    raise exception using errcode = '22023', message = 'invalid_appeal_decision';
  end if;
  if char_length(coalesce(p_response, '')) > 2000 then
    raise exception using errcode = '22023', message = 'appeal_response_too_long';
  end if;

  select * into appeal_row
  from public.playlink_moderation_appeals
  where id = p_appeal_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'appeal_not_found';
  end if;
  if appeal_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'appeal_already_reviewed';
  end if;

  select * into action_row
  from public.playlink_moderation_actions
  where id = appeal_row.action_id
  for update;
  if not found or action_row.action_type <> 'warning' or action_row.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'warning_not_appealable';
  end if;

  if p_decision = 'reverse' then
    select action_count into restriction_count
    from public.playlink_user_restrictions
    where user_id = appeal_row.user_id
    for update;
    if restriction_count is null or restriction_count <> action_row.action_number then
      raise exception using errcode = 'P0001', message = 'later_sanctions_prevent_warning_reversal';
    end if;

    update public.playlink_moderation_actions
    set voided_at = now()
    where id = action_row.id;
    update public.playlink_user_restrictions
    set action_count = greatest(action_count - 1, 0), updated_at = now()
    where user_id = appeal_row.user_id;
  end if;

  update public.playlink_moderation_appeals
  set status = case when p_decision = 'reverse' then 'reversed' else 'upheld' end,
      admin_response = nullif(trim(coalesce(p_response, '')), ''),
      reviewed_at = now(),
      reviewed_by = actor_id
  where id = p_appeal_id;

  message_body := case
    when p_decision = 'reverse' then format(
      E'Your appeal of warning %s was approved. The warning has been removed from your active moderation count.\n\nPlayLink team response: %s',
      action_row.action_number, coalesce(nullif(trim(p_response), ''), 'Your appeal was accepted.')
    )
    else format(
      E'Your appeal of warning %s was reviewed and the warning remains in effect.\n\nPlayLink team response: %s',
      action_row.action_number, coalesce(nullif(trim(p_response), ''), 'The warning was upheld.')
    )
  end;

  insert into public.player_inbox_messages (user_id, subject, body)
  values (appeal_row.user_id, 'Appeal decision', message_body);

  return jsonb_build_object('appeal_id', p_appeal_id, 'decision', p_decision);
end;
$$;

revoke all on function public.admin_review_playlink_warning_appeal(uuid, text, text) from public, anon;
grant execute on function public.admin_review_playlink_warning_appeal(uuid, text, text) to authenticated;
