-- Allgemeine Portfolio-Ausgaben (z. B. Kontofuehrung, Software, Steuerberater)
-- duerfen keiner einzelnen Immobilie zugeordnet werden, sonst werden Objekt-KPIs
-- verfalscht. Normale Objektbuchungen behalten weiterhin ihre object_id.
alter table public.finance_entry
  alter column object_id drop not null;

create index if not exists idx_finance_entry_portfolio_general
on public.finance_entry (objekt_code, booking_date)
where objekt_code = 'PORTFOLIO_GENERAL'
  and coalesce(is_deleted, false) = false;
