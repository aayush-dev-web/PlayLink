create table public.playlink_terms_acceptances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  terms_version text not null check (terms_version = '2026-10-12'),
  accepted_at timestamptz not null default now(),
  submitted_at timestamptz not null
);

alter table public.playlink_terms_acceptances enable row level security;
revoke all on public.playlink_terms_acceptances from public, anon, authenticated, service_role;

create or replace function public.validate_playlink_terms_acceptance(p_metadata jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  submitted_at timestamptz;
  server_time timestamptz := now();
  submitted_at_text text;
begin
  if p_metadata ->> 'terms_accepted' is distinct from 'true'
    or p_metadata ->> 'terms_version' is distinct from '2026-10-12' then
    raise exception 'Accept the current PlayLink Terms and Conditions to continue.'
      using errcode = 'check_violation';
  end if;

  submitted_at_text := p_metadata ->> 'terms_accepted_at';
  if submitted_at_text is null
    or submitted_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'A valid Terms acceptance timestamp is required.'
      using errcode = 'check_violation';
  end if;

  begin
    submitted_at := submitted_at_text::timestamptz;
  exception
    when others then
      raise exception 'A valid Terms acceptance timestamp is required.'
        using errcode = 'check_violation';
  end;

  if submitted_at < server_time - interval '30 minutes'
    or submitted_at > server_time + interval '5 minutes' then
    raise exception 'The Terms acceptance timestamp is outside the allowed registration window.'
      using errcode = 'check_violation';
  end if;

  return submitted_at;
end;
$$;

revoke all on function public.validate_playlink_terms_acceptance(jsonb) from public, anon, authenticated, service_role;

create or replace function public.record_playlink_signup_terms_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_at timestamptz;
begin
  if new.raw_app_meta_data ->> 'provider' = 'google'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
    or new.raw_app_meta_data ->> 'playlink_managed_creation' = 'true' then
    return new;
  end if;

  accepted_at := public.validate_playlink_terms_acceptance(new.raw_user_meta_data);
  insert into public.playlink_terms_acceptances (user_id, terms_version, submitted_at)
  values (new.id, '2026-10-12', accepted_at);
  return new;
end;
$$;

revoke all on function public.record_playlink_signup_terms_acceptance() from public, anon, authenticated, service_role;

drop trigger if exists playlink_record_signup_terms_acceptance on auth.users;
create trigger playlink_record_signup_terms_acceptance
  after insert on auth.users
  for each row
  execute function public.record_playlink_signup_terms_acceptance();

alter function public.complete_google_profile(text, text, text, text, jsonb)
  rename to complete_google_profile_without_terms_validation;

revoke all on function public.complete_google_profile_without_terms_validation(text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;

create function public.complete_google_profile(
  requested_username text,
  requested_display_name text,
  requested_phone text,
  requested_account_type text,
  requested_owner_venue jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_metadata jsonb;
  accepted_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Sign in before completing registration.';
  end if;

  select u.raw_user_meta_data
  into current_user_metadata
  from auth.users u
  where u.id = current_user_id;

  accepted_at := public.validate_playlink_terms_acceptance(current_user_metadata);

  perform public.complete_google_profile_without_terms_validation(
    requested_username,
    requested_display_name,
    requested_phone,
    requested_account_type,
    requested_owner_venue
  );

  insert into public.playlink_terms_acceptances (user_id, terms_version, submitted_at)
  values (current_user_id, '2026-10-12', accepted_at);
end;
$$;

revoke all on function public.complete_google_profile(text, text, text, text, jsonb)
  from public, anon, service_role;
grant execute on function public.complete_google_profile(text, text, text, text, jsonb)
  to authenticated;
