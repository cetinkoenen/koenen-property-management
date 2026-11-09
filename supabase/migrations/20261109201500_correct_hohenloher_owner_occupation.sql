-- Hohenloher Str. 78 wird dauerhaft selbst genutzt. Frühere Eingänge waren
-- Eigenmittel-Umbuchungen zum Immobilienkonto, keine Miete. Die historischen
-- Kontobewegungen bleiben erhalten, werden jedoch steuerlich und im
-- Mieteingang eindeutig von Vermietung getrennt.

do $$
declare
  core_object_id uuid;
  portfolio_property_id uuid;
begin
  select bridge.object_id
    into core_object_id
    from public.v_koenen_object_bridge bridge
   where public.koenen_normalize_object_name(bridge.property_name) = public.koenen_normalize_object_name('Hohenloher Str. 78')
   order by bridge.object_id
   limit 1;

  select property.id
    into portfolio_property_id
    from public.portfolio_properties property
   where public.koenen_normalize_object_name(property.name) = public.koenen_normalize_object_name('Hohenloher Str. 78')
     and not coalesce(property.is_test, false)
   order by property.created_at
   limit 1;

  if core_object_id is null or portfolio_property_id is null then
    raise exception 'Hohenloher Str. 78 konnte nicht in allen Hauptquellen aufgelöst werden';
  end if;

  -- Kein Mietvertrag und keine Mietanpassung für eine eigene Wohnung.
  update public.tenant_contracts
     set status = 'ended',
         is_deleted = true,
         deleted_at = coalesce(deleted_at, now()),
         notes = trim(both ' ' from concat_ws(' | ', nullif(notes, ''), 'Korrektur: Eigennutzung, kein Mietverhältnis.')),
         updated_at = now()
   where property_id::text = core_object_id::text
     and not coalesce(is_deleted, false);

  update public.rent_adjustments
     set is_deleted = true,
         deleted_at = coalesce(deleted_at, now()),
         updated_at = now()
   where property_id::text = core_object_id::text
     and not coalesce(is_deleted, false);

  -- portfolio_property_rentals ist lediglich die abgeleitete Mietquelle.
  -- Falsche historische Mietzeilen werden entfernt; Finanzbuchungen bleiben
  -- unangetastet und sind unten weiterhin revisionssicher vorhanden.
  delete from public.portfolio_property_rentals
   where property_id = portfolio_property_id;

  -- Private Zuführungen an das Immobilienkonto: sichtbar, aber nie Miete.
  update public.finance_entry
     set category = 'Eigenmittelzuführung (Eigennutzung)',
         tax_relevant = false,
         nk_relevant = false,
         note = trim(both ' ' from concat_ws(' | ', nullif(note, ''), 'Eigennutzung Hohenloher: interne Eigenmittelzuführung, keine Miete.')),
         updated_at = now()
   where entry_type = 'income'
     and object_id::text = core_object_id::text
     and coalesce(is_deleted, false) = false;

  -- Die tatsächliche Rate bleibt für Darlehen und persönlichen Cashflow
  -- dokumentiert; sie ist bei Eigennutzung keine Anlage-V-Ausgabe.
  update public.finance_entry
     set tax_relevant = false,
         nk_relevant = false,
         note = trim(both ' ' from concat_ws(' | ', nullif(note, ''), 'Eigennutzung Hohenloher: Kreditrate privat, nicht Anlage V.')),
         updated_at = now()
   where entry_type = 'expense'
     and object_id::text = core_object_id::text
     and lower(coalesce(category, '')) in ('kreditrate', 'darlehensrate')
     and coalesce(is_deleted, false) = false;

  -- Monatliches Hausgeld bleibt im Kontoverlauf sichtbar, aber ist kein
  -- Mieter-Nebenkostenposten. §35a-Anteile entstehen nur aus der separaten
  -- WEG-Jahresabrechnung und werden nicht aus dieser Pauschalrate abgeleitet.
  update public.finance_entry
     set category = 'WEG-Hausgeld (Eigennutzung)',
         tax_relevant = false,
         nk_relevant = false,
         note = trim(both ' ' from concat_ws(' | ', nullif(note, ''), 'Eigennutzung Hohenloher: WEG-Hausgeld, keine Anlage V. §35a nur nach Jahresabrechnung.')),
         updated_at = now()
   where entry_type = 'expense'
     and object_id::text = core_object_id::text
     and abs(coalesce(amount, 0)::numeric - 270::numeric) <= 0.01
     and lower(coalesce(category, '')) in ('verwaltungskosten', 'hausgeld', 'weg', 'mietbestandteil-nk')
     and coalesce(is_deleted, false) = false;

  if exists (
    select 1 from public.tenant_contracts
     where property_id::text = core_object_id::text and not coalesce(is_deleted, false)
  ) or exists (
    select 1 from public.portfolio_property_rentals
     where property_id = portfolio_property_id
  ) or exists (
    select 1 from public.rent_adjustments
     where property_id::text = core_object_id::text and not coalesce(is_deleted, false)
  ) then
    raise exception 'Hohenloher Eigennutzung enthält weiterhin eine aktive Mietquelle';
  end if;

  if exists (
    select 1 from public.finance_entry
     where object_id::text = core_object_id::text
       and coalesce(is_deleted, false) = false
       and (coalesce(tax_relevant, false) or coalesce(nk_relevant, false))
       and lower(coalesce(category, '')) not in ('§35a haushaltsnahe dienstleistungen', '§35a handwerkerleistungen')
  ) then
    raise exception 'Hohenloher-Buchungen sind noch steuerlich oder als Mieter-NK markiert';
  end if;
end
$$;

create or replace view public.v_mieteingaenge_monat
with (security_invoker = true)
as
with normalized as (
  select
    fe.object_id,
    fe.objekt_code,
    date_trunc('month', case when extract(day from fe.booking_date)::int >= 25 then fe.booking_date + interval '1 month' else fe.booking_date end)::date as mietmonat,
    fe.amount,
    fe.category,
    fe.note
  from public.finance_entry fe
  left join public.v_koenen_object_bridge bridge on bridge.object_id = fe.object_id
  where fe.entry_type = 'income'
    and fe.booking_date is not null
    and fe.object_id is not null
    and coalesce(fe.is_deleted, false) = false
    and public.koenen_normalize_object_name(coalesce(bridge.property_name, '')) <> public.koenen_normalize_object_name('Hohenloher Str. 78')
)
select object_id, objekt_code, mietmonat,
  coalesce(sum(case when lower(coalesce(category, '') || ' ' || coalesce(note, '')) ~ '(miete|kaltmiete|warmmiete|monatsmiete|wohnungsmiete|garage|stellplatz|pacht)' then coalesce(amount, 0) else 0 end), 0)::numeric(12,2) as mieteingang_summe
from normalized
group by object_id, objekt_code, mietmonat;

grant select on public.v_mieteingaenge_monat to authenticated;
