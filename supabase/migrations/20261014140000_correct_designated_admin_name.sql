do $$
declare
  admin_user_id uuid;
begin
  select id into admin_user_id
  from auth.users
  where lower(email) = 'aayushfourth@gmail.com';

  if admin_user_id is null then
    raise notice 'The designated PlayLink admin account was not found; no name was changed.';
    return;
  end if;

  update public.profiles
  set username = case
        when not exists (
            select 1 from public.profiles existing
            where lower(existing.username) = 'aayush'
              and existing.id <> admin_user_id
          )
          then 'aayush'
        else username
      end,
      display_name = 'aayush'
  where id = admin_user_id;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || case
      when not exists (
          select 1 from public.profiles existing
          where lower(existing.username) = 'aayush'
            and existing.id <> admin_user_id
        )
        then jsonb_build_object('username', 'aayush')
      else '{}'::jsonb
    end
    || jsonb_build_object('full_name', 'aayush')
  where id = admin_user_id;
end;
$$;
