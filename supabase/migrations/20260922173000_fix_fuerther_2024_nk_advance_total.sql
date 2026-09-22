-- Fuerther Str. 74, NK-Abrechnung 2024:
-- Gespeichert waren 110 EUR als Monatswert. Das Abrechnungsmodell erwartet
-- den Gesamtbetrag des Zeitraums: 12 x 110 EUR = 1.320 EUR.
-- Umlagefaehige Kosten 1.614,87 EUR minus Vorauszahlungen 1.320,00 EUR
-- ergeben die bestaetigte Nachzahlung 294,87 EUR.

do $$
declare
  target_id uuid := '1604d957-0793-44d4-82a5-405222d0ca37';
  payload jsonb;
begin
  select data into payload
    from public.apartment_billing_workspaces
   where id = target_id
     and year = '2024';

  if payload is null then
    raise exception 'Fuerther-Nebenkostenabrechnung 2024 wurde nicht gefunden';
  end if;

  if payload #>> '{billings,0,workspace,meta,propertyCode}' <> 'Objekt_4'
     or payload #>> '{billings,0,workspace,meta,billingYear}' <> '2024'
     or payload #>> '{billings,0,workspace,apartments,0,id}' <> '12917526-db9a-4cc4-999e-f481accaf7a5'
     or (payload #>> '{billings,0,workspace,apartments,0,occupancyMonths}')::numeric <> 12
     or (payload #>> '{billings,0,workspace,apartments,0,advancePayments}')::numeric <> 110 then
    raise exception 'Fuerther-NK-Ausgangsdaten entsprechen nicht dem geprueften Stand';
  end if;

  update public.apartment_billing_workspaces
     set data = jsonb_set(data,'{billings,0,workspace,apartments,0,advancePayments}',to_jsonb(1320::numeric),false),
         updated_at = now()
   where id = target_id;

  if not exists (
    select 1 from public.apartment_billing_workspaces
     where id = target_id
       and (data #>> '{billings,0,workspace,apartments,0,advancePayments}')::numeric = 1320
  ) then
    raise exception 'Fuerther-NK-Vorauszahlungen wurden nicht auf 1.320 EUR gesetzt';
  end if;
end
$$;
