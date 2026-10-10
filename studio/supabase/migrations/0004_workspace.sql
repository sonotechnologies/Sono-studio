-- Sono Studio · Phase 4 (Workspace)

-- Chat history per project and the change each message produced.
create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  text        text not null check (char_length(text) <= 4000),
  scope       text check (scope in ('site', 'page', 'section')),
  change      text not null default '',
  version     integer,
  created_at  timestamptz not null default now()
);
create index chat_messages_project_idx on public.chat_messages (project_id, created_at);

alter table public.chat_messages enable row level security;
create policy "owner manages chat" on public.chat_messages for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
