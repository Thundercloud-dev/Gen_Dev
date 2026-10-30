alter table public.profiles
  add column if not exists role_tag text not null default 'community',
  add column if not exists featured_badge text;

alter table public.profiles
  drop constraint if exists profiles_role_tag_check;
alter table public.profiles
  add constraint profiles_role_tag_check
  check (role_tag in ('community','developer','creator','gamer','speedrunner'));

alter table public.profiles
  drop constraint if exists profiles_featured_badge_check;
alter table public.profiles
  add constraint profiles_featured_badge_check
  check (featured_badge is null or featured_badge in ('staff','moderator','founder','partner'));

revoke update on public.profiles from authenticated;
grant select on public.profiles to anon, authenticated;
grant insert on public.profiles to authenticated;
grant update (username, display_name, avatar_path, role_tag) on public.profiles to authenticated;

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'general'
    check (channel in ('general','developers','creators','gaming','speedrunning','defeats')),
  author_name text not null default 'Runner'
    check (char_length(author_name) between 1 and 40),
  body text not null check (char_length(body) between 1 and 800),
  created_at timestamptz not null default now()
);
create index if not exists community_messages_channel_created_idx
  on public.community_messages(channel, created_at desc);
alter table public.community_messages enable row level security;
grant select on public.community_messages to anon, authenticated;
grant insert, delete on public.community_messages to authenticated;

drop policy if exists "Anyone can read community chat" on public.community_messages;
create policy "Anyone can read community chat"
  on public.community_messages for select to anon, authenticated using (true);
drop policy if exists "Signed-in users can send their own chat messages" on public.community_messages;
create policy "Signed-in users can send their own chat messages"
  on public.community_messages for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own chat messages" on public.community_messages;
create policy "Users can delete their own chat messages"
  on public.community_messages for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.community_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.community_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);
alter table public.community_message_reports enable row level security;
revoke all on public.community_message_reports from anon, authenticated;
grant insert, select on public.community_message_reports to authenticated;
drop policy if exists "Users can submit their own chat reports" on public.community_message_reports;
create policy "Users can submit their own chat reports"
  on public.community_message_reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id);
drop policy if exists "Users can read their own chat reports" on public.community_message_reports;
create policy "Users can read their own chat reports"
  on public.community_message_reports for select to authenticated
  using ((select auth.uid()) = reporter_id);

create table if not exists public.creator_payout_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text not null unique,
  created_at timestamptz not null default now()
);
alter table public.creator_payout_accounts enable row level security;
revoke all on public.creator_payout_accounts from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'community_messages'
     ) then
    alter publication supabase_realtime add table public.community_messages;
  end if;
end
$$;
