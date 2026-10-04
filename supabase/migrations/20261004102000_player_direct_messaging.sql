create table if not exists public.player_direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references public.profiles(id) on delete cascade,
  user_two_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_direct_conversations_ordered_check check (user_one_id < user_two_id),
  constraint player_direct_conversations_pair_unique unique (user_one_id, user_two_id)
);

create table if not exists public.player_direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.player_direct_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists player_direct_conversations_user_one_updated_idx
  on public.player_direct_conversations (user_one_id, updated_at desc);
create index if not exists player_direct_conversations_user_two_updated_idx
  on public.player_direct_conversations (user_two_id, updated_at desc);
create index if not exists player_direct_messages_conversation_created_idx
  on public.player_direct_messages (conversation_id, created_at);

alter table public.player_direct_conversations enable row level security;
alter table public.player_direct_messages enable row level security;

revoke all on public.player_direct_conversations, public.player_direct_messages from anon, authenticated;
grant select on public.player_direct_conversations, public.player_direct_messages to authenticated;
grant insert on public.player_direct_messages to authenticated;

drop policy if exists "Participants can read player direct conversations" on public.player_direct_conversations;
create policy "Participants can read player direct conversations"
  on public.player_direct_conversations for select
  to authenticated
  using (user_one_id = (select auth.uid()) or user_two_id = (select auth.uid()));

drop policy if exists "Participants can read player direct messages" on public.player_direct_messages;
create policy "Participants can read player direct messages"
  on public.player_direct_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.player_direct_conversations conversation
      where conversation.id = conversation_id
        and ((select auth.uid()) = conversation.user_one_id or (select auth.uid()) = conversation.user_two_id)
    )
  );

drop policy if exists "Participants can send player direct messages" on public.player_direct_messages;
create policy "Participants can send player direct messages"
  on public.player_direct_messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.player_direct_conversations conversation
      where conversation.id = conversation_id
        and ((select auth.uid()) = conversation.user_one_id or (select auth.uid()) = conversation.user_two_id)
    )
  );

create or replace function public.start_player_conversation(requested_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in to message a player.' using errcode = '42501';
  end if;
  if requested_player_id is null or requested_player_id = current_user_id then
    raise exception 'Choose another player to start a conversation.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.player_listings listing
    where listing.user_id = requested_player_id
      and listing.is_active
  ) then
    raise exception 'This player profile is no longer available for messaging.' using errcode = 'P0002';
  end if;

  insert into public.player_direct_conversations (user_one_id, user_two_id)
  values (least(current_user_id, requested_player_id), greatest(current_user_id, requested_player_id))
  on conflict (user_one_id, user_two_id) do nothing
  returning id into conversation_id;

  if conversation_id is null then
    select conversation.id into conversation_id
    from public.player_direct_conversations conversation
    where conversation.user_one_id = least(current_user_id, requested_player_id)
      and conversation.user_two_id = greatest(current_user_id, requested_player_id);
  end if;

  return conversation_id;
end;
$$;

revoke all on function public.start_player_conversation(uuid) from public, anon;
grant execute on function public.start_player_conversation(uuid) to authenticated;

create or replace function public.touch_player_direct_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.player_direct_conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.touch_player_direct_conversation() from public, anon, authenticated;

drop trigger if exists player_direct_message_updates_conversation on public.player_direct_messages;
create trigger player_direct_message_updates_conversation
  after insert on public.player_direct_messages
  for each row execute function public.touch_player_direct_conversation();
