-- Sono Studio · Phase 3 (Showcase generation)

-- Generation runs as small resumable steps; the job row holds progress between them.
create table public.generation_jobs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  status      text not null default 'draft' check (status in ('draft', 'running', 'plan_review', 'done', 'failed')),
  brief       jsonb not null,
  extracted   jsonb,
  plan        jsonb,
  filled      jsonb not null default '{}'::jsonb,
  images_done boolean not null default false,
  steps       jsonb not null default '[]'::jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index generation_jobs_project_idx on public.generation_jobs (project_id, created_at desc);
create trigger generation_jobs_touch before update on public.generation_jobs
  for each row execute function public.touch_updated_at();

-- Uploaded and stock images per project, with the credit stock licences ask for.
create table public.assets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  kind        text not null check (kind in ('photo', 'logo')),
  source      text not null check (source in ('upload', 'unsplash', 'pexels')),
  url         text not null,
  storage_path text,
  alt         text not null default '',
  credit      text not null default '',
  width       integer,
  height      integer,
  created_at  timestamptz not null default now()
);
create index assets_project_idx on public.assets (project_id, created_at);

-- AI and stock photo keys, encrypted by the app (AES-256-GCM) before they reach the database.
create table public.provider_keys (
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider       text not null check (provider in ('gemini', 'groq', 'openrouter', 'unsplash', 'pexels')),
  key_ciphertext text not null,
  key_hint       text not null default '',
  models         jsonb not null default '{}'::jsonb,
  position       integer not null default 0,
  daily_limit    integer check (daily_limit is null or daily_limit > 0),
  usage_day      date,
  usage_count    integer not null default 0,
  cooldown_until timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (owner_id, provider)
);
create trigger provider_keys_touch before update on public.provider_keys
  for each row execute function public.touch_updated_at();

-- Counts one request against today's usage, resetting at the start of a new day (UTC).
create or replace function public.record_provider_usage(p_provider text)
returns void
language sql
security invoker
as $$
  update public.provider_keys
     set usage_count = case when usage_day = current_date then usage_count + 1 else 1 end,
         usage_day = current_date
   where owner_id = auth.uid() and provider = p_provider;
$$;

alter table public.generation_jobs enable row level security;
alter table public.assets enable row level security;
alter table public.provider_keys enable row level security;

create policy "owner manages jobs" on public.generation_jobs for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

create policy "owner manages assets" on public.assets for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

create policy "owner manages provider keys" on public.provider_keys for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Public bucket for site images: pitch pages and live sites load them without signing in.
-- Files live under <owner id>/<project id>/..., and only the owner can write there.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "owner uploads site assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner deletes site assets" on storage.objects for delete to authenticated
  using (bucket_id = 'site-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
