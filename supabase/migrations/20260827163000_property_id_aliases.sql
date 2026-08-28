-- Erweitert die bereits vorhandene zentrale Zuordnung historischer Property-IDs
-- zu den kanonischen Objekt-IDs. Die App erhaelt ausschliesslich Lesezugriff.
create table if not exists public.property_id_aliases (
  id uuid primary key default gen_random_uuid(),
  legacy_property_id uuid not null unique,
  object_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_property_id_aliases_object_id
  on public.property_id_aliases(object_id);

alter table public.property_id_aliases enable row level security;

drop policy if exists property_id_aliases_authenticated_select on public.property_id_aliases;
create policy property_id_aliases_authenticated_select
on public.property_id_aliases for select to authenticated
using (true);

revoke all on public.property_id_aliases from anon, authenticated;
grant select on public.property_id_aliases to authenticated;

insert into public.property_id_aliases (object_id, legacy_property_id)
values
  ('5db6fcc3-6419-4fb1-a03f-087dc16383cc', 'f8a86965-07e4-4b6a-a97a-779dbe97a3fd'),
  ('5db6fcc3-6419-4fb1-a03f-087dc16383cc', '4f9d5747-f808-45e7-83a1-b5738ee018c6'),
  ('5db6fcc3-6419-4fb1-a03f-087dc16383cc', '3f029417-88e1-4cbc-a3f5-37d246d71bb9')
on conflict (legacy_property_id) do nothing;
