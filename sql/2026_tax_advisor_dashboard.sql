-- Steuer-Berater & Finanzamt Dashboard
-- Ziel: saubere Datenbasis fuer Anlage V, §35a EStG, Homeoffice-Anteil und Exportpakete.

create table if not exists public.property_tax_profile (
  id uuid primary key default gen_random_uuid(),
  property_id uuid null,
  portfolio_property_id uuid null,
  object_label text not null,
  tax_usage_status text not null default 'vermietet'
    check (tax_usage_status in ('vermietet', 'stellplatz_vermietung', 'selbstgenutzt_weg')),
  building_year integer null,
  acquisition_price numeric(14,2) not null default 0,
  afa_rate numeric(6,4) not null default 0.0200,
  home_office_percentage numeric(5,2) not null default 0
    check (home_office_percentage >= 0 and home_office_percentage <= 100),
  bank_account_flat_fee numeric(8,2) not null default 16,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (object_label)
);

alter table public.finance_entry
  add column if not exists payment_method text default 'bank'
    check (payment_method in ('bank', 'barzahlung', 'karte', 'unbekannt')),
  add column if not exists labor_amount numeric(14,2) null,
  add column if not exists material_amount numeric(14,2) null,
  add column if not exists travel_amount numeric(14,2) null,
  add column if not exists section35a_type text default 'none'
    check (section35a_type in ('none', 'haushaltsnah', 'handwerker')),
  add column if not exists maintenance_distribution_years integer default 1
    check (maintenance_distribution_years between 1 and 5),
  add column if not exists anlage_v_category text null;

create table if not exists public.tax_inventory_afa_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid null,
  portfolio_property_id uuid null,
  object_label text not null,
  invoice_date date not null,
  description text not null,
  amount_net numeric(14,2) not null default 0,
  useful_life_years integer not null default 10 check (useful_life_years between 1 and 50),
  immediate_deduction boolean generated always as (amount_net <= 800) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tax_report_exports (
  id uuid primary key default gen_random_uuid(),
  tax_year integer not null,
  report_kind text not null check (report_kind in ('anlage_v', 'section35a', 'steuerberater_paket')),
  object_label text null,
  generated_by uuid null,
  report_snapshot jsonb not null default '{}'::jsonb,
  file_path text null,
  created_at timestamptz not null default now()
);

insert into public.property_tax_profile (
  object_label,
  tax_usage_status,
  building_year,
  acquisition_price,
  afa_rate,
  bank_account_flat_fee
) values
  ('Lilienthaler Str. 54', 'vermietet', 1956, 145000, 0.0200, 16),
  ('Elsasser Str. 52', 'vermietet', 1956, 160000, 0.0200, 16),
  ('Colmarer Str. 45', 'vermietet', 1956, 145000, 0.0200, 16),
  ('Fürther Str. 74', 'vermietet', 1956, 140000, 0.0200, 16),
  ('Rosensteinstr. 25', 'stellplatz_vermietung', 1960, 0, 0.0200, 16),
  ('Hohenloher Str. 78', 'selbstgenutzt_weg', 2025, 530000, 0.0000, 0)
on conflict (object_label) do update set
  tax_usage_status = excluded.tax_usage_status,
  building_year = excluded.building_year,
  acquisition_price = excluded.acquisition_price,
  afa_rate = excluded.afa_rate,
  bank_account_flat_fee = excluded.bank_account_flat_fee,
  updated_at = now();

comment on table public.property_tax_profile is
  'Steuerliche Objektprofile: Anlage-V-faehige Objekte, Stellplatz-Sonderlogik und Hohenloher §35a-Sperre.';

comment on column public.finance_entry.labor_amount is
  'Arbeitslohnanteil fuer §35a. Wenn leer, wird Betrag minus Material als Fallback genutzt.';
comment on column public.finance_entry.material_amount is
  'Materialanteil; wird fuer §35a zwingend ausgeschlossen.';
comment on column public.finance_entry.payment_method is
  'Barzahlungen werden fuer §35a ausgeschlossen und als Warnung ausgewiesen.';
