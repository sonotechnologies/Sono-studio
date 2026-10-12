-- Sono Studio · Phase 9.1 (Bookings with deposits)
--
-- Appointments booked on a site. A booking holds its time for 30 minutes
-- while the customer pays the deposit, and is confirmed once the payment is
-- checked. Test bookings come from pitch links and the preview; live ones from
-- deployed sites, which prove themselves with the project's order key.
-- The table is owner-only; visitors and live sites use the functions below,
-- which only ever reveal when times are taken, never who took them.

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  reference     text not null unique check (char_length(reference) between 6 and 80),
  service_id    text not null check (char_length(service_id) <= 64),
  service_name  text not null check (char_length(service_name) <= 80),
  start_at      timestamptz not null,
  end_at        timestamptz not null check (end_at > start_at),
  status        text not null default 'held' check (status in ('held', 'confirmed', 'cancelled', 'done', 'no_show')),
  hold_until    timestamptz,
  provider      text check (provider in ('paystack', 'stripe')),
  mode          text not null check (mode in ('test', 'live')),
  currency      text not null check (currency ~ '^[A-Z]{3}$'),
  deposit       numeric(14, 2) not null default 0 check (deposit >= 0),
  price         numeric(14, 2) not null default 0 check (price >= 0),
  customer      jsonb not null default '{}',
  token_hash    text,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  updated_at    timestamptz not null default now()
);
create index bookings_project_time_idx on public.bookings (project_id, start_at);
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

alter table public.bookings enable row level security;
create policy "owner reads bookings" on public.bookings for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner updates bookings" on public.bookings for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner deletes bookings" on public.bookings for delete to authenticated
  using (owner_id = (select auth.uid()));

-- A booking that takes up its time: confirmed, or held and not yet expired.
create or replace function public.booking_active(b public.bookings)
returns boolean
language sql
stable
as $$
  select b.status = 'confirmed' or (b.status = 'held' and b.hold_until > now())
$$;

