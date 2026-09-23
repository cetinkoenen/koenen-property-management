-- Data-API-Berechtigungen explizit festlegen.
--
-- Supabase vergibt ab 30.10.2026 fuer neu angelegte Tabellen im public-Schema
-- keine impliziten Data-API-Rechte mehr. Diese Migration macht die benoetigten
-- Rechte deshalb bereits heute reproduzierbar (Produktion, Preview und db reset).
--
-- RLS bleibt die zweite, zwingende Schutzschicht und begrenzt den Zugriff auf
-- die Zeilen des angemeldeten Kontos. Anonyme Browserzugriffe sind fuer diese
-- privaten Verwaltungsdaten ausnahmslos gesperrt.

revoke all privileges on table
  public.app_audit_log,
  public.app_user_access,
  public.investment_requests,
  public.login_approval_requests,
  public.move_processes,
  public.payment_reminders,
  public.property_documents,
  public.property_extra_info,
  public.property_id_aliases,
  public.property_loan_rate_plan,
  public.property_mileage_trips,
  public.property_tasks,
  public.rent_adjustments,
  public.rent_schedules,
  public.tenant_contracts,
  public.tenant_profiles,
  public.transaction_rules,
  public.unit_vacancies
from anon;

grant select, insert, update, delete on table
  public.app_audit_log,
  public.app_user_access,
  public.investment_requests,
  public.login_approval_requests,
  public.move_processes,
  public.payment_reminders,
  public.property_documents,
  public.property_extra_info,
  public.property_id_aliases,
  public.property_loan_rate_plan,
  public.property_mileage_trips,
  public.property_tasks,
  public.rent_adjustments,
  public.rent_schedules,
  public.tenant_contracts,
  public.tenant_profiles,
  public.transaction_rules,
  public.unit_vacancies
to authenticated;

grant select, insert, update, delete on table
  public.app_audit_log,
  public.app_user_access,
  public.investment_requests,
  public.login_approval_requests,
  public.move_processes,
  public.payment_reminders,
  public.property_documents,
  public.property_extra_info,
  public.property_id_aliases,
  public.property_loan_rate_plan,
  public.property_mileage_trips,
  public.property_tasks,
  public.rent_adjustments,
  public.rent_schedules,
  public.tenant_contracts,
  public.tenant_profiles,
  public.transaction_rules,
  public.unit_vacancies
to service_role;

-- Sicherheitsinvariante: Keine der ueber die Data API erreichbaren
-- Anwendungstabellen darf ohne Row-Level Security bestehen.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'app_audit_log',
    'app_user_access',
    'investment_requests',
    'login_approval_requests',
    'move_processes',
    'payment_reminders',
    'property_documents',
    'property_extra_info',
    'property_id_aliases',
    'property_loan_rate_plan',
    'property_mileage_trips',
    'property_tasks',
    'rent_adjustments',
    'rent_schedules',
    'tenant_contracts',
    'tenant_profiles',
    'transaction_rules',
    'unit_vacancies'
  ] loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = relation_name
        and relation.relkind in ('r', 'p')
        and relation.relrowsecurity = true
    ) then
      raise exception 'Data-API-Tabelle public.% fehlt oder hat kein RLS', relation_name;
    end if;
  end loop;
end
$$;

