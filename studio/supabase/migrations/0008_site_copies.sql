-- Sono Studio · Exact copies of a client's own site
-- The copy is one zip in a private bucket; the row describes it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-copies', 'site-copies', false, 52428800, array['application/zip'])
on conflict (id) do nothing;

create policy "owner reads site copies" on storage.objects for select to authenticated
  using (bucket_id = 'site-copies' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner writes site copies" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-copies' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner replaces site copies" on storage.objects for update to authenticated
  using (bucket_id = 'site-copies' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner deletes site copies" on storage.objects for delete to authenticated
  using (bucket_id = 'site-copies' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table public.site_copies (
  project_id    uuid primary key references public.projects (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meta          jsonb not null,
  storage_path  text not null,
  updated_at    timestamptz not null default now()
);
create trigger site_copies_touch before update on public.site_copies
  for each row execute function public.touch_updated_at();

alter table public.site_copies enable row level security;
create policy "owner manages site copies" on public.site_copies for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
