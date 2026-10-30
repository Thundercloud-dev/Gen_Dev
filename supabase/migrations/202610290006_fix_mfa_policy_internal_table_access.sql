-- Replace direct auth.mfa_factors references in RLS policies.
-- Client roles do not have direct permission to query Supabase's internal MFA table.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.mfa_access_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    or not exists (
      select 1
      from auth.mfa_factors as factor
      where factor.user_id = (select auth.uid())
        and factor.status = 'verified'::auth.factor_status
    );
$$;

revoke all on function private.mfa_access_ok() from public;
grant execute on function private.mfa_access_ok() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'parkour_progress',
    'community_posts',
    'community_messages',
    'community_message_reports',
    'custom_levels',
    'leaderboard_entries',
    'point_claims'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Require MFA for enrolled users', table_name);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select private.mfa_access_ok())) with check ((select private.mfa_access_ok()))',
      'Require MFA for enrolled users',
      table_name
    );
  end loop;
end
$$;
