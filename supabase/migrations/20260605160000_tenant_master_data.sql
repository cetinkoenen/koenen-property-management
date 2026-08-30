-- Koenen Property Management: zentrale Mieter-Stammdaten
-- Sicherer erster Schritt: neue Tabellen, keine Änderung bestehender Buchungen/Charts/Darlehen.

create extension if not exists pgcrypto;

create table if not exists public.tenant_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_number text null,
  salutation text null,
  first_name text null,
  last_name text null,
  company_name text null,
  email text null,
  phone text null,
  mobile text null,
  street text null,
  postal_code text null,
  city text null,
  bank_name text null,
  iban text null,
  notes text null,
  status text not null default 'active'
    check (status in ('active', 'notice', 'former', 'prospect')),
  is_deleted boolean not null default false,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant_profiles(id) on delete cascade,
  property_id text null,
  object_code text null,
  unit_label text null,
  rent_type text null,
  cold_rent numeric(12,2) null,
  operating_costs numeric(12,2) null,
  total_rent numeric(12,2) null,
  deposit_amount numeric(12,2) null,
  start_date date null,
  end_date date null,
  status text not null default 'active'
    check (status in ('active', 'vacant', 'ended', 'planned')),
  notes text null,
  is_deleted boolean not null default false,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_tenant_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tenant_profiles_updated_at on public.tenant_profiles;
create trigger set_tenant_profiles_updated_at
before update on public.tenant_profiles
for each row execute function public.set_tenant_updated_at();

drop trigger if exists set_tenant_contracts_updated_at on public.tenant_contracts;
create trigger set_tenant_contracts_updated_at
before update on public.tenant_contracts
for each row execute function public.set_tenant_updated_at();

alter table public.tenant_profiles enable row level security;
alter table public.tenant_contracts enable row level security;

drop policy if exists tenant_profiles_select_own on public.tenant_profiles;
drop policy if exists tenant_profiles_insert_own on public.tenant_profiles;
drop policy if exists tenant_profiles_update_own on public.tenant_profiles;
drop policy if exists tenant_contracts_select_own on public.tenant_contracts;
drop policy if exists tenant_contracts_insert_own on public.tenant_contracts;
drop policy if exists tenant_contracts_update_own on public.tenant_contracts;

create policy tenant_profiles_select_own
on public.tenant_profiles
for select to authenticated
using ((select auth.uid()) = user_id);

create policy tenant_profiles_insert_own
on public.tenant_profiles
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy tenant_profiles_update_own
on public.tenant_profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy tenant_contracts_select_own
on public.tenant_contracts
for select to authenticated
using ((select auth.uid()) = user_id);

create policy tenant_contracts_insert_own
on public.tenant_contracts
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy tenant_contracts_update_own
on public.tenant_contracts
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists idx_tenant_profiles_user_status
on public.tenant_profiles(user_id, status)
where is_deleted = false;

create index if not exists idx_tenant_contracts_user_property
on public.tenant_contracts(user_id, property_id)
where is_deleted = false;

create index if not exists idx_tenant_contracts_tenant_id
on public.tenant_contracts(tenant_id)
where is_deleted = false;
