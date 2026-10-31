-- =============================================================================
-- supabase-shim.sql — TEST ONLY. Recreates the small part of Supabase that our
-- migrations depend on (roles, auth.users/identities, auth.uid(), storage), so
-- the real migration files can run inside PGlite during `npm test`.
-- Never run this against a real Supabase project.
-- =============================================================================

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

grant usage on schema public, extensions, auth, storage to anon, authenticated;

-- Same lookup order Supabase uses for the JWT subject.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated;

create table if not exists auth.users (
  instance_id            uuid,
  id                     uuid primary key,
  aud                    varchar(255),
  role                   varchar(255),
  email                  varchar(255) unique,
  encrypted_password     varchar(255),
  email_confirmed_at     timestamptz,
  raw_app_meta_data      jsonb,
  raw_user_meta_data     jsonb,
  created_at             timestamptz,
  updated_at             timestamptz,
  confirmation_token     varchar(255),
  recovery_token         varchar(255),
  email_change_token_new varchar(255),
  email_change           varchar(255),
  phone                  text unique
);

create table if not exists auth.identities (
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider_id     text not null,
  identity_data   jsonb not null,
  provider        text not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  unique (provider_id, provider)
);

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text,
  owner     uuid
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end;
$$;
grant execute on function storage.foldername(text) to authenticated;
