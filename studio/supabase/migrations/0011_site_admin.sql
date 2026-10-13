-- Sono Studio · Phase 9.2 (Client admin panel)
--
-- A client signs in at /admin with a login you create for them, and can edit
-- their site's words, photos, products, services and hours, and look after
-- their orders and bookings. They never get a studio account: everything they
-- do goes through the functions below, each of which checks their session and
-- only ever touches their own project.
--
-- Live sites show the project's published version, read from the studio, so
-- a client's saved changes go live without a redeploy.

create extension if not exists pgcrypto with schema extensions;

-- The version a live site shows. Set when you deploy, and when a client saves.
alter table public.projects add column if not exists published_version integer;

create table public.site_admins (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  email            text not null unique check (email = lower(email) and char_length(email) between 3 and 120),
  name             text not null default '' check (char_length(name) <= 80),
  password_hash    text not null,
  failed_count     integer not null default 0,
  locked_until     timestamptz,
  last_sign_in_at  timestamptz,
  created_at       timestamptz not null default now()
);
create index site_admins_project_idx on public.site_admins (project_id);

alter table public.site_admins enable row level security;
create policy "owner reads site admins" on public.site_admins for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner removes site admins" on public.site_admins for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Signed-in client sessions; only a hash of each token is kept.
create table public.admin_sessions (
  token_hash  text primary key,
  admin_id    uuid not null references public.site_admins (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
alter table public.admin_sessions enable row level security;

-- One-time permission to upload a single photo to a given path.
create table public.admin_uploads (
  path        text primary key,
  project_id  uuid not null references public.projects (id) on delete cascade,
  expires_at  timestamptz not null
);
alter table public.admin_uploads enable row level security;

/* ---------- You, the owner ---------- */

-- Creates a client login, or sets a new password for one. The password is hashed here.
create or replace function public.set_site_admin(p_project uuid, p_email text, p_name text, p_password text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  e text := lower(trim(p_email));
  existing public.site_admins;
  new_id uuid;
begin
  if not exists (select 1 from public.projects where id = p_project and owner_id = auth.uid()) then
    raise exception 'not your project';
  end if;
  if char_length(coalesce(p_password, '')) < 10 then raise exception 'password too short'; end if;
  select * into existing from public.site_admins where email = e;
  if existing.id is not null and existing.project_id <> p_project then raise exception 'email in use'; end if;
  if existing.id is not null then
    update public.site_admins
       set name = left(coalesce(p_name, ''), 80), password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), failed_count = 0, locked_until = null
     where id = existing.id;
    -- A new password signs out everywhere.
    delete from public.admin_sessions where admin_id = existing.id;
    return existing.id;
  end if;
  insert into public.site_admins (owner_id, project_id, email, name, password_hash)
    values (auth.uid(), p_project, e, left(coalesce(p_name, ''), 80), extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
    returning id into new_id;
  return new_id;
end;
$$;

/* ---------- The client ---------- */

-- Checks a session token; the admin row, or nothing.
create or replace function public.admin_of(p_token text)
returns public.site_admins
language sql
stable
security definer
set search_path = public
as $$
  select a.* from public.admin_sessions s join public.site_admins a on a.id = s.admin_id
   where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and s.expires_at > now()
$$;

-- Signs in with email and password. Five wrong passwords lock the login for 15 minutes.
create or replace function public.admin_sign_in(p_email text, p_password text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a public.site_admins;
  token text;
begin
  select * into a from public.site_admins where email = lower(trim(p_email));
  if a.id is null then
    -- Same work as a real check, so a wrong email takes as long as a wrong password.
    perform extensions.crypt(coalesce(p_password, ''), extensions.gen_salt('bf', 10));
    return null;
  end if;
  if a.locked_until is not null and a.locked_until > now() then return 'locked'; end if;
  if a.password_hash <> extensions.crypt(coalesce(p_password, ''), a.password_hash) then
    update public.site_admins
       set failed_count = case when failed_count + 1 >= 5 then 0 else failed_count + 1 end,
           locked_until = case when failed_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end
     where id = a.id;
    return null;
  end if;
  update public.site_admins set failed_count = 0, locked_until = null, last_sign_in_at = now() where id = a.id;
  delete from public.admin_sessions where admin_id = a.id and expires_at < now();
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.admin_sessions (token_hash, admin_id, project_id, expires_at)
    values (encode(extensions.digest(token, 'sha256'), 'hex'), a.id, a.project_id, now() + interval '30 days');
  return token;
end;
$$;

create or replace function public.admin_sign_out(p_token text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.admin_sessions where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- Who is signed in, their site, and its latest content.
create or replace function public.admin_me(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.site_admins;
  p public.projects;
  v public.site_versions;
begin
  a := public.admin_of(p_token);
  if a.id is null then return null; end if;
  select * into p from public.projects where id = a.project_id;
  select * into v from public.site_versions where project_id = p.id order by version desc limit 1;
  return jsonb_build_object(
    'name', a.name, 'email', a.email, 'projectId', p.id, 'projectName', p.name, 'liveUrl', p.live_url,
    'pitchSlug', p.pitch_slug, 'version', v.version, 'config', v.config
  );
end;
$$;

-- Saves the client's changes as a new version and publishes it. Refused if
-- the site changed since they opened it, so nobody's edits are lost.
create or replace function public.admin_save(p_token text, p_base_version integer, p_config jsonb, p_summary text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a public.site_admins;
  p public.projects;
  next_version integer;
begin
  a := public.admin_of(p_token);
  if a.id is null then raise exception 'not signed in'; end if;
  select * into p from public.projects where id = a.project_id for update;
  if coalesce(p.current_version, 0) <> coalesce(p_base_version, 0) then raise exception 'changed meanwhile'; end if;
  next_version := coalesce(p.current_version, 0) + 1;
  insert into public.site_versions (owner_id, project_id, version, config, summary)
    values (p.owner_id, p.id, next_version, p_config, left(coalesce(p_summary, 'Edited by the client'), 300));
  update public.projects set current_version = next_version, published_version = next_version where id = p.id;
  return next_version;
end;
$$;

create or replace function public.admin_orders(p_token text)
returns setof public.orders
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.site_admins;
begin
  a := public.admin_of(p_token);
  if a.id is null then return; end if;
  -- Paid orders only; abandoned checkouts are noise for the client.
  return query select * from public.orders where project_id = a.project_id and status <> 'pending' and status <> 'failed' order by created_at desc limit 200;
end;
$$;

create or replace function public.admin_set_order_status(p_token text, p_id uuid, p_status text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a public.site_admins;
begin
  a := public.admin_of(p_token);
  if a.id is null or p_status not in ('paid', 'fulfilled', 'cancelled') then return false; end if;
  update public.orders set status = p_status where id = p_id and project_id = a.project_id and status in ('paid', 'fulfilled', 'cancelled');
  return found;
end;
$$;

create or replace function public.admin_bookings(p_token text, p_since timestamptz)
returns setof public.bookings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.site_admins;
begin
  a := public.admin_of(p_token);
  if a.id is null then return; end if;
  return query select * from public.bookings where project_id = a.project_id and end_at >= p_since and status <> 'held' order by start_at limit 300;
end;
$$;

create or replace function public.admin_set_booking_status(p_token text, p_id uuid, p_status text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a public.site_admins;
begin
  a := public.admin_of(p_token);
  if a.id is null or p_status not in ('confirmed', 'done', 'no_show', 'cancelled') then return false; end if;
  update public.bookings set status = p_status where id = p_id and project_id = a.project_id and status <> 'held';
  return found;
end;
$$;

-- The site's photos, for choosing one.
create or replace function public.admin_assets(p_token text)
returns setof public.assets
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.site_admins;
begin
  a := public.admin_of(p_token);
  if a.id is null then return; end if;
  return query select * from public.assets where project_id = a.project_id and kind = 'photo' order by created_at desc limit 200;
end;
$$;

-- A path the client may upload one photo to in the next 10 minutes.
create or replace function public.admin_upload_ticket(p_token text, p_ext text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a public.site_admins;
  path text;
begin
  a := public.admin_of(p_token);
  if a.id is null or p_ext not in ('jpg', 'png', 'webp') then return null; end if;
  if (select count(*) from public.admin_uploads where project_id = a.project_id and expires_at > now()) >= 20 then return null; end if;
  path := 'admin/' || a.project_id || '/' || gen_random_uuid() || '.' || p_ext;
  insert into public.admin_uploads (path, project_id, expires_at) values (path, a.project_id, now() + interval '10 minutes');
  return path;
end;
$$;

-- Records an uploaded photo in the site's library (the ticket is used up).
create or replace function public.admin_record_upload(p_token text, p_path text, p_url text, p_alt text, p_width integer, p_height integer)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a public.site_admins;
  p public.projects;
  new_id uuid;
begin
  a := public.admin_of(p_token);
  if a.id is null then return null; end if;
  delete from public.admin_uploads where path = p_path and project_id = a.project_id;
  if not found then return null; end if;
  select * into p from public.projects where id = a.project_id;
  insert into public.assets (owner_id, project_id, kind, source, url, storage_path, alt, width, height)
    values (p.owner_id, p.id, 'photo', 'upload', p_url, p_path, left(coalesce(p_alt, ''), 200), p_width, p_height)
    returning id into new_id;
  return new_id;
end;
$$;

-- Used by the storage rule below: is there an unexpired ticket for this path?
create or replace function public.admin_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_uploads where path = p_name and expires_at > now())
$$;

create policy "client uploads with a ticket" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'admin' and public.admin_upload_allowed(name));

/* ---------- Live sites ---------- */

-- The content a deployed site shows: its published version. Public, as the site itself is.
create or replace function public.published_config(p_project uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select v.config from public.projects p join public.site_versions v on v.project_id = p.id and v.version = p.published_version
   where p.id = p_project
$$;

revoke all on function public.set_site_admin(uuid, text, text, text) from public;
revoke all on function public.admin_of(text) from public;
revoke all on function public.admin_sign_in(text, text) from public;
revoke all on function public.admin_sign_out(text) from public;
revoke all on function public.admin_me(text) from public;
revoke all on function public.admin_save(text, integer, jsonb, text) from public;
revoke all on function public.admin_orders(text) from public;
revoke all on function public.admin_set_order_status(text, uuid, text) from public;
revoke all on function public.admin_bookings(text, timestamptz) from public;
revoke all on function public.admin_set_booking_status(text, uuid, text) from public;
revoke all on function public.admin_assets(text) from public;
revoke all on function public.admin_upload_ticket(text, text) from public;
revoke all on function public.admin_record_upload(text, text, text, text, integer, integer) from public;
revoke all on function public.admin_upload_allowed(text) from public;
revoke all on function public.published_config(uuid) from public;
grant execute on function public.set_site_admin(uuid, text, text, text) to authenticated;
grant execute on function public.admin_sign_in(text, text) to anon, authenticated;
grant execute on function public.admin_sign_out(text) to anon, authenticated;
grant execute on function public.admin_me(text) to anon, authenticated;
grant execute on function public.admin_save(text, integer, jsonb, text) to anon, authenticated;
grant execute on function public.admin_orders(text) to anon, authenticated;
grant execute on function public.admin_set_order_status(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_bookings(text, timestamptz) to anon, authenticated;
grant execute on function public.admin_set_booking_status(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_assets(text) to anon, authenticated;
grant execute on function public.admin_upload_ticket(text, text) to anon, authenticated;
grant execute on function public.admin_record_upload(text, text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.admin_upload_allowed(text) to anon, authenticated;
grant execute on function public.published_config(uuid) to anon, authenticated;
