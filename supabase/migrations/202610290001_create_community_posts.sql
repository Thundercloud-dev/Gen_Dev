create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null default 'Runner',
  post_type text not null check (post_type in ('clip', 'tip')),
  title text not null check (char_length(title) between 3 and 100),
  body text not null check (char_length(body) between 1 and 3000),
  link_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_posts_link_url_check check (link_url is null or link_url ~* '^https?://')
);
create index if not exists community_posts_created_at_idx on public.community_posts (created_at desc);
alter table public.community_posts enable row level security;
drop policy if exists "Community posts are publicly readable" on public.community_posts;
create policy "Community posts are publicly readable" on public.community_posts for select to anon, authenticated using (true);
drop policy if exists "Signed-in users can create their own posts" on public.community_posts;
create policy "Signed-in users can create their own posts" on public.community_posts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Authors can update their own posts" on public.community_posts;
create policy "Authors can update their own posts" on public.community_posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Authors can delete their own posts" on public.community_posts;
create policy "Authors can delete their own posts" on public.community_posts for delete to authenticated using ((select auth.uid()) = user_id);
grant select on public.community_posts to anon, authenticated;
grant insert, update, delete on public.community_posts to authenticated;