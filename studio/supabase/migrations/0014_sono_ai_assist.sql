-- Sono AI · Stage 3 (Assist)
-- Conversations with Sono AI, its drafts, your feedback and rules, model
-- scorecards, and knowledge search. Studio tables are still only read.

-- Messages with Sono AI, in the studio or on Telegram.
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  channel     text not null check (channel in ('studio', 'telegram')),
  role        text not null check (role in ('user', 'assistant')),
  text        text not null check (char_length(text) <= 8000),
  mode        text check (mode in ('casual', 'studio', 'search', 'rule', 'draft')),
  -- Links an answer used: [{ "label": "...", "href": "..." }]
  sources     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index conversations_owner_idx on public.conversations (owner_id, channel, created_at desc);
alter table public.conversations enable row level security;
create policy "owner manages conversations" on public.conversations for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))));

-- Drafted messages, quotes and checklists. Nothing is sent: approving one opens
-- WhatsApp or Instagram with the text, and you press send.
create table public.assistant_drafts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  kind        text not null check (kind in ('follow_up', 'quote', 'checklist')),
  channel     text check (channel in ('whatsapp', 'instagram')),
  recipient   text not null default '' check (char_length(recipient) <= 200),
  title       text not null check (char_length(title) <= 200),
  why         text not null default '' check (char_length(why) <= 500),
  body        text not null check (char_length(body) <= 6000),
  -- Your version, when you edited it before approving: kept as an example of your voice.
  final_body  text check (char_length(final_body) <= 6000),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'skipped')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index assistant_drafts_owner_idx on public.assistant_drafts (owner_id, status, created_at desc);
alter table public.assistant_drafts enable row level security;
create policy "owner manages drafts" on public.assistant_drafts for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))));

-- Thumbs-up or down on a reply or a draft, with an optional note.
create table public.feedback (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_kind  text not null check (target_kind in ('reply', 'draft')),
  target_id    uuid not null,
  rating       smallint not null check (rating in (-1, 1)),
  note         text not null default '' check (char_length(note) <= 1000),
  created_at   timestamptz not null default now(),
  unique (owner_id, target_kind, target_id)
);
alter table public.feedback enable row level security;
create policy "owner manages feedback" on public.feedback for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Rules you teach Sono AI, in your words. A rule is only used once you confirm it.
create table public.rules (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text        text not null check (char_length(text) between 3 and 500),
  enabled     boolean not null default true,
  confirmed   boolean not null default false,
  source      text not null default 'studio' check (source in ('studio', 'telegram')),
  created_at  timestamptz not null default now()
);
alter table public.rules enable row level security;
create policy "owner manages rules" on public.rules for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Running results per task, provider and model, recalculated from the bank.
create table public.scorecards (
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task         text not null,
  provider     text not null,
  model        text not null,
  requests     integer not null default 0,
  failures     integer not null default 0,
  kept         integer not null default 0,
  edited       integer not null default 0,
  undone       integer not null default 0,
  regenerated  integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (owner_id, task, provider, model)
);
alter table public.scorecards enable row level security;
create policy "owner manages scorecards" on public.scorecards for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Which draft Telegram is waiting on for your edited text.
alter table public.sono_ai_settings add column telegram_editing_draft uuid;

