-- The global rule "Steuer" matches correct categories and booking notes such as
-- Grundsteuer, Steuerberater, Telekommunikation steuerlich and Grunderwerbsteuer.
-- Keeping it active would offer destructive reclassification of already audited
-- bookings. Historical finance entries are intentionally left unchanged.
update public.transaction_rules
set
  is_active = false,
  notes = concat_ws(
    ' · ',
    nullif(notes, ''),
    'Automatisch deaktiviert am 26.10.2026: globaler Suchtext "Steuer" ist für eine sichere Vorsortierung zu unspezifisch.'
  )
where id = '5252ef9b-1991-4842-be88-bb007fc66f40'
  and lower(trim(name)) = 'steuer'
  and lower(trim(match_text)) = 'steuer'
  and property_id is null
  and object_code is null;

do $$
begin
  if exists (
    select 1
    from public.transaction_rules
    where id = '5252ef9b-1991-4842-be88-bb007fc66f40'
      and is_active = true
  ) then
    raise exception 'Unsichere globale Steuer-Vorsortierungsregel ist weiterhin aktiv';
  end if;
end
$$;
