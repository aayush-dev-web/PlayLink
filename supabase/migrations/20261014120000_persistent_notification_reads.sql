create table if not exists public.playlink_notification_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_id text not null check (char_length(notification_id) between 1 and 256),
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

alter table public.playlink_notification_reads enable row level security;
revoke all on public.playlink_notification_reads from anon, authenticated;
grant select, insert, update on public.playlink_notification_reads to authenticated;

drop policy if exists "Users can read their notification receipts" on public.playlink_notification_reads;
create policy "Users can read their notification receipts"
  on public.playlink_notification_reads for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can mark their own notifications read" on public.playlink_notification_reads;
create policy "Users can mark their own notifications read"
  on public.playlink_notification_reads for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their notification receipts" on public.playlink_notification_reads;
create policy "Users can update their notification receipts"
  on public.playlink_notification_reads for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
