-- Koenen Property Management: professionelle Verwaltungsgrundlage
-- Neue Zusatz-Tabellen fuer Sollstellungen, Mahnungen, Regeln und Ein-/Auszugsprozesse.
-- Bestehende Buchungen bleiben Hauptquelle fuer Ist-Zahlungen und werden nicht veraendert.

create extension if not exists pgcrypto;

create table if not exists public.rent_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_contract_id uuid null references public.tenant_contracts(id) on delete set null,
  tenant_id uuid null references public.tenant_profiles(id) on delete set null,
  property_id text null,
  object_code text null,
  unit_label text null,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  due_date date not null,
  cold_rent numeric(12,2) not null default 0,
  operating_costs numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  status text not null default 'expected'
    check (status in ('expected', 'partial', 'paid', 'vacant', 'blocked', 'waived')),
  source text not null default 'contract'
    check (source in ('contract', 'manual', 'system')),
  notes text null,
  is_deleted boolean not null default false,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, tenant_contract_id, period_year, period_month)
);

create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rent_schedule_id uuid null references public.rent_schedules(id) on delete set null,
  tenant_id uuid null references public.tenant_profiles(id) on delete set null,
  tenant_contract_id uuid null references public.tenant_contracts(id) on delete set null,
  property_id text null,
  object_code text null,
  unit_label text null,
  reminder_level text not null default 'zahlungserinnerung'
    check (reminder_level in ('zahlungserinnerung', 'mahnung_1', 'mahnung_2', 'letzte_mahnung')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'blocked', 'resolved', 'archived')),
  due_date date null,
  open_amount numeric(12,2) not null default 0,
  fee_amount numeric(12,2) not null default 0,
  interest_amount numeric(12,2) not null default 0,
  subject text null,
  body text null,
  reminder_key text not null default left(replace(gen_random_uuid()::text, '-', ''), 16),
  sent_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  match_text text not null,
  property_id text null,
  object_code text null,
  unit_label text null,
  entry_type public.entry_type null,
  category text null,
  tax_relevant boolean null,
  priority integer not null default 100,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.move_processes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid null references public.tenant_profiles(id) on delete set null,
  tenant_contract_id uuid null references public.tenant_contracts(id) on delete set null,
  property_id text null,
  object_code text null,
  unit_label text null,
  process_type text not null default 'auszug'
    check (process_type in ('einzug', 'auszug', 'wechsel')),
  status text not null default 'offen'
    check (status in ('offen', 'in_bearbeitung', 'erledigt', 'archiviert')),
  handover_date date null,
  meter_readings jsonb not null default '{}'::jsonb,
  deposit_status text null,
  checklist jsonb not null default '{}'::jsonb,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_professional_workflow_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_rent_schedules_updated_at on public.rent_schedules;
create trigger set_rent_schedules_updated_at
before update on public.rent_schedules
for each row execute function public.set_professional_workflow_updated_at();

drop trigger if exists set_payment_reminders_updated_at on public.payment_reminders;
create trigger set_payment_reminders_updated_at
before update on public.payment_reminders
for each row execute function public.set_professional_workflow_updated_at();

drop trigger if exists set_transaction_rules_updated_at on public.transaction_rules;
create trigger set_transaction_rules_updated_at
before update on public.transaction_rules
for each row execute function public.set_professional_workflow_updated_at();

drop trigger if exists set_move_processes_updated_at on public.move_processes;
create trigger set_move_processes_updated_at
before update on public.move_processes
for each row execute function public.set_professional_workflow_updated_at();

alter table public.rent_schedules enable row level security;
alter table public.payment_reminders enable row level security;
alter table public.transaction_rules enable row level security;
alter table public.move_processes enable row level security;

drop policy if exists rent_schedules_own on public.rent_schedules;
create policy rent_schedules_own on public.rent_schedules
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists payment_reminders_own on public.payment_reminders;
create policy payment_reminders_own on public.payment_reminders
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists transaction_rules_own on public.transaction_rules;
create policy transaction_rules_own on public.transaction_rules
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists move_processes_own on public.move_processes;
create policy move_processes_own on public.move_processes
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists idx_rent_schedules_user_period
on public.rent_schedules(user_id, period_year, period_month, status)
where is_deleted = false;

create index if not exists idx_payment_reminders_user_status
on public.payment_reminders(user_id, status, created_at);

create index if not exists idx_transaction_rules_user_active
on public.transaction_rules(user_id, is_active, priority);

create index if not exists idx_move_processes_user_status
on public.move_processes(user_id, status, handover_date);
