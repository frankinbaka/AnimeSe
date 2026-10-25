-- ============================================================
-- AnimeSe — etapa 14: editar publicação da página
-- O dono da página pode corrigir o texto de uma publicação.
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

alter table public.page_posts add column if not exists edited_at timestamptz;

drop policy if exists "editar publicacao" on public.page_posts;
create policy "editar publicacao" on public.page_posts for update to authenticated
  using (exists (select 1 from public.pages p where p.id = page_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.pages p where p.id = page_id and p.owner_id = auth.uid()));

grant update on public.page_posts to authenticated;

-- Na edição só o texto muda; o resto fica como estava
create or replace function public.ao_editar_publicacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.page_id := old.page_id;
    new.author_id := old.author_id;
    new.image_url := old.image_url;
    new.likes_count := old.likes_count;
    new.reposts_count := old.reposts_count;
    new.created_at := old.created_at;
    new.body := nullif(trim(coalesce(new.body, '')), '');
    if new.body is distinct from old.body then new.edited_at := now(); else new.edited_at := old.edited_at; end if;
  end if;
  return new;
end $$;

drop trigger if exists page_posts_editar on public.page_posts;
create trigger page_posts_editar before update on public.page_posts
  for each row execute function public.ao_editar_publicacao();
