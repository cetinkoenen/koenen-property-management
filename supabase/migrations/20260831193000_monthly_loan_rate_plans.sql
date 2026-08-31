-- Monatliche Tilgungsplaene als zentrale Quelle fuer Kreditraten-Aufteilung.
-- Die Quelldaten bleiben pro Benutzer, Objekt und Monat eindeutig/auditierbar.

create extension if not exists "pgcrypto";

create table if not exists public.property_loan_rate_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id text,
  object_id uuid references public.objects(id) on delete set null,
  objekt_code text,
  property_key text not null,
  property_name text not null,
  plan_date date not null,
  plan_year integer generated always as (extract(year from plan_date)::integer) stored,
  plan_month integer generated always as (extract(month from plan_date)::integer) stored,
  opening_balance numeric(15,2),
  payment_amount numeric(15,2) not null,
  interest_amount numeric(15,2) not null,
  fee_amount numeric(15,2) not null default 0,
  principal_amount numeric(15,2) not null,
  closing_balance numeric(15,2),
  source_file text not null,
  source_row integer not null,
  source_kind text not null default 'csv',
  quality_status text not null default 'ok' check (quality_status in ('ok', 'warning')),
  quality_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_loan_rate_plan_user_month_unique unique (user_id, property_key, plan_year, plan_month),
  constraint property_loan_rate_plan_month_check check (plan_month between 1 and 12)
);

create index if not exists idx_property_loan_rate_plan_lookup
  on public.property_loan_rate_plan(user_id, object_id, plan_year, plan_month);
create index if not exists idx_property_loan_rate_plan_property
  on public.property_loan_rate_plan(user_id, property_key, plan_date);

create or replace function public.set_property_loan_rate_plan_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_property_loan_rate_plan_updated_at on public.property_loan_rate_plan;
create trigger trg_property_loan_rate_plan_updated_at
before update on public.property_loan_rate_plan
for each row execute function public.set_property_loan_rate_plan_updated_at();

alter table public.property_loan_rate_plan enable row level security;

drop policy if exists "property_loan_rate_plan_select_own" on public.property_loan_rate_plan;
drop policy if exists "property_loan_rate_plan_insert_own" on public.property_loan_rate_plan;
drop policy if exists "property_loan_rate_plan_update_own" on public.property_loan_rate_plan;
drop policy if exists "property_loan_rate_plan_delete_own" on public.property_loan_rate_plan;

create policy "property_loan_rate_plan_select_own"
on public.property_loan_rate_plan for select to authenticated
using ((select auth.uid()) = user_id);

create policy "property_loan_rate_plan_insert_own"
on public.property_loan_rate_plan for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "property_loan_rate_plan_update_own"
on public.property_loan_rate_plan for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "property_loan_rate_plan_delete_own"
on public.property_loan_rate_plan for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.property_loan_rate_plan to authenticated;
revoke all on public.property_loan_rate_plan from anon;

alter table public.finance_entry
  add column if not exists loan_interest_amount numeric(15,2),
  add column if not exists loan_principal_amount numeric(15,2),
  add column if not exists loan_rate_plan_id uuid references public.property_loan_rate_plan(id) on delete set null,
  add column if not exists loan_split_source text;

comment on table public.property_loan_rate_plan is
  'Zentrale monatliche Quelle fuer Kreditrate, Zins, Tilgung und Restschuld aus importierten Tilgungsplaenen.';
comment on column public.finance_entry.loan_interest_amount is
  'Tatsaechlich gebuchter Zinsanteil der Kreditrate; steuerlich relevant bei vermieteten Objekten.';
comment on column public.finance_entry.loan_principal_amount is
  'Tilgungsanteil der Kreditrate; nicht als Werbungskosten abziehbar.';
