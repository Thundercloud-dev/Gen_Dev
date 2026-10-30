alter table public.community_posts
  add column if not exists media_path text;

alter table public.profiles
  add column if not exists avatar_path text;

create index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-media',
  'community-media',
  true,
  26214400,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Players can create their own profile" on public.profiles;
create policy "Players can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Public can read community media" on storage.objects;
create policy "Public can read community media"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'community-media');

drop policy if exists "Signed-in users upload their own community media" on storage.objects;
create policy "Signed-in users upload their own community media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users delete their own community media" on storage.objects;
create policy "Users delete their own community media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.community_posts to anon, authenticated;
grant insert, update, delete on public.community_posts to authenticated;
