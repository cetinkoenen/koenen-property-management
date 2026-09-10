-- Vom Eigentümer am 10.09.2026 bestätigte Kreditraten-Korrekturen.
-- Sicherheitsprüfungen verhindern, dass die Migration auf unerwartete
-- Datensätze oder bereits anderweitig geänderte Beträge angewendet wird.

do $$
declare
  affected_count integer;
begin
  select count(*) into affected_count
  from public.property_loan_rate_plan
  where id = 'e6a77f41-2dae-4799-a715-e0c9cb6a7d62'
    and property_key = 'lilienthaler-str-54'
    and plan_year = 2024
    and plan_month = 1
    and payment_amount = 1200.00
    and interest_amount = 96.49
    and principal_amount = 1103.51;

  if affected_count <> 1 then
    raise exception 'Lilienthaler Tilgungsplan Januar 2024 entspricht nicht dem geprüften Ausgangsstand';
  end if;

  update public.property_loan_rate_plan
  set
    payment_amount = 1212.00,
    principal_amount = 1115.51
  where id = 'e6a77f41-2dae-4799-a715-e0c9cb6a7d62';

  update public.finance_entry
  set
    loan_interest_amount = 96.49,
    loan_principal_amount = 1115.51,
    loan_rate_plan_id = 'e6a77f41-2dae-4799-a715-e0c9cb6a7d62',
    loan_split_source = 'manual:Eigentümerbestätigung 2026-09-10'
  where id = 133
    and booking_date = date '2024-01-02'
    and amount = 1212.00
    and category = 'Kreditrate'
    and loan_rate_plan_id is null;

  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Lilienthaler Kreditrate 02.01.2024 entspricht nicht dem geprüften Ausgangsstand';
  end if;

  update public.finance_entry
  set amount = 438.53
  where id = 1127
    and booking_date = date '2024-10-30'
    and amount = 438.50
    and category = 'Kreditrate'
    and loan_rate_plan_id = '22c5a141-9a86-4690-95d1-723697b533b5'
    and loan_interest_amount = 148.86
    and loan_principal_amount = 289.67;

  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Fürther Kreditrate 30.10.2024 entspricht nicht dem geprüften Ausgangsstand';
  end if;

  update public.finance_entry
  set amount = 1690.00
  where id in (1217, 1220, 1225)
    and booking_date in (date '2025-05-22', date '2025-06-30', date '2025-08-26')
    and amount = 1650.00
    and category = 'Kreditrate'
    and round(coalesce(loan_interest_amount, 0) + coalesce(loan_principal_amount, 0), 2) = 1690.00;

  get diagnostics affected_count = row_count;
  if affected_count <> 3 then
    raise exception 'Hohenloher Kreditraten entsprechen nicht dem geprüften Ausgangsstand';
  end if;
end $$;
