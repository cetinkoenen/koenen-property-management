-- Emergency remediation for Supabase Advisor finding `rls_disabled_in_public`.
--
-- Any table in the exposed public schema without RLS is unsafe. Existing
-- RLS-enabled application tables are intentionally left untouched. Tables
-- found without RLS are fail-closed: browser roles lose all privileges and
-- RLS is enabled without an allow policy. The service_role remains available
-- for controlled server-side recovery or follow-up data migration work.

do $$
declare
  target record;
begin
  for target in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name
    from pg_class as relation
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity = false
    order by relation.relname
  loop
    execute format(
      'alter table %I.%I enable row level security',
      target.schema_name,
      target.table_name
    );

    execute format(
      'revoke all privileges on table %I.%I from anon, authenticated',
      target.schema_name,
      target.table_name
    );

    raise notice 'Enabled RLS and revoked browser access for %.%',
      target.schema_name,
      target.table_name;
  end loop;
end
$$;

-- Internal August 2026 repair snapshots are named explicitly so their intended
-- status remains documented even after the generic remediation above has run.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'finance_entry_backup_tax_cleanup_20260803',
    'finance_entry_backup_acquisition_side_cost_20260803'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I enable row level security',
      target_table
    );

    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      target_table
    );

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'deny_browser_api_access'
    ) then
      execute format(
        'create policy deny_browser_api_access on public.%I for all to anon, authenticated using (false) with check (false)',
        target_table
      );
    end if;
  end loop;
end
$$;

-- Secure-by-default guard recommended by Supabase: every table created later
-- in the exposed public schema receives RLS at the end of its CREATE command.
create or replace function public.koenen_enable_rls_on_new_public_tables()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  command record;
begin
  for command in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if command.schema_name = 'public' then
      execute format(
        'alter table if exists %s enable row level security',
        command.object_identity
      );
    end if;
  end loop;
end
$$;

revoke execute
  on function public.koenen_enable_rls_on_new_public_tables()
  from public, anon, authenticated;

drop event trigger if exists koenen_ensure_public_table_rls;

create event trigger koenen_ensure_public_table_rls
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function public.koenen_enable_rls_on_new_public_tables();

-- Fail the migration if any ordinary or partitioned table in the exposed
-- schema is still missing RLS. This turns future regressions into a visible
-- deployment error instead of leaving data publicly reachable.
do $$
declare
  unprotected_tables text;
begin
  select string_agg(format('%I.%I', namespace.nspname, relation.relname), ', ')
    into unprotected_tables
  from pg_class as relation
  join pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and relation.relrowsecurity = false;

  if unprotected_tables is not null then
    raise exception 'RLS is still disabled for: %', unprotected_tables;
  end if;
end
$$;
