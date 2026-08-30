-- Koenen Property Management: Leerstandmanagement fuer Einheiten
-- Eigene Tabelle, damit bestehende Buchungen, Portfolio-Zeitraeume und Charts unveraendert bleiben.

create table if not exists public.unit_vacancies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id text not null,
  object_code text null,
  object_label text null,
  unit_label text null,
  vacancy_type text not null default 'manual'
    check (vacancy_type in ('manual', 'contract_ended', 'notice', 'other')),
  status text not null default 'active'
    check (status in ('active', 'planned', 'ended')),
  start_date date not null,
  end_date date null,
  reason text null,
  notes text null,
  is_deleted boolean not null default false,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_unit_vacancies_updated_at on public.unit_vacancies;
create trigger set_unit_vacancies_updated_at
before update on public.unit_vacancies
for each row execute function public.set_tenant_updated_at();

alter table public.unit_vacancies enable row level security;

drop policy if exists unit_vacancies_select_own on public.unit_vacancies;
drop policy if exists unit_vacancies_insert_own on public.unit_vacancies;
drop policy if exists unit_vacancies_update_own on public.unit_vacancies;

create policy unit_vacancies_select_own
on public.unit_vacancies
for select to authenticated
using ((select auth.uid()) = user_id);

create policy unit_vacancies_insert_own
on public.unit_vacancies
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy unit_vacancies_update_own
on public.unit_vacancies
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists idx_unit_vacancies_user_property
on public.unit_vacancies(user_id, property_id, start_date)
where is_deleted = false;

create index if not exists idx_unit_vacancies_user_status
on public.unit_vacancies(user_id, status, start_date)
where is_deleted = false;
