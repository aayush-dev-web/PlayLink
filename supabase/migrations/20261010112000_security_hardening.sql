create table if not exists public.playlink_rate_limits (
  bucket_key text primary key check (bucket_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

create index if not exists playlink_rate_limits_window_started_idx
  on public.playlink_rate_limits (window_started_at);

alter table public.playlink_rate_limits enable row level security;
revoke all on public.playlink_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.playlink_rate_limits to service_role;

create or replace function public.consume_playlink_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  current_time timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_key !~ '^[a-f0-9]{64}$'
    or p_limit < 1
    or p_limit > 10000
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_parameters';
  end if;

  delete from public.playlink_rate_limits
  where window_started_at < current_time - interval '1 day';

  insert into public.playlink_rate_limits as existing (bucket_key, window_started_at, request_count)
  values (p_key, current_time, 1)
  on conflict (bucket_key) do update
  set window_started_at = case
        when existing.window_started_at <= current_time - make_interval(secs => p_window_seconds)
          then current_time
        else existing.window_started_at
      end,
      request_count = case
        when existing.window_started_at <= current_time - make_interval(secs => p_window_seconds)
          then 1
        else least(existing.request_count + 1, p_limit)
      end
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$$;

revoke all on function public.consume_playlink_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_playlink_rate_limit(text, integer, integer) to service_role;
