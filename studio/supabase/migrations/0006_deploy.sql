-- Sono Studio · Phase 6 (Export and deploy)

-- GitHub and Vercel tokens are stored like the other keys: encrypted by the app.
alter table public.provider_keys drop constraint if exists provider_keys_provider_check;
alter table public.provider_keys add constraint provider_keys_provider_check
  check (provider in ('gemini', 'groq', 'openrouter', 'unsplash', 'pexels', 'github', 'vercel'));

-- One row per deploy. The newest row is the site's current deployment.
create table public.deployments (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id            uuid not null references public.projects (id) on delete cascade,
  version               integer not null,
  status                text not null default 'building' check (status in ('building', 'ready', 'error')),
  repo_full_name        text,
  repo_url              text,
  vercel_project        text,
  vercel_deployment_id  text,
  url                   text,
  error                 text check (char_length(error) <= 1000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index deployments_project_idx on public.deployments (project_id, created_at desc);
create trigger deployments_touch before update on public.deployments
  for each row execute function public.touch_updated_at();

alter table public.deployments enable row level security;
create policy "owner manages deployments" on public.deployments for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

-- Once a site is live, its pitch link forwards visitors to the live address.
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
    'liveUrl', case when p.status = 'live' then p.live_url end,
    'config', cfg
  );
end;
$$;
