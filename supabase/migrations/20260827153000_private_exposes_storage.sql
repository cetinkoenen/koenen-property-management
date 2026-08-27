-- Exposes enthalten sensible Objektunterlagen und duerfen nicht ueber eine
-- dauerhaft oeffentliche Bucket-URL abrufbar sein.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf']::text[]
where id = 'exposes';

drop policy if exists "Allow authenticated uploads to exposes" on storage.objects;
drop policy if exists "Allow authenticated update on exposes" on storage.objects;
drop policy if exists "exposes_authenticated_select" on storage.objects;
drop policy if exists "exposes_admin_insert" on storage.objects;
drop policy if exists "exposes_admin_update" on storage.objects;
drop policy if exists "exposes_admin_delete" on storage.objects;

create policy "exposes_authenticated_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'exposes');

create policy "exposes_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exposes'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com'
);

create policy "exposes_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'exposes'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com'
)
with check (
  bucket_id = 'exposes'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com'
);

create policy "exposes_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'exposes'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'info.koenen@gmail.com'
);
