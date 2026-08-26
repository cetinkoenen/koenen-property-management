-- Normalisiert ausschliesslich die Nebenkostenabrechnung-Markierung.
-- Steuerkennzeichen tax_relevant / St. bleibt unberuehrt.
with classified as (
  select
    id,
    case
      when trim(coalesce(category, '') || ' ' || coalesce(note, '')) = '' then false
      when lower(coalesce(category, '') || ' ' || coalesce(note, '')) ~
        '(ruecklage|rücklage|instandhaltungsruecklage|instandhaltungsrücklage|erhaltungsruecklage|erhaltungsrücklage|reparatur|instandsetzung|sanierung|modernisierung|verwaltung|verwalter|hausverwaltung|steuerberater|software|bankgebuehr|bankgebühr|kontofuehrung|kontoführung|porto|tilgung|kreditrate|darlehen)'
        then false
      when entry_type = 'income'
        and (
          lower(coalesce(category, '') || ' ' || coalesce(note, '')) ~
            '(nebenkosten|betriebskosten|vorauszahlung|abschlag|erstattung|guthaben|rueckzahlung|rückzahlung)'
          or lower(coalesce(category, '') || ' ' || coalesce(note, '')) ~ '(^|[^[:alnum:]])nk([^[:alnum:]]|$)'
        )
        then true
      when entry_type = 'expense'
        and lower(coalesce(category, '') || ' ' || coalesce(note, '')) ~
          '(grundsteuer|wasser|wasserversorgung|abwasser|entwaesserung|entwässerung|kanal|heizung|warmwasser|brennstoff|wartung heizung|aufzug|strassenreinigung|straßenreinigung|winterdienst|muell|müll|reinigung|gebaeudereinigung|gebäudereinigung|garten|gartenpflege|beleuchtung|hausstrom|allgemeinstrom|schornstein|versicherung|gebaeudeversicherung|gebäudeversicherung|haftpflicht|glas|hauswart|hausmeister|kabel|antenne|wascheinrichtung|rauchwarn|dachrinnenreinigung|betriebskosten|nebenkosten|kalo|techem)'
        then true
      else false
    end as computed_nk_relevant
  from public.finance_entry
  where coalesce(is_deleted, false) = false
    and booking_date >= date '2024-01-01'
    and booking_date <= date '2026-08-04'
    and entry_type in ('income', 'expense')
)
update public.finance_entry as entry
set nk_relevant = classified.computed_nk_relevant
from classified
where entry.id = classified.id
  and entry.nk_relevant is distinct from classified.computed_nk_relevant;
