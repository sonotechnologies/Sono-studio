-- Sono Studio · Phase 7 (Presets and reference)
-- Your own styles: a built-in preset as the base (type scale, heading style,
-- layouts) with its colours, fonts and corners replaced.

create table public.style_presets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  note        text not null default '' check (char_length(note) <= 200),
  theme       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index style_presets_owner_idx on public.style_presets (owner_id, created_at desc);
create trigger style_presets_touch before update on public.style_presets
  for each row execute function public.touch_updated_at();

alter table public.style_presets enable row level security;
create policy "owner manages styles" on public.style_presets for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
