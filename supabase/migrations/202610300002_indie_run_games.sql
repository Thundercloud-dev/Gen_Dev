create table if not exists public.developer_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 70),
  description text not null check (char_length(btrim(description)) between 20 and 700),
  category text not null check (category in ('platformer','adventure','puzzle','strategy','simulation','arcade','horror','other')),
  demo_url text not null check (demo_url ~* '^https://'),
  project_url text null check (project_url is null or project_url ~* '^https://'),
  cover_image_url text null check (cover_image_url is null or cover_image_url ~* '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.developer_games enable row level security;
grant select on public.developer_games to anon, authenticated;
grant insert, update, delete on public.developer_games to authenticated;
drop policy if exists "Developer games are public" on public.developer_games;
create policy "Developer games are public" on public.developer_games for select to anon, authenticated using (true);
drop policy if exists "Developers can publish their own games" on public.developer_games;
create policy "Developers can publish their own games" on public.developer_games for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Developers can update their own games" on public.developer_games;
create policy "Developers can update their own games" on public.developer_games for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Developers can delete their own games" on public.developer_games;
create policy "Developers can delete their own games" on public.developer_games for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Require MFA for enrolled users" on public.developer_games;
create policy "Require MFA for enrolled users" on public.developer_games as restrictive for all to authenticated using ((select private.mfa_access_ok())) with check ((select private.mfa_access_ok()));
