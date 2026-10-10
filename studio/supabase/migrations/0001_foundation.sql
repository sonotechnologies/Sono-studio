-- Sono Studio · Phase 1 (Foundation)
-- Projects, client records and pitch defaults for a single signed-in user.
-- Every row belongs to an owner; row-level security limits access to that owner.

create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 80),
  business_type     text not null default '',
  site_type         text not null default 'showcase' check (site_type in ('showcase', 'store', 'booking')),
  preset            text not null default 'warm-table'
                    check (preset in ('warm-table', 'luxe-minimal', 'bold-street', 'clean-corporate', 'tech-dark', 'soft-studio')),
  headline          text not null default '',
  status            text not null default 'draft' check (status in ('draft', 'pitch_sent', 'client_approved', 'live')),
  pitch_slug        text not null unique check (pitch_slug ~ '^[a-z0-9-]{3,64}$'),
  pitch_paused      boolean not null default false,
  pitch_banner      boolean not null default true,
  pitch_expiry_days integer default 30 check (pitch_expiry_days in (7, 30, 90)),
  current_version   integer,
  thumbnail_url     text,
  live_url          text,
  repo_url          text,
  pitch_sent_at     timestamptz,
  last_opened_at    timestamptz,
  live_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index projects_owner_created_idx on public.projects (owner_id, created_at desc);

create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id    uuid not null unique references public.projects (id) on delete cascade,
  business_name text not null default '',
  owner_name    text not null default '',
  whatsapp      text not null default '',
  instagram     text not null default '',
  address       text not null default '',
  notes         text not null default '' check (char_length(notes) <= 4000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.studio_settings (
  owner_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  banner_default   boolean not null default true,
  banner_whatsapp  text not null default '',
  banner_instagram text not null default '',
  updated_at       timestamptz not null default now()
);

-- Keep updated_at current.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger studio_settings_touch before update on public.studio_settings
  for each row execute function public.touch_updated_at();

-- Editing a client counts as activity on its project.
create or replace function public.touch_project_from_client() returns trigger
language plpgsql as $$
begin
  update public.projects set updated_at = now() where id = new.project_id;
  return new;
end;
$$;

create trigger clients_touch_project after update on public.clients
  for each row execute function public.touch_project_from_client();

-- Row-level security: the signed-in owner sees and changes only their own rows.
alter table public.projects enable row level security;
alter table public.clients enable row level security;
alter table public.studio_settings enable row level security;

create policy "owner manages projects" on public.projects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner manages clients" on public.clients
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "owner manages settings" on public.studio_settings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
