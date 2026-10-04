create table if not exists public.venue_conversations (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.owner_venues(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  player_name text not null default 'PlayLink player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_conversations_participant_check check (owner_id <> player_id),
  constraint venue_conversations_venue_player_unique unique (venue_id, player_id)
);

create table if not exists public.venue_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.venue_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists venue_conversations_owner_updated_idx
  on public.venue_conversations(owner_id, updated_at desc);
create index if not exists venue_conversations_player_updated_idx
  on public.venue_conversations(player_id, updated_at desc);
create index if not exists venue_messages_conversation_created_idx
  on public.venue_messages(conversation_id, created_at);

alter table public.venue_conversations enable row level security;
alter table public.venue_messages enable row level security;

revoke all on public.venue_conversations, public.venue_messages from anon, authenticated;
grant select on public.venue_conversations, public.venue_messages to authenticated;
grant insert on public.venue_messages to authenticated;

drop policy if exists "Participants can read their venue conversations" on public.venue_conversations;
drop policy if exists "Participants can read conversation messages" on public.venue_messages;
drop policy if exists "Participants can send conversation messages" on public.venue_messages;

create policy "Participants can read their venue conversations"
  on public.venue_conversations for select
  to authenticated
  using (owner_id = (select auth.uid()) or player_id = (select auth.uid()));

create policy "Participants can read conversation messages"
  on public.venue_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.venue_conversations
      where id = conversation_id
        and (owner_id = (select auth.uid()) or player_id = (select auth.uid()))
    )
  );

create policy "Participants can send conversation messages"
  on public.venue_messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.venue_conversations
      where id = conversation_id
        and (owner_id = (select auth.uid()) or player_id = (select auth.uid()))
    )
  );

create or replace function public.start_venue_conversation(
  requested_venue_id uuid,
  requested_player_name text default 'PlayLink player'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  venue_owner_id uuid;
  v_conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to message a venue owner.' using errcode = '42501';
  end if;

  select owner_id into venue_owner_id
  from public.owner_venues
  where id = requested_venue_id and is_active;

  if venue_owner_id is null then
    raise exception 'This venue is not available for messaging.' using errcode = 'P0002';
  end if;

  if venue_owner_id = auth.uid() then
    raise exception 'You cannot start a conversation with your own venue.' using errcode = '42501';
  end if;

  insert into public.venue_conversations (venue_id, owner_id, player_id, player_name)
  values (
    requested_venue_id,
    venue_owner_id,
    auth.uid(),
    coalesce(nullif(left(trim(requested_player_name), 120), ''), 'PlayLink player')
  )
  on conflict (venue_id, player_id) do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select id into v_conversation_id
    from public.venue_conversations
    where venue_id = requested_venue_id and player_id = auth.uid();
  end if;

  return v_conversation_id;
end;
$$;

revoke all on function public.start_venue_conversation(uuid, text) from public, anon;
grant execute on function public.start_venue_conversation(uuid, text) to authenticated;

create or replace function public.touch_venue_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.venue_conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.touch_venue_conversation() from public, anon, authenticated;

drop trigger if exists venue_message_updates_conversation on public.venue_messages;
create trigger venue_message_updates_conversation
  after insert on public.venue_messages
  for each row execute function public.touch_venue_conversation();
