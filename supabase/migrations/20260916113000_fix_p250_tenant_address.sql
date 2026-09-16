-- Korrigiert die bereits gespeicherte Zustelladresse der P250-Mieterin.
update public.apartment_billing_workspaces workspace
   set data = jsonb_set(
     workspace.data,
     '{records}',
     (
       select jsonb_agg(
         case
           when (record ->> 'year')::integer = 2025
             then record || jsonb_build_object('tenantAddress', E'Rosenstein Straße 29\n70191 Stuttgart')
           else record
         end
         order by (record ->> 'year')::integer
       )
       from jsonb_array_elements(workspace.data -> 'records') record
     ),
     true
   ),
   updated_at = now()
 where workspace.object_id = 'rosenstein-str-25-tiefgarage'
   and workspace.year = 'all';

do $$
begin
  if not exists (
    select 1
      from public.apartment_billing_workspaces workspace,
           jsonb_array_elements(workspace.data -> 'records') record
     where workspace.object_id = 'rosenstein-str-25-tiefgarage'
       and workspace.year = 'all'
       and (record ->> 'year')::integer = 2025
       and record ->> 'tenantAddress' = E'Rosenstein Straße 29\n70191 Stuttgart'
  ) then
    raise exception 'P250-Mieteranschrift 2025 wurde nicht korrekt gespeichert';
  end if;
end
$$;
