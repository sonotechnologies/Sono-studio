-- Sono AI · Separate chats
-- Studio messages belong to a chat you can start, rename and delete; single
-- messages can be deleted. Telegram stays one running conversation.

create table public.chat_threads (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'New chat' check (char_length(title) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index chat_threads_owner_idx on public.chat_threads (owner_id, updated_at desc);
alter table public.chat_threads enable row level security;
create policy "owner manages chats" on public.chat_threads for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter table public.conversations add column thread_id uuid references public.chat_threads (id) on delete cascade;
create index conversations_thread_idx on public.conversations (thread_id, created_at);

-- A message can only go into one of your own chats.
drop policy "owner manages conversations" on public.conversations;
create policy "owner manages conversations" on public.conversations for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
    and (thread_id is null or exists (select 1 from public.chat_threads t where t.id = thread_id and t.owner_id = (select auth.uid())))
  );

-- A new message moves its chat to the top of the list.
create function public.chat_thread_touch() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.thread_id is not null then
    update public.chat_threads set updated_at = now() where id = new.thread_id;
  end if;
  return new;
end;
$$;
create trigger conversations_touch_thread after insert on public.conversations
  for each row execute function public.chat_thread_touch();

-- The studio messages so far become one chat per person, "Earlier chat".
insert into public.chat_threads (owner_id, title, created_at, updated_at)
select owner_id, 'Earlier chat', min(created_at), max(created_at)
from public.conversations
where channel = 'studio'
group by owner_id;

update public.conversations c
set thread_id = t.id
from public.chat_threads t
where c.channel = 'studio' and c.thread_id is null and t.owner_id = c.owner_id and t.title = 'Earlier chat';
