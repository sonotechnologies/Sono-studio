-- Sono AI · Stage 1 (Record)
-- The knowledge bank's own tables. Nothing here changes a studio table: Sono AI
-- only reads the studio's data. Every row belongs to its owner (row-level
-- security), and deleting a project deletes its requests, outcomes and
-- placeholders with it.

-- Every AI request and its answer, stored redacted.
create table public.ai_interactions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete cascade,
  site_type     text,
  task          text not null check (char_length(task) <= 40),
  source        text not null default 'live' check (source in ('live', 'backfill')),
  -- Where a backfilled row came from; unique, so importing twice adds nothing.
  source_ref    text check (char_length(source_ref) <= 200),
  system        text not null default '',
  request       text not null default '',
  answer        text,
  provider      text not null default '' check (char_length(provider) <= 40),
  model         text not null default '' check (char_length(model) <= 200),
  ms            integer,
  input_tokens  integer,
  output_tokens integer,
  status        text not null check (status in ('ok', 'error', 'limit')),
  error         text,
  created_at    timestamptz not null default now(),
  unique (owner_id, source_ref)
);
create index ai_interactions_owner_idx on public.ai_interactions (owner_id, created_at desc);
create index ai_interactions_project_idx on public.ai_interactions (project_id, created_at desc);

alter table public.ai_interactions enable row level security;
create policy "owner reads interactions" on public.ai_interactions for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner records interactions" on public.ai_interactions for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  );
create policy "owner deletes interactions" on public.ai_interactions for delete to authenticated
  using (owner_id = (select auth.uid()));

-- What came of a result: kept, edited (your version is that site version), undone,
-- regenerated, or the pitch was opened, approved or went live.
create table public.outcomes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id     uuid not null references public.projects (id) on delete cascade,
  interaction_id uuid references public.ai_interactions (id) on delete cascade,
  kind           text not null check (kind in ('kept', 'edited', 'undone', 'regenerated', 'pitch_opened', 'approved', 'live')),
  version        integer,
  detail         text not null default '' check (char_length(detail) <= 300),
  key            text not null check (char_length(key) <= 200),
  happened_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  unique (owner_id, key)
);
create index outcomes_project_idx on public.outcomes (project_id, happened_at desc);
create index outcomes_interaction_idx on public.outcomes (interaction_id);

alter table public.outcomes enable row level security;
create policy "owner reads outcomes" on public.outcomes for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner records outcomes" on public.outcomes for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "owner deletes outcomes" on public.outcomes for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Placeholder to real value ("Phone 1" → the client's number), per project.
-- Only the owner can read it; it goes when the project goes.
create table public.redaction_map (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  placeholder text not null check (char_length(placeholder) <= 40),
  kind        text not null check (kind in ('business', 'person', 'phone', 'email', 'handle', 'address')),
  value       text not null check (char_length(value) <= 400),
  created_at  timestamptz not null default now(),
  unique (project_id, kind, value)
);
create index redaction_map_project_idx on public.redaction_map (project_id);

alter table public.redaction_map enable row level security;
create policy "owner manages redactions" on public.redaction_map for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
