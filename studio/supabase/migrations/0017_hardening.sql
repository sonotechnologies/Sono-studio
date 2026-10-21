-- Sono Studio · Hardening after the full audit
--
-- 1. Internal helpers can no longer be called directly. Supabase grants new
--    functions to anon and authenticated by default, and "revoke … from
--    public" doesn't take that away.
-- 2. Test payments are proven with a secret the database holds per owner (set
--    by the studio server, never readable), not with a hash the caller picks.
-- 3. Booking capacity comes from the site's own settings, and a deposit paid
--    after its 30-minute hold ran out only confirms if the time is still free.
-- 4. Clients edit the live (published) version of their site, never the
--    studio's unpublished draft, and can't move orders or bookings back from
--    cancelled.

/* ---------- 1. Internal helpers ---------- */

revoke execute on function public.live_pitch(text) from anon, authenticated;
revoke execute on function public.busy_times(uuid, timestamptz, timestamptz) from anon, authenticated;
revoke execute on function public.hold_booking(public.projects, text, text, text, text, timestamptz, timestamptz, integer, text, text, numeric, numeric, jsonb, text) from anon, authenticated;
revoke execute on function public.admin_of(text) from anon, authenticated;
revoke execute on function public.sono_ai_owner(text) from anon, authenticated;

/* ---------- 2. Payment proofs ---------- */

-- One secret per studio owner, written by the studio server and never read back.
create table if not exists public.order_secrets (
  owner_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  secret      text not null check (char_length(secret) between 32 and 200),
  updated_at  timestamptz not null default now()
);
alter table public.order_secrets enable row level security;
-- No policies: only the functions below touch it.

