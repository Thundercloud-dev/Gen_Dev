create table if not exists public.community_reviews (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 rating smallint not null check(rating between 1 and 5),
 review_text text not null check(char_length(btrim(review_text)) between 15 and 500),
 country text null check(country is null or char_length(btrim(country)) between 2 and 56),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.community_reviews enable row level security;
grant select on public.community_reviews to anon,authenticated;
grant insert,update,delete on public.community_reviews to authenticated;
create policy "Community reviews are public" on public.community_reviews for select to anon,authenticated using(true);
create policy "Members can submit their own review" on public.community_reviews for insert to authenticated with check((select auth.uid())=user_id);
create policy "Members can update their own review" on public.community_reviews for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "Members can delete their own review" on public.community_reviews for delete to authenticated using((select auth.uid())=user_id);
create policy "Require MFA for enrolled users" on public.community_reviews as restrictive for all to authenticated using((select private.mfa_access_ok())) with check((select private.mfa_access_ok()));
create table if not exists private.ai_assistant_usage(user_id uuid primary key references auth.users(id) on delete cascade,usage_day date not null,request_count integer not null default 0 check(request_count between 0 and 15),updated_at timestamptz not null default now());
alter table private.ai_assistant_usage enable row level security;
grant usage on schema private to authenticated;
grant select,insert,update on private.ai_assistant_usage to authenticated;
create policy "Members can access only their own assistant usage" on private.ai_assistant_usage for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create or replace function public.consume_ai_assistant_quota() returns boolean language plpgsql security invoker set search_path='' as $$
declare caller_id uuid := (select auth.uid()); current_count integer;
begin
 if caller_id is null or not (select private.mfa_access_ok()) then return false; end if;
 insert into private.ai_assistant_usage as usage(user_id,usage_day,request_count,updated_at) values(caller_id,current_date,1,now())
 on conflict(user_id) do update set usage_day=case when usage.usage_day<current_date then current_date else usage.usage_day end,request_count=case when usage.usage_day<current_date then 1 else usage.request_count+1 end,updated_at=now()
 where usage.usage_day<current_date or usage.request_count<15 returning request_count into current_count;
 return current_count is not null;
end; $$;
revoke all on function public.consume_ai_assistant_quota() from public,anon;
grant execute on function public.consume_ai_assistant_quota() to authenticated;
