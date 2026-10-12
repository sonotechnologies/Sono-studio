-- Sono Studio · Phase 8.2 (Card payments and orders)
--
-- Orders from shops: test orders from pitch links and the preview, and paid
-- orders that live client sites report back. The table is owner-only; pitch
-- visitors and live sites go through the narrow functions below. Settling an
-- order needs a token only the studio's server can work out, so nobody can
-- mark an order paid by calling a function from a browser.

create extension if not exists pgcrypto with schema extensions;

-- Your own Paystack and Stripe TEST keys, for demo checkouts. Live keys belong
-- to each client and go straight to their hosting at deploy, never here.
alter table public.provider_keys drop constraint if exists provider_keys_provider_check;
alter table public.provider_keys add constraint provider_keys_provider_check
  check (provider in ('gemini', 'groq', 'openrouter', 'unsplash', 'pexels', 'github', 'vercel', 'paystack', 'stripe', 'stripe_webhook'));

-- A live site proves it's the project's own with this key (only its hash is kept).
alter table public.projects add column if not exists orders_key_hash text;

create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  reference   text not null unique check (char_length(reference) between 6 and 80),
  provider    text not null check (provider in ('paystack', 'stripe')),
  mode        text not null check (mode in ('test', 'live')),
  status      text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'fulfilled', 'cancelled')),
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  total       numeric(14, 2) not null check (total >= 0),
  lines       jsonb not null default '[]',
  customer    jsonb not null default '{}',
  token_hash  text,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz,
  updated_at  timestamptz not null default now()
);
create index orders_project_idx on public.orders (project_id, created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

alter table public.orders enable row level security;
create policy "owner reads orders" on public.orders for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner adds orders" on public.orders for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "owner updates orders" on public.orders for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner deletes orders" on public.orders for delete to authenticated
  using (owner_id = (select auth.uid()));

-- A live pitch link (not paused, not expired), or null.
create or replace function public.live_pitch(p_slug text)
returns public.projects
language sql
stable
security definer
set search_path = public
as $$
  select p.* from public.projects p
   where p.pitch_slug = p_slug and not p.pitch_paused
     and (public.pitch_expires_at(p) is null or public.pitch_expires_at(p) > now())
$$;

-- The owner's encrypted test key for a payment provider, for a live pitch only.
-- It stays encrypted: only the studio server holds the key that opens it.
create or replace function public.pitch_payment_key(p_slug text, p_provider text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.projects;
  k text;
begin
  if p_provider not in ('paystack', 'stripe', 'stripe_webhook') then return null; end if;
  p := public.live_pitch(p_slug);
  if p.id is null then return null; end if;
  select key_ciphertext into k from public.provider_keys where owner_id = p.owner_id and provider = p_provider;
  return k;
end;
$$;

-- A test checkout started on a pitch link: pending until it's paid.
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
  -- A crude flood guard: at most 30 checkouts a minute per project.
  if (select count(*) from public.orders where project_id = p.id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many checkouts';
  end if;
  insert into public.orders (owner_id, project_id, reference, provider, mode, currency, total, lines, customer, token_hash)
    values (p.owner_id, p.id, p_reference, p_provider, 'test', p_currency, p_total, coalesce(p_lines, '[]'), coalesce(p_customer, '{}'), p_token_hash);
end;
$$;

-- Marks an order paid or failed. Needs the order's token, which only the
-- studio's server can work out, and only once the provider confirmed it.
create or replace function public.settle_order(p_reference text, p_token text, p_status text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_status not in ('paid', 'failed') then return false; end if;
  update public.orders
     set status = p_status, paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end
   where reference = p_reference
     and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     -- A paid order stays paid; fulfilled and cancelled are the owner's to set.
     and status in ('pending', 'failed');
  return found;
end;
$$;

-- Which pitch an order came from, so a webhook can find the key to check it with.
create or replace function public.order_pitch_slug(p_reference text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.pitch_slug from public.orders o join public.projects p on p.id = o.project_id where o.reference = p_reference
$$;

-- A paid order reported by a live client site, proven by the project's order key.
create or replace function public.report_site_order(
  p_project uuid, p_key text, p_reference text, p_provider text, p_mode text, p_currency text, p_total numeric, p_lines jsonb, p_customer jsonb
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
  insert into public.orders (owner_id, project_id, reference, provider, mode, status, currency, total, lines, customer, paid_at)
    values (p.owner_id, p.id, p_reference, p_provider, case when p_mode = 'test' then 'test' else 'live' end, 'paid', p_currency, p_total, coalesce(p_lines, '[]'), coalesce(p_customer, '{}'), now())
    on conflict (reference) do nothing;
  return true;
end;
$$;

revoke all on function public.live_pitch(text) from public;
revoke all on function public.pitch_payment_key(text, text) from public;
revoke all on function public.create_pitch_order(text, text, text, text, numeric, jsonb, jsonb, text) from public;
revoke all on function public.settle_order(text, text, text) from public;
revoke all on function public.order_pitch_slug(text) from public;
revoke all on function public.report_site_order(uuid, text, text, text, text, text, numeric, jsonb, jsonb) from public;
grant execute on function public.pitch_payment_key(text, text) to anon, authenticated;
grant execute on function public.create_pitch_order(text, text, text, text, numeric, jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.settle_order(text, text, text) to anon, authenticated;
grant execute on function public.order_pitch_slug(text) to anon, authenticated;
grant execute on function public.report_site_order(uuid, text, text, text, text, text, numeric, jsonb, jsonb) to anon, authenticated;