create or replace function public.set_order_secret(p_secret text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.order_secrets (owner_id, secret) values (auth.uid(), p_secret)
  on conflict (owner_id) do update set secret = excluded.secret, updated_at = now()
  where public.order_secrets.secret is distinct from excluded.secret
$$;

-- The proof for an order or booking reference: what the studio server works out with the same secret.
create or replace function public.order_proof(p_owner uuid, p_reference text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(extensions.hmac('order:' || p_reference, s.secret, 'sha256'), 'hex') from public.order_secrets s where s.owner_id = p_owner
$$;

create or replace function public.create_pitch_order(
  p_slug text, p_reference text, p_provider text, p_currency text, p_total numeric, p_lines jsonb, p_customer jsonb, p_token_hash text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  p public.projects;
begin
  p := public.live_pitch(p_slug);
  if p.id is null then raise exception 'pitch not available'; end if;
  if not exists (select 1 from public.order_secrets where owner_id = p.owner_id) then raise exception 'payments not ready'; end if;
  if (select count(*) from public.orders where project_id = p.id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many checkouts';
  end if;
  -- p_token_hash is ignored: the proof is checked against the owner's secret when the order is settled.
  insert into public.orders (owner_id, project_id, reference, provider, mode, currency, total, lines, customer, token_hash)
    values (p.owner_id, p.id, p_reference, p_provider, 'test', p_currency, p_total, coalesce(p_lines, '[]'), coalesce(p_customer, '{}'), null);
end;
$$;

create or replace function public.settle_order(p_reference text, p_token text, p_status text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_status not in ('paid', 'failed') then return false; end if;
  update public.orders o
     set status = p_status, paid_at = case when p_status = 'paid' then coalesce(o.paid_at, now()) else o.paid_at end
   where o.reference = p_reference
     and p_token = public.order_proof(o.owner_id, p_reference)
     and o.status in ('pending', 'failed');
  return found;
end;
$$;

/* ---------- 3. Bookings ---------- */

-- How many bookings can share a time: the site's own setting (1 to 20).
create or replace function public.booking_capacity(p_project uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(1, least(20, coalesce((
    select (v.config -> 'bookings' ->> 'capacity')::integer from public.site_versions v where v.project_id = p_project order by v.version desc limit 1
  ), 1)))
$$;

create or replace function public.hold_booking(
  p public.projects, p_mode text, p_reference text, p_service_id text, p_service_name text, p_start timestamptz, p_end timestamptz,
  p_capacity integer, p_provider text, p_currency text, p_deposit numeric, p_price numeric, p_customer jsonb, p_token_hash text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p.id::text));
  if (select count(*) from public.bookings where project_id = p.id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many bookings';
  end if;
  -- At most 3 unpaid holds per customer email, so nobody can block the calendar.
  if (select count(*) from public.bookings b where b.project_id = p.id and b.status = 'held' and b.hold_until > now()
        and lower(b.customer ->> 'email') = lower(coalesce(p_customer ->> 'email', ''))) >= 3 then
    raise exception 'too many bookings';
  end if;
  -- p_capacity is ignored: the site's own setting decides.
  if (select count(*) from public.bookings b where b.project_id = p.id and public.booking_active(b) and b.start_at < p_end and b.end_at > p_start)
     >= public.booking_capacity(p.id) then
    raise exception 'time taken';
  end if;
  insert into public.bookings (owner_id, project_id, reference, service_id, service_name, start_at, end_at, status, hold_until, provider, mode, currency, deposit, price, customer, token_hash)
    values (p.owner_id, p.id, p_reference, p_service_id, p_service_name, p_start, p_end, 'held', now() + interval '30 minutes', p_provider, p_mode, p_currency, p_deposit, p_price, coalesce(p_customer, '{}'), null);
end;
$$;

create or replace function public.create_pitch_booking(
  p_slug text, p_reference text, p_service_id text, p_service_name text, p_start timestamptz, p_end timestamptz,
  p_capacity integer, p_provider text, p_currency text, p_deposit numeric, p_price numeric, p_customer jsonb, p_token_hash text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  p public.projects;
begin
  p := public.live_pitch(p_slug);
  if p.id is null then raise exception 'pitch not available'; end if;
  if not exists (select 1 from public.order_secrets where owner_id = p.owner_id) then raise exception 'payments not ready'; end if;
  perform public.hold_booking(p, 'test', p_reference, p_service_id, p_service_name, p_start, p_end, null, p_provider, p_currency, p_deposit, p_price, p_customer, null);
end;
$$;

-- Confirms a held booking once paid. If the hold ran out and the time was
-- taken meanwhile, it's cancelled with a note to refund the deposit instead.
create or replace function public.confirm_held_booking(b public.bookings)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(b.project_id::text));
  if b.hold_until <= now() and (
    select count(*) from public.bookings x
     where x.project_id = b.project_id and x.id <> b.id and public.booking_active(x) and x.start_at < b.end_at and x.end_at > b.start_at
  ) >= public.booking_capacity(b.project_id) then
    update public.bookings
       set status = 'cancelled', customer = customer || jsonb_build_object('note', 'Paid after the 30-minute hold ran out, when the time had been taken: refund the deposit.')
     where id = b.id and status = 'held';
    return false;
  end if;
  update public.bookings set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()) where id = b.id and status = 'held';
  return found;
end;
$$;

create or replace function public.settle_booking(p_reference text, p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where reference = p_reference and status = 'held';
  if b.id is null or p_token is distinct from public.order_proof(b.owner_id, p_reference) then return false; end if;
  return public.confirm_held_booking(b);
end;
$$;

create or replace function public.confirm_site_booking(p_project uuid, p_key text, p_reference text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  if not exists (select 1 from public.projects where id = p_project and orders_key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex')) then
    return false;
  end if;
  select * into b from public.bookings where project_id = p_project and reference = p_reference and status = 'held';
  if b.id is not null then perform public.confirm_held_booking(b); end if;
  return true;
end;
$$;

/* ---------- 4. Client admin ---------- */

-- Which version a client's edit was made from, so the studio can bring it into its draft.
alter table public.site_versions add column if not exists based_on integer;

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
  -- The live version; the studio's unpublished draft stays the studio's.
  select * into v from public.site_versions where project_id = p.id and version = coalesce(p.published_version, p.current_version);
  if v.id is null then select * into v from public.site_versions where project_id = p.id order by version desc limit 1; end if;
  return jsonb_build_object(
    'name', a.name, 'email', a.email, 'projectId', p.id, 'projectName', p.name, 'liveUrl', p.live_url,
    'pitchSlug', p.pitch_slug, 'version', v.version, 'config', v.config
  );
end;
$$;

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
  live integer;
  next_version integer;
begin
  a := public.admin_of(p_token);
  if a.id is null then raise exception 'not signed in'; end if;
  select * into p from public.projects where id = a.project_id for update;
  live := coalesce(p.published_version, p.current_version, 0);
  if live <> coalesce(p_base_version, 0) then raise exception 'changed meanwhile'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.site_versions where project_id = p.id;
  insert into public.site_versions (owner_id, project_id, version, config, summary, based_on)
    values (p.owner_id, p.id, next_version, p_config, left(coalesce(p_summary, 'Edited by the client'), 300), live);
  update public.projects set current_version = next_version, published_version = next_version where id = p.id;
  return next_version;
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
  -- Cancelled is final: a refunded order can't become paid again from here.
  update public.orders set status = p_status where id = p_id and project_id = a.project_id and status in ('paid', 'fulfilled');
  return found;
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
  -- Cancelled is final (its time may have gone to someone else); held ones are still being paid for.
  update public.bookings set status = p_status where id = p_id and project_id = a.project_id and status in ('confirmed', 'done', 'no_show');
  return found;
end;
$$;

/* ---------- Generation jobs ---------- */

-- Who is running a job's next step: a second request (another tab, a reload) waits instead of doing it twice.
alter table public.generation_jobs add column if not exists lease_until timestamptz;

/* ---------- 5. What a live site shows ---------- */

-- The published content and its version number, so a site built from a newer
-- version (published moments before) keeps its own copy until the studio catches up.
create or replace function public.published_site(p_project uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('version', v.version, 'config', v.config)
    from public.projects p join public.site_versions v on v.project_id = p.id and v.version = p.published_version
   where p.id = p_project
$$;
grant execute on function public.published_site(uuid) to anon, authenticated;

/* ---------- Access ---------- */

revoke all on function public.set_order_secret(text) from public, anon;
revoke all on function public.order_proof(uuid, text) from public, anon, authenticated;
revoke all on function public.booking_capacity(uuid) from public, anon, authenticated;
revoke all on function public.confirm_held_booking(public.bookings) from public, anon, authenticated;
grant execute on function public.set_order_secret(text) to authenticated;
