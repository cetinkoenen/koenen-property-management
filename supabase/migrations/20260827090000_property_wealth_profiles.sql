-- Zentrale Quelle fuer die umfangreiche Immobilienvermoegen-Detailmaske.
-- Lokale Browserdaten werden im Frontend einmalig in dieses JSONB-Profil
-- uebernommen; danach ist Supabase die einzige schreibende Quelle.
alter table public.property_extra_info
  add column if not exists wealth_profile jsonb not null default '{}'::jsonb;

comment on column public.property_extra_info.wealth_profile is
  'Zentrales Immobilienvermoegen-Profil; ersetzt koenen:immobilienvermoegen:v2 aus localStorage.';

create index if not exists idx_property_extra_info_wealth_profile_gin
  on public.property_extra_info using gin (wealth_profile);
