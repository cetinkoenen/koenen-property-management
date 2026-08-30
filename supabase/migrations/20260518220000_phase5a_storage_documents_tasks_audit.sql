-- Koenen Property Management – Phase 5A
-- Supabase Storage + Dokumentenarchiv + Aufgaben + Audit-Log + RLS
-- Ausführen im Supabase SQL Editor oder über Supabase CLI Migration.

create extension if not exists pgcrypto;

-- 1) Privater Storage-Bucket für Objektunterlagen
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-documents',
  'property-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Dokumentenarchiv je Immobilie/Jahr/Kategorie
create table if not exists public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid null,
  portfolio_property_id uuid null,
  objekt_code text null,
  property_name text null,
  title text not null,
  category text not null default 'sonstiges' check (
    category in (
      'mietvertrag',
      'rechnung',
      'nk_abrechnung',
      'energieausweis',
      'darlehensunterlage',
      'weg_protokoll',
      'expose',
      'steuer',
      'versicherung',
      'sonstiges'
    )
  ),
  document_year integer null check (document_year is null or document_year between 1990 and 2100),
  valid_from date null,
  valid_until date null,
  status text not null default 'vorhanden' check (status in ('vorhanden', 'fehlt', 'läuft_bald_ab', 'abgelaufen', 'archiviert')),
  storage_bucket text not null default 'property-documents',
  storage_path text not null unique,
  file_name text not null,
  mime_type text null,
  size_bytes bigint null check (size_bytes is null or size_bytes >= 0),
  notes text null,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_property_documents_property_id on public.property_documents(property_id);
create index if not exists idx_property_documents_portfolio_property_id on public.property_documents(portfolio_property_id);
create index if not exists idx_property_documents_objekt_code on public.property_documents(objekt_code);
create index if not exists idx_property_documents_year_category on public.property_documents(document_year, category);
create index if not exists idx_property_documents_valid_until on public.property_documents(valid_until);
create index if not exists idx_property_documents_storage_path on public.property_documents(storage_path);

-- 3) Aufgaben/Workflows persistent machen
create table if not exists public.property_tasks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid null,
  portfolio_property_id uuid null,
  objekt_code text null,
  property_name text null,
  title text not null,
  description text null,
  category text not null default 'allgemein' check (
    category in ('miete', 'nk', 'dokument', 'darlehen', 'capex', 'leerstand', 'prüfung', 'allgemein')
  ),
  priority text not null default 'mittel' check (priority in ('niedrig', 'mittel', 'hoch', 'kritisch')),
  status text not null default 'offen' check (status in ('offen', 'in_bearbeitung', 'erledigt', 'archiviert')),
  due_date date null,
  source text not null default 'manuell' check (source in ('manuell', 'system', 'import', 'datenprüfung')),
  related_document_id uuid null references public.property_documents(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists idx_property_tasks_property_id on public.property_tasks(property_id);
create index if not exists idx_property_tasks_status_priority on public.property_tasks(status, priority);
create index if not exists idx_property_tasks_due_date on public.property_tasks(due_date);
create index if not exists idx_property_tasks_category on public.property_tasks(category);

-- 4) Audit-Log persistent machen / bestehende Tabelle erweitern
create table if not exists public.app_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  property_id uuid null,
  portfolio_property_id uuid null,
  objekt_code text null,
  label text null,
  old_value jsonb null,
  new_value jsonb null,
  meta jsonb null default '{}'::jsonb,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.app_audit_log add column if not exists portfolio_property_id uuid null;
alter table public.app_audit_log add column if not exists objekt_code text null;
alter table public.app_audit_log add column if not exists created_by uuid null default auth.uid();
alter table public.app_audit_log add column if not exists created_at timestamptz not null default now();

create index if not exists idx_app_audit_log_property_id on public.app_audit_log(property_id);
create index if not exists idx_app_audit_log_action on public.app_audit_log(action);
create index if not exists idx_app_audit_log_created_at on public.app_audit_log(created_at desc);

