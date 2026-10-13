-- Sono AI · Stage 2 (Notify)
-- Telegram link and preferences, a record of alerts sent (so each goes once),
-- and the knowledge search index. Studio tables are only read.
--
-- The morning summary, Telegram messages and pitch-open alerts run without a
-- signed-in user. They go through the narrow functions below, which need the
-- server's Sono AI key: its sha256 is stored here when you open Sono AI in the
-- studio, and the key itself never leaves the server.

create extension if not exists vector with schema extensions;

create table public.sono_ai_settings (
  owner_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  key_hash          text check (char_length(key_hash) = 64),
  telegram_chat_id  bigint,
  link_code_hash    text,
  link_expires_at   timestamptz,
  timezone          text not null default 'Africa/Lagos' check (char_length(timezone) <= 60),
  follow_up_days    integer not null default 3 check (follow_up_days between 1 and 30),
  -- Summary item kinds you turned down with a thumbs-down.
  muted             text[] not null default '{}',
  last_summary_at   timestamptz,
  last_indexed_at   timestamptz,
  updated_at        timestamptz not null default now()
);
create trigger sono_ai_settings_touch before update on public.sono_ai_settings
  for each row execute function public.touch_updated_at();

alter table public.sono_ai_settings enable row level security;
create policy "owner manages sono ai settings" on public.sono_ai_settings for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- One row per alert or summary sent; the unique ref makes each go only once.
create table public.sono_ai_alerts (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references auth.users (id) on delete cascade,
  kind      text not null check (char_length(kind) <= 40),
  ref       text not null check (char_length(ref) <= 200),
  sent_at   timestamptz not null default now(),
  unique (owner_id, ref)
);
alter table public.sono_ai_alerts enable row level security;
create policy "owner reads alerts" on public.sono_ai_alerts for select to authenticated
  using (owner_id = (select auth.uid()));

-- Knowledge search: redacted chunks of studio records and their embeddings.
create table public.knowledge_chunks (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete cascade,
  source        text not null check (char_length(source) <= 40),
  source_id     text not null check (char_length(source_id) <= 200),
  chunk         integer not null default 0,
  content       text not null check (char_length(content) <= 4000),
  content_hash  text not null,
  embedding     extensions.vector(768),
  has_embedding boolean generated always as (embedding is not null) stored,
  indexed_at    timestamptz not null default now(),
  unique (owner_id, source, source_id, chunk)
);
create index knowledge_chunks_project_idx on public.knowledge_chunks (project_id);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_chunks enable row level security;
create policy "owner manages knowledge" on public.knowledge_chunks for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  );

/* ---------- Functions for work without a signed-in user ---------- */

