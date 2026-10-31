-- =============================================================================
-- 0008_block_signups.sql — database-level sign-up lock.
-- New rows in auth.users are only allowed when created through
-- public.create_app_user(), which sets a transaction-local flag. Any public
-- sign-up (or Dashboard "Add user") is rejected, even if the Dashboard toggle
-- "Allow new users to sign up" is left on.
-- Safe to re-run (idempotent).
-- =============================================================================

create or replace function public.block_public_signups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_user_create', true), '') <> 'on' then
    raise exception 'Sign-ups are disabled. Accounts are created by the administrator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.block_public_signups() from public, anon, authenticated;

drop trigger if exists block_public_signups on auth.users;
create trigger block_public_signups
  before insert on auth.users
  for each row execute function public.block_public_signups();

-- Re-define create_app_user so it opens the lock only for its own insert.
create or replace function public.create_app_user(
  p_phone     text,
  p_full_name text,
  p_password  text default 'ambria@123'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_email text;
  v_id    uuid := gen_random_uuid();
begin
  if v_phone is null then
    raise exception 'Invalid phone number: %. Use a 10-digit Indian mobile number.', p_phone;
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters (Supabase minimum).';
  end if;

  v_email := v_phone || '@phone.invalid';
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'A user with phone % already exists.', v_phone;
  end if;

  perform set_config('app.allow_user_create', 'on', true);

  -- Token columns must be '' (not NULL) or Supabase Auth fails to sign the user in.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'phone', v_phone),
    now(), now(), '', '', '', ''
  );

  perform set_config('app.allow_user_create', 'off', true);

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  return v_id;
end;
$$;
revoke all on function public.create_app_user(text, text, text) from public, anon, authenticated;