-- Knowledge search: the chunks closest in meaning to a question, optionally for one project.
create or replace function public.match_knowledge(p_query extensions.vector(768), p_count integer, p_project uuid)
returns table (id uuid, project_id uuid, source text, source_id text, content text, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select k.id, k.project_id, k.source, k.source_id, k.content, 1 - (k.embedding <=> p_query) as similarity
    from public.knowledge_chunks k
   where k.embedding is not null and (p_project is null or k.project_id = p_project)
   order by k.embedding <=> p_query
   limit least(greatest(p_count, 1), 20)
$$;

/* ---------- Telegram: the assistant without a signed-in user ---------- */

-- What the bot needs to answer: your AI providers (keys stay encrypted; only
-- the server can open them), your rules, the recent Telegram conversation and
-- the draft being edited.
create or replace function public.sono_ai_tg_state(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.sono_ai_owner(p_key);
begin
  if v_owner is null then return null; end if;
  return jsonb_build_object(
    'providers', coalesce((select jsonb_agg(jsonb_build_object('provider', k.provider, 'ciphertext', k.key_ciphertext, 'models', k.models,
        'dailyLimit', k.daily_limit, 'used', case when k.usage_day = current_date then k.usage_count else 0 end, 'cooldownUntil', k.cooldown_until) order by k.position)
      from public.provider_keys k where k.owner_id = v_owner and k.provider in ('gemini', 'groq', 'openrouter')), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(r.text order by r.created_at) from public.rules r where r.owner_id = v_owner and r.enabled and r.confirmed), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', c.role, 'text', c.text) order by c.created_at)
      from (select * from public.conversations where owner_id = v_owner and channel = 'telegram' order by created_at desc limit 10) c), '[]'::jsonb),
    'editingDraft', (select telegram_editing_draft from public.sono_ai_settings where owner_id = v_owner),
    'voice', coalesce((select jsonb_agg(d.final_body) from (select final_body from public.assistant_drafts
      where owner_id = v_owner and kind = 'follow_up' and status = 'approved' and final_body is not null order by decided_at desc limit 5) d), '[]'::jsonb),
    'pendingFollowUps', coalesce((select jsonb_agg(d.project_id) from public.assistant_drafts d
      where d.owner_id = v_owner and d.kind = 'follow_up' and d.status = 'pending'), '[]'::jsonb),
    'followUpDays', coalesce((select follow_up_days from public.sono_ai_settings where owner_id = v_owner), 3),
    'projects', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'businessType', p.business_type, 'siteType', p.site_type, 'status', p.status, 'createdAt', p.created_at,
        'pitchSentAt', p.pitch_sent_at, 'lastOpenedAt', p.last_opened_at, 'liveAt', p.live_at, 'pitchSlug', p.pitch_slug,
        'client', jsonb_build_object('ownerName', coalesce(c.owner_name, ''), 'whatsapp', coalesce(c.whatsapp, ''), 'instagram', coalesce(c.instagram, ''),
                                     'address', coalesce(c.address, ''), 'notes', coalesce(c.notes, ''))))
      from public.projects p left join public.clients c on c.project_id = p.id where p.owner_id = v_owner), '[]'::jsonb),
    'scorecards', coalesce((select jsonb_agg(jsonb_build_object('task', s.task, 'provider', s.provider, 'model', s.model, 'requests', s.requests, 'failures', s.failures,
        'kept', s.kept, 'edited', s.edited, 'undone', s.undone, 'regenerated', s.regenerated)) from public.scorecards s where s.owner_id = v_owner), '[]'::jsonb),
    'redactions', coalesce((select jsonb_agg(jsonb_build_object('projectId', r.project_id, 'placeholder', r.placeholder, 'kind', r.kind, 'value', r.value) order by r.created_at)
      from public.redaction_map r where r.owner_id = v_owner), '[]'::jsonb)
  );
end;
$$;

