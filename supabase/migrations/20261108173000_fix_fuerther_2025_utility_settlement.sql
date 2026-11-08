-- Fürther Str. 74 · Nebenkostenabrechnung 2025
-- Verbindliche Quellen:
--   1) WEG-Abrechnung: umlagefähige Gesamtsumme 1.246,79 EUR
--   2) Separater Grundsteuerbescheid: 185,96 EUR
--   3) Separater Beleg Schornsteinreinigung: 76,64 EUR
--   4) Separater Beleg Heizungswartung: 196,35 EUR
--   5) Mietervorauszahlungen: 1.320,00 EUR
--
-- Ergebnis: 1.705,74 EUR Kosten - 1.320,00 EUR Vorauszahlungen
--           = 385,74 EUR Nachzahlung.
-- Nicht umlagefähig und deshalb bewusst ausgeschlossen: Verwalterhonorar,
-- Umsatzsteuer auf das Verwalterhonorar, Rücklagen und Eigentümerausgleich.

do $$
declare
  workspace_row public.apartment_billing_workspaces%rowtype;
  canonical_costs jsonb := jsonb_build_array(
    jsonb_build_object('id', 'fuerther-2025-versicherung', 'label', 'Versicherungen', 'amount', 384.21, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 384.21, 'prorateByOccupancy', false, 'note', 'WEG-Abrechnung 2025 · umlagefähiger Anteil der Wohnung.'),
    jsonb_build_object('id', 'fuerther-2025-reinigung', 'label', 'Gebäudereinigung', 'amount', 302.46, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 302.46, 'prorateByOccupancy', false, 'note', 'WEG-Abrechnung 2025 · umlagefähiger Anteil der Wohnung.'),
    jsonb_build_object('id', 'fuerther-2025-gehweg', 'label', 'Gehwegreinigung', 'amount', 52.15, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 52.15, 'prorateByOccupancy', false, 'note', 'WEG-Abrechnung 2025 · umlagefähiger Anteil der Wohnung.'),
    jsonb_build_object('id', 'fuerther-2025-garten', 'label', 'Gartenpflege', 'amount', 81.76, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 81.76, 'prorateByOccupancy', false, 'note', 'WEG-Abrechnung 2025 · umlagefähiger Anteil der Wohnung.'),
    jsonb_build_object('id', 'fuerther-2025-muell', 'label', 'Müllabfuhr', 'amount', 210.43, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 210.43, 'prorateByOccupancy', false, 'note', 'WEG-Abrechnung 2025 · umlagefähiger Anteil der Wohnung.'),
    jsonb_build_object('id', 'fuerther-2025-weg-wartung', 'label', 'Wartungskosten', 'amount', 8.96, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 8.96, 'prorateByOccupancy', false, 'note', 'WEG-Abrechnung 2025 · umlagefähiger Anteil der Wohnung.'),
    jsonb_build_object('id', 'fuerther-2025-strom', 'label', 'Allgemeinstrom', 'amount', 20.87, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 20.87, 'prorateByOccupancy', false, 'note', 'WEG-Abrechnung 2025 · umlagefähiger Anteil der Wohnung.'),
    jsonb_build_object('id', 'fuerther-2025-wasser', 'label', 'Wasser', 'amount', 185.96, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 185.96, 'prorateByOccupancy', false, 'note', 'WEG-Abrechnung 2025 · umlagefähiger Anteil der Wohnung.'),
    jsonb_build_object('id', 'fuerther-2025-weg-abstimmung', 'label', 'WEG-Abstimmungsdifferenz', 'amount', -0.01, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', -0.01, 'prorateByOccupancy', false, 'note', 'Centgenauer Abgleich auf die umlagefähige WEG-Gesamtsumme 2025 von 1.246,79 EUR.'),
    jsonb_build_object('id', 'fuerther-2025-grundsteuer', 'label', 'Grundsteuer', 'amount', 185.96, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 185.96, 'prorateByOccupancy', false, 'note', 'Separater Grundsteuerbescheid 2025: 4 × 46,49 EUR.'),
    jsonb_build_object('id', 'fuerther-2025-schornstein', 'label', 'Schornsteinreinigung', 'amount', 76.64, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 76.64, 'prorateByOccupancy', false, 'note', 'Separater Beleg 2025.'),
    jsonb_build_object('id', 'fuerther-2025-heizungswartung', 'label', 'Heizungswartung', 'amount', 196.35, 'allocation', 'directAmount', 'totalKey', 0, 'apartmentKey', 0, 'directAmount', 196.35, 'prorateByOccupancy', false, 'note', 'Separater Beleg 2025.')
  );
  corrected_billings jsonb;
begin
  select *
    into workspace_row
    from public.apartment_billing_workspaces
   where object_id = 'Objekt_4'
     and year = '2025'
   for update;

  if not found then
    raise exception 'Fürther-Nebenkostenabrechnung 2025 wurde nicht gefunden';
  end if;

  if jsonb_typeof(workspace_row.data -> 'billings') <> 'array' then
    raise exception 'Fürther-Nebenkostenabrechnung 2025 hat kein erwartetes Abrechnungsformat';
  end if;

  select jsonb_agg(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          billing,
          '{workspace,costs}',
          canonical_costs,
          true
        ),
        '{workspace,apartments}',
        (
          select jsonb_agg(
            case when apartment_ordinal = 1 then
              jsonb_set(
                jsonb_set(apartment, '{advancePayments}', to_jsonb(1320.00::numeric), true),
                '{occupancyMonths}', to_jsonb(12), true
              )
            else apartment end
            order by apartment_ordinal
          )
          from jsonb_array_elements(coalesce(billing #> '{workspace,apartments}', '[]'::jsonb)) with ordinality as apartments(apartment, apartment_ordinal)
        ),
        true
      ),
      '{workspace,meta}',
      coalesce(billing #> '{workspace,meta}', '{}'::jsonb) || jsonb_build_object(
        'billingYear', 2025,
        'periodFrom', '2025-01-01',
        'periodTo', '2025-12-31'
      ),
      true
    )
    order by billing_ordinal
  )
    into corrected_billings
    from jsonb_array_elements(workspace_row.data -> 'billings') with ordinality as billings(billing, billing_ordinal);

  update public.apartment_billing_workspaces
     set data = jsonb_set(workspace_row.data, '{billings}', corrected_billings, false),
         updated_at = now()
   where id = workspace_row.id;

  if not exists (
    select 1
      from public.apartment_billing_workspaces
     where id = workspace_row.id
       and (data #>> '{billings,0,workspace,apartments,0,advancePayments}')::numeric = 1320
       and (data #>> '{billings,0,workspace,costs,0,label}') = 'Versicherungen'
       and (data #>> '{billings,0,workspace,costs,11,directAmount}')::numeric = 196.35
  ) then
    raise exception 'Fürther-Nebenkostenabrechnung 2025 konnte nicht vollständig korrigiert werden';
  end if;
end
$$;
