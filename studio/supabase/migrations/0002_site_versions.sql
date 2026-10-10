-- Sono Studio · Phase 2 (Config and renderer)
-- Every saved change to a site is a full config snapshot, so undo and restore are just reads.

create table public.site_versions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  version     integer not null check (version >= 1),
  config      jsonb not null,
  summary     text not null default '' check (char_length(summary) <= 300),
  created_at  timestamptz not null default now(),
  unique (project_id, version)
);

create index site_versions_project_idx on public.site_versions (project_id, version desc);

alter table public.site_versions enable row level security;

create policy "owner manages site versions" on public.site_versions
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

-- Saves the next version and points the project at it in one transaction.
create or replace function public.save_site_version(p_project_id uuid, p_config jsonb, p_summary text)
returns integer
language plpgsql
security invoker
as $$
declare
  next_version integer;
begin
  -- Lock the project row so two saves can't take the same number.
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'Project not found';
  end if;
  select coalesce(max(version), 0) + 1 into next_version from public.site_versions where project_id = p_project_id;
  insert into public.site_versions (project_id, version, config, summary)
    values (p_project_id, next_version, p_config, coalesce(p_summary, ''));
  update public.projects set current_version = next_version where id = p_project_id;
  return next_version;
end;
$$;
