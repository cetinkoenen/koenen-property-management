-- Einheitliche Objekt-/Einheitsbezeichnungen als zentrale Datenbankregel.
-- Technische IDs, Objektcodes und Buchungsreferenzen bleiben unverändert.

create or replace function public.canonical_unit_label(
  p_object_code text,
  p_object_label text,
  p_unit_label text,
  p_rent_type text default null
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  context_text text := lower(concat_ws(' ', p_object_code, p_object_label));
  unit_text text := lower(concat_ws(' ', p_unit_label, p_rent_type));
begin
  if context_text ~ 'objekt[_ -]*6' or context_text like '%rosenstein%' then
    if unit_text like '%p250%' or unit_text like '%e008440000121%' or unit_text like '%garage 1%' then return 'P250'; end if;
    if unit_text like '%p253%' or unit_text like '%e008440000122%' or unit_text like '%garage 2%' then return 'P253'; end if;
    if unit_text like '%p254%' or unit_text like '%e008440000123%' or unit_text like '%garage 3%' then return 'P254'; end if;
    return nullif(trim(p_unit_label), '');
  end if;
  if context_text ~ 'objekt[_ -]*4' or context_text like '%fürther%' or context_text like '%fuerther%' then
    if unit_text ~ '(garage|tiefgarage|stellplatz|(^|[^a-z])tg([^a-z]|$))' then return 'Garage 01'; end if;
    return 'Wohnung 03';
  end if;
  if context_text ~ 'objekt[_ -]*1' or context_text like '%lilienthaler%' then return 'Haus 01'; end if;
  if context_text ~ 'objekt[_ -]*2' or context_text like '%elsasser%' then return 'Wohnung 01'; end if;
  if context_text ~ 'objekt[_ -]*3' or context_text like '%colmarer%' then return 'Wohnung 02'; end if;
  if context_text ~ 'objekt[_ -]*5' or context_text like '%hohenloher%' then return 'Wohnung 04'; end if;
  return nullif(trim(p_unit_label), '');
end;
$$;

update public.tenant_contracts
set unit_label = public.canonical_unit_label(object_code, null, unit_label, rent_type)
where unit_label is distinct from public.canonical_unit_label(object_code, null, unit_label, rent_type);

update public.unit_vacancies
set unit_label = public.canonical_unit_label(object_code, object_label, unit_label, null)
where unit_label is distinct from public.canonical_unit_label(object_code, object_label, unit_label, null);

update public.move_processes
set unit_label = public.canonical_unit_label(object_code, null, unit_label, null)
where unit_label is distinct from public.canonical_unit_label(object_code, null, unit_label, null);

update public.rent_schedules
set unit_label = public.canonical_unit_label(object_code, null, unit_label, null)
where unit_label is distinct from public.canonical_unit_label(object_code, null, unit_label, null);

update public.payment_reminders
set unit_label = public.canonical_unit_label(object_code, null, unit_label, null)
where unit_label is distinct from public.canonical_unit_label(object_code, null, unit_label, null);

update public.transaction_rules
set unit_label = public.canonical_unit_label(object_code, null, unit_label, null)
where unit_label is distinct from public.canonical_unit_label(object_code, null, unit_label, null);

update public.portfolio_units unit
set name = case
  when lower(property.name) like '%lilienthaler%' then 'Haus 01'
  when lower(property.name) like '%elsasser%' then 'Wohnung 01'
  when lower(property.name) like '%colmarer%' then 'Wohnung 02'
  when lower(property.name) like '%hohenloher%' then 'Wohnung 04'
  when lower(property.name) like '%fürther%' or lower(property.name) like '%fuerther%'
    then case when lower(coalesce(unit.unit_type, '') || ' ' || coalesce(unit.name, '')) ~ '(garage|stellplatz)' then 'Garage 01' else 'Wohnung 03' end
  when lower(property.name) like '%rosenstein%' and lower(coalesce(unit.name, '')) ~ '(p250|e008440000121|garage 1)' then 'P250'
  when lower(property.name) like '%rosenstein%' and lower(coalesce(unit.name, '')) ~ '(p253|e008440000122|garage 2)' then 'P253'
  when lower(property.name) like '%rosenstein%' and lower(coalesce(unit.name, '')) ~ '(p254|e008440000123|garage 3)' then 'P254'
  else unit.name
end
from public.portfolio_properties property
where property.id = unit.property_id;

create or replace function public.normalize_tenant_contract_unit_label()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.unit_label := public.canonical_unit_label(new.object_code, null, new.unit_label, new.rent_type);
  return new;
end;
$$;

create or replace function public.normalize_workflow_unit_label()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.unit_label := public.canonical_unit_label(new.object_code, null, new.unit_label, null);
  return new;
end;
$$;

create or replace function public.normalize_vacancy_unit_label()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.unit_label := public.canonical_unit_label(new.object_code, new.object_label, new.unit_label, null);
  return new;
end;
$$;

create or replace function public.normalize_portfolio_unit_label()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  property_name text;
begin
  select property.name into property_name
  from public.portfolio_properties property
  where property.id = new.property_id;

  if lower(coalesce(property_name, '')) like '%lilienthaler%' then new.name := 'Haus 01';
  elsif lower(coalesce(property_name, '')) like '%elsasser%' then new.name := 'Wohnung 01';
  elsif lower(coalesce(property_name, '')) like '%colmarer%' then new.name := 'Wohnung 02';
  elsif lower(coalesce(property_name, '')) like '%hohenloher%' then new.name := 'Wohnung 04';
  elsif lower(coalesce(property_name, '')) like '%fürther%' or lower(coalesce(property_name, '')) like '%fuerther%' then
    new.name := case when lower(coalesce(new.unit_type, '') || ' ' || coalesce(new.name, '')) ~ '(garage|stellplatz)' then 'Garage 01' else 'Wohnung 03' end;
  elsif lower(coalesce(property_name, '')) like '%rosenstein%' then
    if lower(coalesce(new.name, '')) ~ '(p250|e008440000121|garage 1)' then new.name := 'P250';
    elsif lower(coalesce(new.name, '')) ~ '(p253|e008440000122|garage 2)' then new.name := 'P253';
    elsif lower(coalesce(new.name, '')) ~ '(p254|e008440000123|garage 3)' then new.name := 'P254';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_tenant_contract_unit_label on public.tenant_contracts;
create trigger normalize_tenant_contract_unit_label
before insert or update of object_code, unit_label, rent_type on public.tenant_contracts
for each row execute function public.normalize_tenant_contract_unit_label();

drop trigger if exists normalize_vacancy_unit_label on public.unit_vacancies;
create trigger normalize_vacancy_unit_label
before insert or update of object_code, object_label, unit_label on public.unit_vacancies
for each row execute function public.normalize_vacancy_unit_label();

drop trigger if exists normalize_move_process_unit_label on public.move_processes;
create trigger normalize_move_process_unit_label
before insert or update of object_code, unit_label on public.move_processes
for each row execute function public.normalize_workflow_unit_label();

drop trigger if exists normalize_rent_schedule_unit_label on public.rent_schedules;
create trigger normalize_rent_schedule_unit_label
before insert or update of object_code, unit_label on public.rent_schedules
for each row execute function public.normalize_workflow_unit_label();

drop trigger if exists normalize_payment_reminder_unit_label on public.payment_reminders;
create trigger normalize_payment_reminder_unit_label
before insert or update of object_code, unit_label on public.payment_reminders
for each row execute function public.normalize_workflow_unit_label();

drop trigger if exists normalize_transaction_rule_unit_label on public.transaction_rules;
create trigger normalize_transaction_rule_unit_label
before insert or update of object_code, unit_label on public.transaction_rules
for each row execute function public.normalize_workflow_unit_label();

drop trigger if exists normalize_portfolio_unit_label on public.portfolio_units;
create trigger normalize_portfolio_unit_label
before insert or update of property_id, name, unit_type on public.portfolio_units
for each row execute function public.normalize_portfolio_unit_label();
