create table if not exists public.venue_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.venue_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null constraint venue_message_reaction_emoji_check check (emoji in (
    '👍', '❤️', '😂', '🙌', '⚽', '🏏', '🔥', '👏', '😍', '🙏', '💪', '🎉',
    '😁', '😮', '😢', '😡', '💯', '🤝', '✅', '❌', '🏆', '🥅', '🥳', '🤩',
    '👀', '💚', '🫡', '😅'
  )),
  created_at timestamptz not null default now(),
  constraint venue_message_reaction_unique unique (message_id, user_id, emoji)
);

create index if not exists venue_message_reactions_message_id_idx
  on public.venue_message_reactions(message_id);

alter table public.venue_message_reactions enable row level security;
revoke all on public.venue_message_reactions from anon, authenticated;
grant select, insert, delete on public.venue_message_reactions to authenticated;

drop policy if exists "Conversation participants can read message reactions" on public.venue_message_reactions;
create policy "Conversation participants can read message reactions"
  on public.venue_message_reactions for select
  to authenticated
  using (
    exists (
      select 1
      from public.venue_messages message
      join public.venue_conversations conversation on conversation.id = message.conversation_id
      where message.id = venue_message_reactions.message_id
        and (conversation.owner_id = (select auth.uid()) or conversation.player_id = (select auth.uid()))
    )
  );

drop policy if exists "Conversation participants can add their own reactions" on public.venue_message_reactions;
create policy "Conversation participants can add their own reactions"
  on public.venue_message_reactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.venue_messages message
      join public.venue_conversations conversation on conversation.id = message.conversation_id
      where message.id = venue_message_reactions.message_id
        and (conversation.owner_id = (select auth.uid()) or conversation.player_id = (select auth.uid()))
    )
  );

drop policy if exists "Users can remove their own message reactions" on public.venue_message_reactions;
create policy "Users can remove their own message reactions"
  on public.venue_message_reactions for delete
  to authenticated
  using (user_id = (select auth.uid()));
