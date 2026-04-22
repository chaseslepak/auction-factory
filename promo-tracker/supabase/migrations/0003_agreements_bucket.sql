-- 0003: private storage bucket for promo agreement PDFs.

insert into storage.buckets (id, name, public)
  values ('agreements', 'agreements', false)
  on conflict (id) do nothing;

create policy "agreements: authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'agreements');

create policy "agreements: authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'agreements');

create policy "agreements: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'agreements' and owner = auth.uid());
