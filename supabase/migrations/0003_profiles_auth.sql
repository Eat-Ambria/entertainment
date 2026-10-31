-- =============================================================================
-- 0003_profiles_auth.sql — profiles, phone login, account creation helpers.
--
-- Login = 10-digit phone + password. Supabase Auth's phone provider needs an SMS
-- provider, so the phone is mapped to an internal email `<phone>@phone.invalid`
-- (never shown in the UI). RLS relies on auth.uid(), so we must use Supabase Auth.
--
-- Accounts are invite-only: the owner runs, in the SQL Editor,
--     select public.create_app_user('9876543210', 'Full Name');
-- which creates the login with the default password; the user must change it
-- on first login (profiles.must_change_password).
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Phone helpers ---------------------------------------------------
-- Keeps the last 10 digits after stripping +91 / 0 / spaces / dashes.
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^[6-9][0-9]{9}$' then d
    when d ~ '^91[6-9][0-9]{9}$' then substr(d, 3)
    when d ~ '^0[6-9][0-9]{9}$' then substr(d, 2)
    else null
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) s;
$$;

create or replace function public.phone_login_email(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.normalize_phone(p_phone) || '@phone.invalid';
$$;

-- ---------- Profiles --------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  phone                text unique check (phone ~ '^[6-9][0-9]{9}$'),
  full_name            text check (full_name is null or length(full_name) <= 120),
  business_name        text check (business_name is null or length(business_name) <= 120),
  logo_path            text,
  contact_line         text check (contact_line is null or length(contact_line) <= 200),
  lms_logged_user_id   text check (lms_logged_user_id is null or lms_logged_user_id ~ '^[0-9]{1,10}$'),
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- New auth user -> profile + own option lists ----------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  v_phone := coalesce(
    public.normalize_phone(new.phone),
    case when new.email ilike '%@phone.invalid' then public.normalize_phone(split_part(new.email, '@', 1)) end
  );

  insert into public.profiles (id, phone, full_name, must_change_password)
  values (new.id, v_phone, nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), true)
  on conflict (id) do nothing;

  perform public.seed_default_options(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Owner-only account helpers (SQL Editor only) ---------------------
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

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  return v_id;
end;
$$;

-- Owner resets a forgotten password back to the default; user must change it again.
create or replace function public.reset_user_password(p_phone text, p_password text default 'ambria@123')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters (Supabase minimum).';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where email = public.phone_login_email(p_phone)
  returning id into v_id;

  if v_id is null then
    raise exception 'No user with phone %', p_phone;
  end if;

  update public.profiles set must_change_password = true where id = v_id;
end;
$$;

revoke all on function public.create_app_user(text, text, text) from public, anon, authenticated;
revoke all on function public.reset_user_password(text, text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------- Called by the app after a successful password change ------------
create or replace function public.mark_password_changed()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.profiles set must_change_password = false where id = auth.uid();
end;
$$;

revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;
grant execute on function public.normalize_phone(text) to anon, authenticated;
grant execute on function public.phone_login_email(text) to anon, authenticated;