-- Taken times for a project between two moments (at most 15 days apart).
create or replace function public.busy_times(p_project uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.start_at, b.end_at from public.bookings b
   where b.project_id = p_project and public.booking_active(b)
     and b.start_at < p_to and b.end_at > p_from
     and p_to > p_from and p_to - p_from <= interval '15 days'
$$;

-- Taken times shown on a live pitch link.
create or replace function public.pitch_busy(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.projects;
begin
  p := public.live_pitch(p_slug);
  if p.id is null then return; end if;
  return query select * from public.busy_times(p.id, p_from, p_to);
end;
$$;

-- Taken times shown on a deployed site (only for projects deployed with an order key).
create or replace function public.site_busy(p_project uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.projects where id = p_project and orders_key_hash is not null) then return; end if;
  return query select * from public.busy_times(p_project, p_from, p_to);
end;
$$;

-- Holds a time for 30 minutes while the deposit is paid, if there's still room.
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
  -- One booking at a time per project, so two people can't take the last place together.
  perform pg_advisory_xact_lock(hashtext(p.id::text));
  if (select count(*) from public.bookings where project_id = p.id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many bookings';
  end if;
  if (select count(*) from public.bookings b where b.project_id = p.id and public.booking_active(b) and b.start_at < p_end and b.end_at > p_start)
     >= greatest(1, least(coalesce(p_capacity, 1), 20)) then
    raise exception 'time taken';
  end if;
  insert into public.bookings (owner_id, project_id, reference, service_id, service_name, start_at, end_at, status, hold_until, provider, mode, currency, deposit, price, customer, token_hash)
    values (p.owner_id, p.id, p_reference, p_service_id, p_service_name, p_start, p_end, 'held', now() + interval '30 minutes', p_provider, p_mode, p_currency, p_deposit, p_price, coalesce(p_customer, '{}'), p_token_hash);
end;
$$;

-- A test booking from a pitch link.
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
  perform public.hold_booking(p, 'test', p_reference, p_service_id, p_service_name, p_start, p_end, p_capacity, p_provider, p_currency, p_deposit, p_price, p_customer, p_token_hash);
end;
$$;

-- A test booking from the studio preview (the signed-in owner).
create or replace function public.create_preview_booking(
  p_project uuid, p_reference text, p_service_id text, p_service_name text, p_start timestamptz, p_end timestamptz,
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
  select * into p from public.projects where id = p_project and owner_id = auth.uid();
  if p.id is null then raise exception 'not your project'; end if;
  perform public.hold_booking(p, 'test', p_reference, p_service_id, p_service_name, p_start, p_end, p_capacity, p_provider, p_currency, p_deposit, p_price, p_customer, p_token_hash);
end;
$$;

-- A booking from a deployed site, with the project's order key.
create or replace function public.hold_site_booking(
  p_project uuid, p_key text, p_mode text, p_reference text, p_service_id text, p_service_name text, p_start timestamptz, p_end timestamptz,
  p_capacity integer, p_provider text, p_currency text, p_deposit numeric, p_price numeric, p_customer jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  p public.projects;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or p.orders_key_hash is null or p.orders_key_hash <> encode(extensions.digest(p_key, 'sha256'), 'hex') then
    return false;
  end if;
  perform public.hold_booking(p, case when p_mode = 'test' then 'test' else 'live' end, p_reference, p_service_id, p_service_name, p_start, p_end, p_capacity, p_provider, p_currency, p_deposit, p_price, p_customer, null);
  return true;
end;
$$;

-- Confirms a studio booking once its deposit is paid; needs the booking's token.
create or replace function public.settle_booking(p_reference text, p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.bookings set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now())
   where reference = p_reference and status = 'held'
     and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  return found;
end;
$$;

-- Confirms a deployed site's booking once its deposit is paid.
create or replace function public.confirm_site_booking(p_project uuid, p_key text, p_reference text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.projects where id = p_project and orders_key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex')) then
    return false;
  end if;
  update public.bookings set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now())
   where project_id = p_project and reference = p_reference and status = 'held';
  return true;
end;
$$;

-- Which pitch a booking came from, so a webhook can find the key to check it with.
create or replace function public.booking_pitch_slug(p_reference text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.pitch_slug from public.bookings b join public.projects p on p.id = b.project_id where b.reference = p_reference
$$;

revoke all on function public.busy_times(uuid, timestamptz, timestamptz) from public;
revoke all on function public.hold_booking(public.projects, text, text, text, text, timestamptz, timestamptz, integer, text, text, numeric, numeric, jsonb, text) from public;
revoke all on function public.pitch_busy(text, timestamptz, timestamptz) from public;
revoke all on function public.site_busy(uuid, timestamptz, timestamptz) from public;
revoke all on function public.create_pitch_booking(text, text, text, text, timestamptz, timestamptz, integer, text, text, numeric, numeric, jsonb, text) from public;
revoke all on function public.create_preview_booking(uuid, text, text, text, timestamptz, timestamptz, integer, text, text, numeric, numeric, jsonb, text) from public;
revoke all on function public.hold_site_booking(uuid, text, text, text, text, text, timestamptz, timestamptz, integer, text, text, numeric, numeric, jsonb) from public;
revoke all on function public.settle_booking(text, text) from public;
revoke all on function public.confirm_site_booking(uuid, text, text) from public;
revoke all on function public.booking_pitch_slug(text) from public;
grant execute on function public.pitch_busy(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.site_busy(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.create_pitch_booking(text, text, text, text, timestamptz, timestamptz, integer, text, text, numeric, numeric, jsonb, text) to anon, authenticated;
grant execute on function public.create_preview_booking(uuid, text, text, text, timestamptz, timestamptz, integer, text, text, numeric, numeric, jsonb, text) to authenticated;
grant execute on function public.hold_site_booking(uuid, text, text, text, text, text, timestamptz, timestamptz, integer, text, text, numeric, numeric, jsonb) to anon, authenticated;
grant execute on function public.settle_booking(text, text) to anon, authenticated;
grant execute on function public.confirm_site_booking(uuid, text, text) to anon, authenticated;
grant execute on function public.booking_pitch_slug(text) to anon, authenticated;
