create or replace function public.can_manage_playlink_events(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.account_type in ('player', 'venue_owner', 'team_organizer')
  );
$$;

revoke all on function public.can_manage_playlink_events(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_playlink_events(uuid) to authenticated;
