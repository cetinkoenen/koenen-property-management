-- Erwerbsnebenkosten/Anschaffungskosten sind zu dokumentieren, aber nicht als laufende
-- Anlage-V-Werbungskosten per St-Kreuz zu fuehren.
update public.finance_entry
set tax_relevant = false
where id in (632, 1289, 1291, 1207, 1208, 1209, 1213, 1214)
  and is_deleted = false;

update public.finance_entry
set tax_relevant = false
where id in (1206, 1226, 1227)
  and is_deleted = false;