-- 5) updated_at Trigger zentral
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_property_documents_updated_at on public.property_documents;
create trigger trg_property_documents_updated_at
before update on public.property_documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_property_tasks_updated_at on public.property_tasks;
create trigger trg_property_tasks_updated_at
before update on public.property_tasks
for each row execute function public.set_updated_at();

-- 6) RLS: Single-Admin-Ansatz
alter table public.property_documents enable row level security;
alter table public.property_tasks enable row level security;
alter table public.app_audit_log enable row level security;

drop policy if exists admin_only_property_documents on public.property_documents;
create policy admin_only_property_documents
on public.property_documents
for all
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com');

drop policy if exists admin_only_property_tasks on public.property_tasks;
create policy admin_only_property_tasks
on public.property_tasks
for all
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com');

drop policy if exists admin_only_app_audit_log on public.app_audit_log;
create policy admin_only_app_audit_log
on public.app_audit_log
for all
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com');

-- Storage-Policies für privaten Bucket
-- Wichtig: Diese Policies greifen auf storage.objects, nicht auf public.property_documents.
drop policy if exists admin_only_property_document_storage_select on storage.objects;
create policy admin_only_property_document_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property-documents'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com'
);

drop policy if exists admin_only_property_document_storage_insert on storage.objects;
create policy admin_only_property_document_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'property-documents'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com'
);

drop policy if exists admin_only_property_document_storage_update on storage.objects;
create policy admin_only_property_document_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'property-documents'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com'
)
with check (
  bucket_id = 'property-documents'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com'
);

drop policy if exists admin_only_property_document_storage_delete on storage.objects;
create policy admin_only_property_document_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'property-documents'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com'
);

-- 7) Übersichtsfunktionen für Dashboard/Auswertung
create or replace function public.get_property_document_summary(p_year integer default null)
returns table (
  property_id uuid,
  portfolio_property_id uuid,
  objekt_code text,
  property_name text,
  total_documents bigint,
  missing_documents bigint,
  expiring_documents bigint,
  archived_documents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.property_id,
    d.portfolio_property_id,
    d.objekt_code,
    max(d.property_name) as property_name,
    count(*)::bigint as total_documents,
    count(*) filter (where d.status = 'fehlt')::bigint as missing_documents,
    count(*) filter (where d.valid_until is not null and d.valid_until <= current_date + interval '90 days' and d.status <> 'archiviert')::bigint as expiring_documents,
    count(*) filter (where d.status = 'archiviert')::bigint as archived_documents
  from public.property_documents d
  where p_year is null or d.document_year = p_year
  group by d.property_id, d.portfolio_property_id, d.objekt_code;
$$;

create or replace function public.get_property_task_summary()
returns table (
  property_id uuid,
  portfolio_property_id uuid,
  objekt_code text,
  property_name text,
  open_tasks bigint,
  critical_tasks bigint,
  overdue_tasks bigint,
  done_tasks bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.property_id,
    t.portfolio_property_id,
    t.objekt_code,
    max(t.property_name) as property_name,
    count(*) filter (where t.status in ('offen', 'in_bearbeitung'))::bigint as open_tasks,
    count(*) filter (where t.priority = 'kritisch' and t.status <> 'erledigt')::bigint as critical_tasks,
    count(*) filter (where t.due_date is not null and t.due_date < current_date and t.status not in ('erledigt', 'archiviert'))::bigint as overdue_tasks,
    count(*) filter (where t.status = 'erledigt')::bigint as done_tasks
  from public.property_tasks t
  group by t.property_id, t.portfolio_property_id, t.objekt_code;
$$;

-- 8) Rechte für authenticated Rolle
revoke all on public.property_documents from anon;
revoke all on public.property_tasks from anon;
revoke all on public.app_audit_log from anon;

grant select, insert, update, delete on public.property_documents to authenticated;
grant select, insert, update, delete on public.property_tasks to authenticated;
grant select, insert on public.app_audit_log to authenticated;
grant execute on function public.get_property_document_summary(integer) to authenticated;
grant execute on function public.get_property_task_summary() to authenticated;
