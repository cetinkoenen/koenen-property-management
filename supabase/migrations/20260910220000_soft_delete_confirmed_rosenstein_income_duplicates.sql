-- Vom Eigentümer am 10.09.2026 fachlich bestätigt:
-- Notar- und Maklerrechnung sind Erwerbsnebenkosten (Ausgaben), keine Einnahmen.
-- Die richtigen Ausgabenbuchungen bleiben aktiv; nur die jeweils identische,
-- fälschlich als Einnahme erfasste Gegenbuchung wird revisionssicher gelöscht.

do $$
declare
  matched_count integer;
begin
  select count(*) into matched_count
  from public.finance_entry
  where id = 626
    and booking_date = date '2025-09-22'
    and entry_type = 'income'
    and amount = 1173.06
    and category = 'Erwerbsnebenkosten / Anschaffungskosten'
    and note = 'Rechnung Notar R20252087 TT'
    and tax_relevant = false
    and nk_relevant = false
    and coalesce(is_deleted, false) = false;

  if matched_count <> 1 then
    raise exception 'Fälschliche Notar-Einnahme entspricht nicht dem geprüften Ausgangsstand';
  end if;

  select count(*) into matched_count
  from public.finance_entry
  where id = 1289
    and booking_date = date '2025-09-22'
    and entry_type = 'expense'
    and amount = 1173.06
    and category = 'Erwerbsnebenkosten / Anschaffungskosten'
    and note = 'Rechnung Notar R20252087 TT'
    and tax_relevant = false
    and nk_relevant = false
    and coalesce(is_deleted, false) = false;

  if matched_count <> 1 then
    raise exception 'Korrekte Notar-Ausgabe fehlt oder wurde zwischenzeitlich geändert';
  end if;

  select count(*) into matched_count
  from public.finance_entry
  where id = 1290
    and booking_date = date '2025-09-29'
    and entry_type = 'income'
    and amount = 2713.20
    and category = 'Erwerbsnebenkosten / Anschaffungskosten'
    and note = 'Rechnung Immobilienmakler Rosenstein Str. 25, TG Stellplätze P250-253-254'
    and tax_relevant = false
    and nk_relevant = false
    and coalesce(is_deleted, false) = false;

  if matched_count <> 1 then
    raise exception 'Fälschliche Makler-Einnahme entspricht nicht dem geprüften Ausgangsstand';
  end if;

  select count(*) into matched_count
  from public.finance_entry
  where id = 1291
    and booking_date = date '2025-09-29'
    and entry_type = 'expense'
    and amount = 2713.20
    and category = 'Erwerbsnebenkosten / Anschaffungskosten'
    and note = 'Rechnung Immobilienmakler Rosenstein Str. 25, TG Stellplätze P250-253-254'
    and tax_relevant = false
    and nk_relevant = false
    and coalesce(is_deleted, false) = false;

  if matched_count <> 1 then
    raise exception 'Korrekte Makler-Ausgabe fehlt oder wurde zwischenzeitlich geändert';
  end if;

  update public.finance_entry
  set is_deleted = true,
      deleted_at = now()
  where id in (626, 1290)
    and entry_type = 'income'
    and coalesce(is_deleted, false) = false;

  get diagnostics matched_count = row_count;
  if matched_count <> 2 then
    raise exception 'Es wurden nicht genau zwei bestätigte Einnahmen revisionssicher gelöscht';
  end if;
end $$;
