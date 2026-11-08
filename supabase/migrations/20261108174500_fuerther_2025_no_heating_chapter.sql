-- Fürther Str. 74 / 2025: Der Mieter rechnet Energie direkt mit dem
-- Energieversorger ab. Die Nebenkostenabrechnung enthält deshalb weder
-- Heizkosten noch eine CO₂-/KALO-Anlage. Der vorhandene Wartungsbeleg bleibt
-- als normale technische Betriebskostenposition dokumentiert.

do $$
declare
  workspace_row public.apartment_billing_workspaces%rowtype;
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

  select jsonb_agg(
    jsonb_set(
      billing,
      '{workspace,costs}',
      (
        select jsonb_agg(
          case when cost ->> 'id' = 'fuerther-2025-heizungswartung' then
            cost || jsonb_build_object(
              'label', 'Wartung technische Anlage',
              'note', 'Separater Beleg 2025: Wartung der Heizungsanlage. Bei separatem Energievertrag keine Heizkosten-/CO₂-Position.'
            )
          else cost end
          order by cost_ordinal
        )
        from jsonb_array_elements(billing #> '{workspace,costs}') with ordinality as costs(cost, cost_ordinal)
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
       and data #>> '{billings,0,workspace,costs,11,label}' = 'Wartung technische Anlage'
  ) then
    raise exception 'Fürther-NK-Abrechnung 2025 wurde nicht auf die Heizkosten-Ausnahme umgestellt';
  end if;
end
$$;