create or replace function public.sono_ai_owner(p_key text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.sono_ai_settings
   where p_key is not null and key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex')
   limit 1
$$;

-- Records an alert once. Returns the Telegram chat to send it to, or null if
-- it was already sent or Telegram isn't linked.
create or replace function public.sono_ai_claim_alert(p_key text, p_kind text, p_ref text)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.sono_ai_owner(p_key);
  v_chat bigint;
begin
  if v_owner is null then return null; end if;
  select telegram_chat_id into v_chat from public.sono_ai_settings where owner_id = v_owner;
  if v_chat is null then return null; end if;
  insert into public.sono_ai_alerts (owner_id, kind, ref) values (v_owner, left(p_kind, 40), left(p_ref, 200))
    on conflict (owner_id, ref) do nothing;
  if not found then return null; end if;
  return v_chat;
end;
$$;

-- A pitch link's first real open (bots already filtered by the caller).
create or replace function public.sono_ai_pitch_alert(p_key text, p_slug text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.sono_ai_owner(p_key);
  p public.projects;
  v_chat bigint;
begin
  if v_owner is null then return null; end if;
  select * into p from public.projects where pitch_slug = p_slug and owner_id = v_owner;
  if not found then return null; end if;
  if (select count(*) from public.pitch_events where project_id = p.id and not is_bot) <> 1 then return null; end if;
  v_chat := public.sono_ai_claim_alert(p_key, 'pitch_opened', 'pitch_open:' || p.id);
  if v_chat is null then return null; end if;
  return jsonb_build_object('chatId', v_chat, 'projectId', p.id, 'name', p.name,
    'device', (select device from public.pitch_events where project_id = p.id and not is_bot order by opened_at limit 1));
end;
$$;

-- The chat Telegram messages are accepted from (null until linked).
create or replace function public.sono_ai_chat(p_key text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select telegram_chat_id from public.sono_ai_settings where owner_id = public.sono_ai_owner(p_key)
$$;

-- Links Telegram with the one-time code shown in the studio (valid 15 minutes).
create or replace function public.sono_ai_link_telegram(p_key text, p_code text, p_chat_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.sono_ai_settings
     set telegram_chat_id = p_chat_id, link_code_hash = null, link_expires_at = null
   where owner_id = public.sono_ai_owner(p_key)
     and link_code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex')
     and link_expires_at > now();
  return found;
end;
$$;

-- A thumbs-down on a summary item: leave that kind out from now on.
create or replace function public.sono_ai_mute(p_key text, p_chat_id bigint, p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.sono_ai_settings
     set muted = array(select distinct unnest(muted || array[left(p_kind, 40)]))
   where owner_id = public.sono_ai_owner(p_key) and telegram_chat_id = p_chat_id;
  return found;
end;
$$;

-- The facts behind the morning summary, straight from the studio's tables.
-- With p_claim, it also marks today's summary as sent and returns null if it
-- already was (or Telegram isn't linked), so a summary goes once a day.
create or replace function public.sono_ai_daily(p_key text, p_claim boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.sono_ai_owner(p_key);
  s public.sono_ai_settings;
  v_since timestamptz;
begin
  if v_owner is null then return null; end if;
  select * into s from public.sono_ai_settings where owner_id = v_owner;
  v_since := greatest(coalesce(s.last_summary_at, now() - interval '24 hours'), now() - interval '3 days');
  if p_claim then
    if s.telegram_chat_id is null then return null; end if;
    insert into public.sono_ai_alerts (owner_id, kind, ref)
      values (v_owner, 'summary', 'summary:' || to_char(now() at time zone s.timezone, 'YYYY-MM-DD'))
      on conflict (owner_id, ref) do nothing;
    if not found then return null; end if;
    update public.sono_ai_settings set last_summary_at = now() where owner_id = v_owner;
  end if;
  return jsonb_build_object(
    'chatId', s.telegram_chat_id,
    'followUpDays', s.follow_up_days,
    'muted', to_jsonb(s.muted),
    'since', v_since,
    'now', now(),
    'projects', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'status', p.status, 'createdAt', p.created_at, 'updatedAt', p.updated_at,
        'pitchSentAt', p.pitch_sent_at, 'lastOpenedAt', p.last_opened_at, 'liveAt', p.live_at))
      from public.projects p where p.owner_id = v_owner), '[]'::jsonb),
    'opens', coalesce((select jsonb_agg(jsonb_build_object('projectId', e.project_id, 'openedAt', e.opened_at))
      from public.pitch_events e where e.owner_id = v_owner and not e.is_bot and e.opened_at > v_since), '[]'::jsonb),
    'failedJobs', coalesce((select jsonb_agg(jsonb_build_object('projectId', j.project_id, 'at', j.updated_at, 'error', left(j.error, 200)))
      from public.generation_jobs j where j.owner_id = v_owner and j.status = 'failed' and j.updated_at > v_since), '[]'::jsonb),
    'deployments', coalesce((select jsonb_agg(jsonb_build_object('projectId', d.project_id, 'status', d.status, 'at', d.updated_at, 'url', d.url))
      from public.deployments d where d.owner_id = v_owner and d.status <> 'building' and d.updated_at > v_since), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('projectId', v.project_id, 'count', v.n))
      from (select project_id, count(*) as n from public.site_versions where owner_id = v_owner and created_at > v_since group by project_id) v), '[]'::jsonb),
    'usage', coalesce((select jsonb_agg(jsonb_build_object('provider', k.provider, 'used', case when k.usage_day = current_date then k.usage_count else 0 end, 'limit', k.daily_limit))
      from public.provider_keys k where k.owner_id = v_owner and k.daily_limit is not null), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.sono_ai_owner(text) from public;
revoke all on function public.sono_ai_claim_alert(text, text, text) from public;
revoke all on function public.sono_ai_pitch_alert(text, text) from public;
revoke all on function public.sono_ai_chat(text) from public;
revoke all on function public.sono_ai_link_telegram(text, text, bigint) from public;
revoke all on function public.sono_ai_mute(text, bigint, text) from public;
revoke all on function public.sono_ai_daily(text, boolean) from public;
grant execute on function public.sono_ai_claim_alert(text, text, text) to anon, authenticated;
grant execute on function public.sono_ai_pitch_alert(text, text) to anon, authenticated;
grant execute on function public.sono_ai_chat(text) to anon, authenticated;
grant execute on function public.sono_ai_link_telegram(text, text, bigint) to anon, authenticated;
grant execute on function public.sono_ai_mute(text, bigint, text) to anon, authenticated;
grant execute on function public.sono_ai_daily(text, boolean) to anon, authenticated;
