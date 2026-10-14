-- Sono AI · Stage 4 (Build)
-- Build requests made to Sono AI. A request only holds the brief Sono AI read
-- from your message; nothing is created until you press "Plan it", which makes
-- an ordinary project and generation job, and nothing is built until you
-- approve the plan in the studio's own plan review. The project itself is a
-- normal studio project: this table only remembers that Sono AI started it.

create table public.sono_ai_builds (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  request     text not null check (char_length(request) <= 2000),
  channel     text not null check (channel in ('studio', 'telegram')),
  -- The brief as read from the request (business, type, pages, facts, client details).
  brief       jsonb not null,
  status      text not null default 'requested' check (status in ('requested', 'started', 'discarded')),
  project_id  uuid references public.projects (id) on delete cascade,
  job_id      uuid references public.generation_jobs (id) on delete set null,
  created_at  timestamptz not null default now(),
  started_at  timestamptz
);
create index sono_ai_builds_owner_idx on public.sono_ai_builds (owner_id, created_at desc);
create index sono_ai_builds_project_idx on public.sono_ai_builds (project_id);

alter table public.sono_ai_builds enable row level security;
create policy "owner manages builds" on public.sono_ai_builds for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  );

-- A build request from Telegram (no signed-in user). It only files the
-- request; planning starts when you open it in the studio.
create or replace function public.sono_ai_tg_build(p_key text, p_request text, p_brief jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.sono_ai_owner(p_key);
  v_id uuid;
begin
  if v_owner is null or p_brief is null or jsonb_typeof(p_brief) <> 'object' then return null; end if;
  insert into public.sono_ai_builds (owner_id, request, channel, brief)
    values (v_owner, left(p_request, 2000), 'telegram', p_brief)
    returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.sono_ai_tg_build(text, text, jsonb) from public;
grant execute on function public.sono_ai_tg_build(text, text, jsonb) to anon, authenticated;

-- Conversations can now hold build replies.
alter table public.conversations drop constraint if exists conversations_mode_check;
alter table public.conversations add constraint conversations_mode_check check (mode in ('casual', 'studio', 'search', 'rule', 'draft', 'build'));