create or replace function public.sono_ai_tg_match(p_key text, p_query extensions.vector(768), p_count integer)
returns table (id uuid, project_id uuid, source text, source_id text, content text, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select k.id, k.project_id, k.source, k.source_id, k.content, 1 - (k.embedding <=> p_query)
    from public.knowledge_chunks k
   where k.owner_id = public.sono_ai_owner(p_key) and k.embedding is not null
   order by k.embedding <=> p_query
   limit least(greatest(p_count, 1), 20)
$$;

-- The bot's writes, one entry point: saving messages, rules, feedback, draft
-- decisions, request logs and usage. Each only touches the key owner's rows.
create or replace function public.sono_ai_tg_write(p_key text, p_op text, p_args jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.sono_ai_owner(p_key);
  v_id uuid;
  v_out jsonb;
  d public.assistant_drafts;
begin
  if v_owner is null then return null; end if;
  if p_op = 'message' then
    insert into public.conversations (owner_id, channel, role, text, mode, sources)
      values (v_owner, 'telegram', p_args->>'role', left(p_args->>'text', 8000), p_args->>'mode', coalesce(p_args->'sources', '[]'::jsonb))
      returning id into v_id;
    return jsonb_build_object('id', v_id);
  elsif p_op = 'rule' then
    insert into public.rules (owner_id, text, confirmed, source) values (v_owner, left(p_args->>'text', 500), false, 'telegram') returning id into v_id;
    return jsonb_build_object('id', v_id);
  elsif p_op = 'confirm_rule' then
    update public.rules set confirmed = true where id = (p_args->>'id')::uuid and owner_id = v_owner returning id into v_id;
    return jsonb_build_object('id', v_id, 'text', (select text from public.rules where id = v_id));
  elsif p_op = 'feedback' then
    insert into public.feedback (owner_id, target_kind, target_id, rating)
      values (v_owner, p_args->>'kind', (p_args->>'id')::uuid, (p_args->>'rating')::smallint)
      on conflict (owner_id, target_kind, target_id) do update set rating = excluded.rating;
    return jsonb_build_object('ok', true);
  elsif p_op = 'draft' then
    select * into d from public.assistant_drafts where id = (p_args->>'id')::uuid and owner_id = v_owner;
    if not found then return null; end if;
    if p_args->>'decision' in ('approved', 'skipped') and d.status = 'pending' then
      update public.assistant_drafts set status = p_args->>'decision', decided_at = now(),
             final_body = coalesce(left(p_args->>'body', 6000), final_body)
       where id = d.id returning * into d;
      update public.sono_ai_settings set telegram_editing_draft = null where owner_id = v_owner;
    elsif p_args->>'decision' = 'editing' and d.status = 'pending' then
      update public.sono_ai_settings set telegram_editing_draft = d.id where owner_id = v_owner;
    elsif p_args->>'decision' = 'cancel_edit' then
      update public.sono_ai_settings set telegram_editing_draft = null where owner_id = v_owner;
    end if;
    return to_jsonb(d) - 'owner_id';
  elsif p_op = 'add_drafts' then
    with ins as (
      insert into public.assistant_drafts (owner_id, project_id, kind, channel, recipient, title, why, body)
        select v_owner, (r->>'projectId')::uuid, r->>'kind', r->>'channel', coalesce(r->>'recipient', ''), left(r->>'title', 200), left(coalesce(r->>'why', ''), 500), left(r->>'body', 6000)
          from jsonb_array_elements(p_args->'rows') r
         where (r->>'projectId') is null or exists (select 1 from public.projects p where p.id = (r->>'projectId')::uuid and p.owner_id = v_owner)
        returning *
    )
    select jsonb_agg(to_jsonb(ins) - 'owner_id') into v_out from ins;
    return coalesce(v_out, '[]'::jsonb);
  elsif p_op = 'log' then
    insert into public.ai_interactions (owner_id, task, source, system, request, answer, provider, model, ms, input_tokens, output_tokens, status, error)
      select v_owner, left(r->>'task', 40), 'live', coalesce(r->>'system', ''), coalesce(r->>'request', ''), r->>'answer', left(coalesce(r->>'provider', ''), 40),
             left(coalesce(r->>'model', ''), 200), (r->>'ms')::integer, (r->>'inputTokens')::integer, (r->>'outputTokens')::integer, r->>'status', r->>'error'
        from jsonb_array_elements(p_args->'rows') r;
    return jsonb_build_object('ok', true);
  elsif p_op = 'usage' then
    update public.provider_keys
       set usage_count = case when usage_day = current_date then usage_count + 1 else 1 end, usage_day = current_date
     where owner_id = v_owner and provider = p_args->>'provider';
    return jsonb_build_object('ok', true);
  elsif p_op = 'cooldown' then
    update public.provider_keys set cooldown_until = (p_args->>'until')::timestamptz where owner_id = v_owner and provider = p_args->>'provider';
    return jsonb_build_object('ok', true);
  end if;
  return null;
end;
$$;

revoke all on function public.sono_ai_tg_state(text) from public;
revoke all on function public.sono_ai_tg_match(text, extensions.vector, integer) from public;
revoke all on function public.sono_ai_tg_write(text, text, jsonb) from public;
grant execute on function public.sono_ai_tg_state(text) to anon, authenticated;
grant execute on function public.sono_ai_tg_match(text, extensions.vector, integer) to anon, authenticated;
grant execute on function public.sono_ai_tg_write(text, text, jsonb) to anon, authenticated;
grant execute on function public.match_knowledge(extensions.vector, integer, uuid) to authenticated;
