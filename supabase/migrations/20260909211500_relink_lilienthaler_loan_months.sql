-- Eindeutige Monatszuordnung historischer Lilienthaler-Kreditraten.
-- Zahlungen am ersten/zweiten Bankarbeitstag tragen den Bezugsmonat teilweise
-- bereits in der Notiz. Diese Verknuepfung ersetzt keine Bankbuchung, sondern
-- uebernimmt ausschliesslich Zins und Tilgung aus dem vorhandenen Monatsplan.
do $$
declare
  link record;
  plan_row public.property_loan_rate_plan%rowtype;
  entry_count integer;
begin
  for link in
    select * from (values
      (845::bigint, date '2024-03-01'),
      (828::bigint, date '2024-04-01'),
      (831::bigint, date '2024-06-01'),
      (830::bigint, date '2024-07-01'),
      (868::bigint, date '2024-11-01'),
      (893::bigint, date '2025-08-01'),
      (894::bigint, date '2025-09-01')
    ) as expected(entry_id, plan_date)
  loop
    select count(*) into entry_count
    from public.finance_entry
    where id = link.entry_id
      and coalesce(is_deleted, false) = false
      and lower(coalesce(category, '')) = 'kreditrate'
      and coalesce(objekt_code, '') = 'Objekt_1';

    if entry_count <> 1 then
      raise exception 'Lilienthaler-Kreditrate % ist nicht eindeutig vorhanden.', link.entry_id;
    end if;

    select * into strict plan_row
    from public.property_loan_rate_plan
    where property_key = 'lilienthaler-str-54'
      and plan_date = link.plan_date;

    if abs(plan_row.payment_amount - (select abs(amount) from public.finance_entry where id = link.entry_id)) > 0.02 then
      raise exception 'Rate % stimmt nicht mit Monatsplan % ueberein.', link.entry_id, link.plan_date;
    end if;

    update public.finance_entry
    set loan_interest_amount = plan_row.interest_amount,
        loan_principal_amount = plan_row.principal_amount,
        loan_rate_plan_id = plan_row.id,
        loan_split_source = 'csv:' || plan_row.source_file,
        tax_relevant = false
    where id = link.entry_id
      and coalesce(is_deleted, false) = false;
  end loop;
end
$$;
