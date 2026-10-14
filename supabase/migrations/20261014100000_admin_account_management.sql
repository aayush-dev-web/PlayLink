do $$
declare
  admin_user_id uuid;
begin
  select id into admin_user_id
  from auth.users
  where lower(email) = 'aayushfourth@gmail.com';

  if admin_user_id is not null then
    update public.profiles
    set username = case
          when lower(username) = 'aayueh'
            and not exists (
              select 1 from public.profiles existing
              where lower(existing.username) = 'aayush'
                and existing.id <> admin_user_id
            )
            then 'aayush'
          else username
        end,
        display_name = case when lower(display_name) = 'aayueh' then 'aayush' else display_name end
    where id = admin_user_id;

    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || case
        when lower(coalesce(raw_user_meta_data ->> 'username', '')) = 'aayueh'
          and not exists (
            select 1 from public.profiles existing
            where lower(existing.username) = 'aayush'
              and existing.id <> admin_user_id
          )
          then jsonb_build_object('username', 'aayush')
        else '{}'::jsonb
      end
      || case
        when lower(coalesce(raw_user_meta_data ->> 'full_name', '')) = 'aayueh'
          then jsonb_build_object('full_name', 'aayush')
        else '{}'::jsonb
      end
    where id = admin_user_id;
  end if;
end;
$$;
