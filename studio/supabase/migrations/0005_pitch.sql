-- Sono Studio · Phase 5 (Pitch links and tracking)
-- Pitch pages are public, but the tables stay owner-only. Visitors go through
-- two narrow functions: one returns what a pitch page shows, one logs an open.

create table public.pitch_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  opened_at   timestamptz not null default now(),
  device      text not null check (device in ('mobile', 'tablet', 'desktop')),
  is_bot      boolean not null default false,
  path        text not null default '/' check (char_length(path) <= 100)
);
create index pitch_events_project_idx on public.pitch_events (project_id, opened_at desc);

alter table public.pitch_events enable row level security;
create policy "owner reads pitch events" on public.pitch_events for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner deletes pitch events" on public.pitch_events for delete to authenticated
  using (owner_id = (select auth.uid()));

-- When a link stops working: the expiry counts from the day the pitch was sent
-- (or the project was created, if it was never marked as sent).
create or replace function public.pitch_expires_at(p public.projects)
returns timestamptz
language sql
stable
as $$
  select case when p.pitch_expiry_days is null then null
              else coalesce(p.pitch_sent_at, p.created_at) + make_interval(days => p.pitch_expiry_days) end
$$;

-- Everything a pitch page needs, and nothing else.
create or replace function public.get_pitch(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.projects;
  s public.studio_settings;
  cfg jsonb;
begin
  select * into p from public.projects where pitch_slug = p_slug;
  if not found then return null; end if;
  select * into s from public.studio_settings where owner_id = p.owner_id;
  if not p.pitch_paused and (public.pitch_expires_at(p) is null or public.pitch_expires_at(p) > now()) then
    select config into cfg from public.site_versions
      where project_id = p.id order by version desc limit 1;
  end if;
  return jsonb_build_object(
    'name', p.name,
    'paused', p.pitch_paused,
    'banner', p.pitch_banner,
    'expiresAt', public.pitch_expires_at(p),
    'whatsapp', coalesce(s.banner_whatsapp, ''),
    'instagram', coalesce(s.banner_instagram, ''),
    'config', cfg
  );
end;
$$;

-- Logs one open of a live pitch link. Bot opens are kept but don't count as the last open.
create or replace function public.log_pitch_open(p_slug text, p_device text, p_bot boolean, p_path text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  p public.projects;
begin
  select * into p from public.projects where pitch_slug = p_slug;
  if not found or p.pitch_paused then return; end if;
  if public.pitch_expires_at(p) is not null and public.pitch_expires_at(p) <= now() then return; end if;
  if p_device not in ('mobile', 'tablet', 'desktop') then p_device := 'desktop'; end if;
  -- A crude flood guard: at most one logged open per project every 5 seconds.
  if exists (select 1 from public.pitch_events where project_id = p.id and opened_at > now() - interval '5 seconds') then return; end if;
  insert into public.pitch_events (owner_id, project_id, device, is_bot, path)
    values (p.owner_id, p.id, p_device, coalesce(p_bot, false), left(coalesce(p_path, '/'), 100));
  if not coalesce(p_bot, false) then
    update public.projects set last_opened_at = now() where id = p.id;
  end if;
end;
$$;

revoke all on function public.get_pitch(text) from public;
revoke all on function public.log_pitch_open(text, text, boolean, text) from public;
grant execute on function public.get_pitch(text) to anon, authenticated;
grant execute on function public.log_pitch_open(text, text, boolean, text) to anon, authenticated;
