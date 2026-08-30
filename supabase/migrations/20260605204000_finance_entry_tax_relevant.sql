-- Koenen Property Management: Steuerrelevanz direkt an Buchungen
-- NULL = noch nicht manuell entschieden, true/false = Benutzerentscheidung.

alter table public.finance_entry
add column if not exists tax_relevant boolean null;

update public.finance_entry
set tax_relevant = true
where tax_relevant is null
  and coalesce(is_deleted, false) = false
  and (
    (
      lower(coalesce(entry_type::text, '')) in ('income', 'einnahme')
      and lower(coalesce(category, '') || ' ' || coalesce(note, '')) ~
        '(kaltmiete|grundmiete|miete|monatsmiete|wohnungsmiete|stellplatz|garage|nebenkosten|betriebskosten|mietnachzahlung|untervermietung|vorvermietung|umsatzsteuer|kaution.*einbehalten|schaden)'
    )
    or
    (
      lower(coalesce(entry_type::text, '')) in ('expense', 'ausgabe')
      and lower(coalesce(category, '') || ' ' || coalesce(note, '')) ~
        '(afa|abschreibung|zins|zinsen|finanzierung|darlehenszins|reparatur|renovierung|instandhaltung|erhaltungsaufwand|sanierung|modernisierung|herstellungskosten|grundsteuer|strassenreinigung|straßenreinigung|muell|müll|heizung|warmwasser|hausgeld|weg|verwaltung|verwalter|fahrt|kilometer|buero|büro|porto|telefon|software|schreibwaren|anwalt|gericht|raeumung|räumung|makler|inserat)'
    )
  );

update public.finance_entry
set tax_relevant = false
where tax_relevant is null
  and coalesce(is_deleted, false) = false
  and (
    lower(coalesce(category, '') || ' ' || coalesce(note, '')) ~ '(tilgung|privat|entnahme|einlage)'
  );

create index if not exists idx_finance_entry_tax_relevant
on public.finance_entry(tax_relevant, booking_date)
where coalesce(is_deleted, false) = false;
