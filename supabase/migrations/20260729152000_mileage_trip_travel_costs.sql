alter table public.property_mileage_trips
  add column if not exists verkehrsmittel text not null default 'car'
    check (verkehrsmittel in ('car', 'public_transport')),
  add column if not exists ticketpreis_brutto numeric(12,2) not null default 0 check (ticketpreis_brutto >= 0),
  add column if not exists mehrtaegige_reise boolean not null default false,
  add column if not exists hotelkosten_brutto numeric(12,2) not null default 0 check (hotelkosten_brutto >= 0),
  add column if not exists anzahl_uebernachtungen integer not null default 0 check (anzahl_uebernachtungen >= 0),
  add column if not exists fruehstueck_inklusive boolean not null default false,
  add column if not exists vma_betrag numeric(12,2) not null default 0 check (vma_betrag >= 0),
  add column if not exists fahrtkosten_betrag numeric(12,2) not null default 0 check (fahrtkosten_betrag >= 0),
  add column if not exists reisekosten_betrag numeric(12,2) not null default 0 check (reisekosten_betrag >= 0);

update public.property_mileage_trips
set
  verkehrsmittel = coalesce(verkehrsmittel, 'car'),
  fahrtkosten_betrag = round((distanz_km * case when hin_und_rueckfahrt then 2 else 1 end * 0.30)::numeric, 2),
  reisekosten_betrag = round((distanz_km * case when hin_und_rueckfahrt then 2 else 1 end * 0.30)::numeric, 2)
where coalesce(fahrtkosten_betrag, 0) = 0
  and coalesce(reisekosten_betrag, 0) = 0;

alter table public.property_mileage_trips
  drop column if exists berechneter_betrag;

alter table public.property_mileage_trips
  add column berechneter_betrag numeric(12,2) generated always as (
    round((
      coalesce(reisekosten_betrag, 0)
    )::numeric, 2)
  ) stored;

create index if not exists idx_property_mileage_trips_transport_year
on public.property_mileage_trips(verkehrsmittel, steuerjahr, datum desc);
