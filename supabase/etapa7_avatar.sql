-- ============================================================
-- AnimeSe — etapa 7: foto de perfil enviada pelo usuário
--
-- Pasta pública "avatares" no Storage. Cada usuário só envia, troca
-- e apaga arquivos dentro da própria pasta (avatares/<id do usuário>/).
-- Rode em: Supabase > SQL Editor > Run
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatares visiveis" on storage.objects;
create policy "avatares visiveis" on storage.objects
  for select using (bucket_id = 'avatares');

drop policy if exists "enviar proprio avatar" on storage.objects;
create policy "enviar proprio avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "trocar proprio avatar" on storage.objects;
create policy "trocar proprio avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "apagar proprio avatar" on storage.objects;
create policy "apagar proprio avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
