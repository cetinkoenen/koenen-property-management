-- Core-Shadow-Objekte dienen ausschließlich der ID-Brücke. Ihre generischen
-- Einheiten dürfen nicht zusätzlich zu den echten Portfolio-Einheiten in
-- Oberflächen oder Reports erscheinen.

update public.portfolio_units unit
set is_active = false,
    updated_at = now()
from public.portfolio_properties property
where property.id = unit.property_id
  and lower(coalesce(property.name, '')) like '%core-shadow%'
  and unit.is_active is distinct from false;
