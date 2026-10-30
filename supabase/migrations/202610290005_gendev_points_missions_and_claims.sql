-- Gendev community mission points.
-- Users may submit claims, but only a trusted administrator can approve them.
create table public.point_missions (
  id text primary key,
  title text not null check (char_length(title) between 3 and 100),
  description text not null check (char_length(description) between 10 and 500),
  category text not null check (category in ('social','challenge','community')),
  points integer not null check (points between 1 and 500),
  sort_order integer not null default 0,
  active boolean not null default true
);

insert into public.point_missions (id, title, description, category, points, sort_order)
values
  ('follow_roblox', 'Follow Roblox', 'Follow Roblox’s official account on a social platform you already use. Tell us which platform in your proof note.', 'social', 50, 1),
  ('follow_minecraft', 'Follow Minecraft', 'Follow Minecraft’s official account on a social platform you already use. Tell us which platform in your proof note.', 'social', 50, 2),
  ('quick_run_100', 'Quick Run: score 100+', 'Reach a score of at least 100 in Gendev Quick Run. Include your score and a screenshot or clip link.', 'challenge', 35, 3),
  ('quick_run_250', 'Quick Run: score 250+', 'Reach a score of at least 250 in Gendev Quick Run. Include your score and a screenshot or clip link.', 'challenge', 75, 4),
  ('first_post', 'Publish a project or tip', 'Publish a useful project, tutorial, or tip in the Gendev community feed. Link your post in the proof note.', 'community', 25, 5),
  ('helpful_tip', 'Help another member', 'Give another Gendev member a helpful answer or useful tip. Explain what you helped with.', 'community', 20, 6)
on conflict (id) do nothing;

create table public.point_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null references public.point_missions(id),
  proof_text text not null check (char_length(proof_text) between 10 and 800),
  proof_url text check (proof_url is null or (char_length(proof_url) <= 500 and proof_url ~ '^https?://')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  awarded_points integer not null default 0 check (awarded_points between 0 and 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index point_claims_user_created_idx on public.point_claims(user_id, created_at desc);
create unique index point_claims_one_active_mission_idx
  on public.point_claims(user_id, mission_id)
  where status in ('pending','approved');

alter table public.point_missions enable row level security;
alter table public.point_claims enable row level security;

grant select on public.point_missions to anon, authenticated;
create policy "Active point missions are public"
  on public.point_missions for select to anon, authenticated
  using (active = true);

revoke all on public.point_claims from anon, authenticated;
grant select on public.point_claims to authenticated;
grant insert (user_id, mission_id, proof_text, proof_url) on public.point_claims to authenticated;

create policy "Users can read their own point claims"
  on public.point_claims for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can submit their own point claims"
  on public.point_claims for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and awarded_points = 0
    and reviewed_at is null
  );

create or replace function public.sync_point_claim_award()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  mission_points integer;
begin
  if new.status = 'approved' then
    select points into mission_points
      from public.point_missions
      where id = new.mission_id and active = true;
    if mission_points is null then
      raise exception 'This point mission is no longer active.';
    end if;
    new.awarded_points := mission_points;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  elsif new.status = 'rejected' then
    new.awarded_points := 0;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  else
    new.awarded_points := 0;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

create trigger sync_point_claim_award
  before insert or update of status, mission_id on public.point_claims
  for each row execute function public.sync_point_claim_award();

create policy "Require MFA for enrolled users"
  on public.point_claims as restrictive
  for all to authenticated
  using (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case
        when count(mfa_factors.id) > 0 then array['aal2']::text[]
        else array['aal1','aal2']::text[]
      end
      from auth.mfa_factors
      where (select auth.uid()) = mfa_factors.user_id
        and mfa_factors.status = 'verified'::auth.factor_status
    )
  )
  with check (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case
        when count(mfa_factors.id) > 0 then array['aal2']::text[]
        else array['aal1','aal2']::text[]
      end
      from auth.mfa_factors
      where (select auth.uid()) = mfa_factors.user_id
        and mfa_factors.status = 'verified'::auth.factor_status
    )
  );

-- To approve a reviewed claim in the Supabase SQL editor:
-- update public.point_claims set status = 'approved' where id = '<claim uuid>' and status = 'pending';
-- The trigger fills in the mission's configured points amount.
