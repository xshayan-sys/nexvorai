-- =========================================================
-- nexvorai — Supabase setup
-- Run once in Supabase Studio → SQL Editor → New query → Run
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 1. projects table
-- ---------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null,
  client      text        not null,
  category    text        not null default 'Social',
  description text,
  video_url   text        not null,
  poster_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_category_check
    check (category in ('Social', 'Brand Film', 'Motion', 'Creator'))
);

create index if not exists projects_created_at_idx
  on public.projects (created_at desc);

-- keep updated_at honest
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------
-- 2. Row Level Security
--    Public (anon) may READ only.
--    Insert / update / delete are intentionally NOT granted to
--    anon or authenticated — they happen exclusively through the
--    Vercel serverless functions using the service-role key,
--    which bypasses RLS. This is what disables public sign-ups
--    and public writes.
-- ---------------------------------------------------------
alter table public.projects enable row level security;
alter table public.projects force row level security;

drop policy if exists "projects public read" on public.projects;
create policy "projects public read"
  on public.projects
  for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policies exist on purpose.

-- ---------------------------------------------------------
-- 3. Public storage bucket for videos + posters
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  true,
  524288000, -- 500 MB per file
  array[
    'video/mp4','video/quicktime','video/webm','video/x-m4v','video/x-matroska','video/mpeg','video/ogg',
    'image/jpeg','image/png','image/webp','image/avif'
  ]
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------
-- 4. Storage policies
--    Anyone may PLAY / read objects in the bucket.
--    Uploads, overwrites and deletes are restricted to the
--    service role (i.e. the server functions only).
-- ---------------------------------------------------------
drop policy if exists "videos public read" on storage.objects;
create policy "videos public read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'videos');

drop policy if exists "videos server insert" on storage.objects;
create policy "videos server insert"
  on storage.objects
  for insert
  to service_role
  with check (bucket_id = 'videos');

drop policy if exists "videos server update" on storage.objects;
create policy "videos server update"
  on storage.objects
  for update
  to service_role
  using (bucket_id = 'videos')
  with check (bucket_id = 'videos');

drop policy if exists "videos server delete" on storage.objects;
create policy "videos server delete"
  on storage.objects
  for delete
  to service_role
  using (bucket_id = 'videos');

-- ---------------------------------------------------------
-- 5. Optional — seed one row so the grid is never empty.
--    Delete it from the admin console whenever you like.
-- ---------------------------------------------------------
-- insert into public.projects (title, client, category, description, video_url)
-- values ('Aurora — launch film', 'Aurora Labs', 'Brand Film',
--         'Ninety seconds to explain a new category.',
--         'https://your-project.supabase.co/storage/v1/object/public/videos/clips/example.mp4');
