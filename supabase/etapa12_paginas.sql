-- ============================================================
-- AnimeSe — etapa 12: páginas da comunidade
--
-- Usuários pedem para criar uma página (nome, @, descrição e foto).
-- O admin aprova. Depois disso, qualquer pessoa pode seguir a página,
-- e as publicações dela (texto e imagem) aparecem no feed de quem segue.
--
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

-- ---------- Páginas ----------
create table if not exists public.pages (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  slug            text not null unique check (slug ~ '^[a-z0-9_.]{3,30}$'),
  name            text not null check (char_length(trim(name)) between 3 and 50),
  description     text check (char_length(description) <= 500),
  avatar_url      text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  admin_note      text,
  followers_count integer not null default 0,
  posts_count     integer not null default 0,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);
create index if not exists paginas_status on public.pages (status, created_at desc);
create index if not exists paginas_dono on public.pages (owner_id);

alter table public.pages enable row level security;

-- Aprovadas são públicas; o dono vê as próprias; o admin vê todas
drop policy if exists "paginas visiveis" on public.pages;
create policy "paginas visiveis" on public.pages for select
  using (status = 'approved' or owner_id = auth.uid() or public.is_admin());

drop policy if exists "pedir pagina" on public.pages;
create policy "pedir pagina" on public.pages for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "editar propria pagina" on public.pages;
create policy "editar propria pagina" on public.pages for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "apagar pagina" on public.pages;
create policy "apagar pagina" on public.pages for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

grant select on public.pages to anon, authenticated;
grant insert, update, delete on public.pages to authenticated;

-- Campos que só o sistema/admin mexe; limites de pedidos
create or replace function public.proteger_pagina()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.slug := lower(trim(new.slug));
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if (select count(*) from public.pages where owner_id = new.owner_id and status = 'pending') >= 1 then
        raise exception 'Você já tem um pedido de página aguardando aprovação.';
      end if;
      if (select count(*) from public.pages where owner_id = new.owner_id and status in ('approved', 'pending')) >= 3 then
        raise exception 'Cada conta pode ter no máximo 3 páginas.';
      end if;
      new.status := 'pending';
      new.admin_note := null;
      new.followers_count := 0;
      new.posts_count := 0;
      new.reviewed_at := null;
      new.created_at := now();
    else
      new.owner_id := old.owner_id;
      new.followers_count := old.followers_count;
      new.posts_count := old.posts_count;
      new.created_at := old.created_at;
      new.reviewed_at := old.reviewed_at;
      new.admin_note := old.admin_note;
      -- Recusada: ao corrigir e salvar, volta para a fila do admin
      if old.status = 'rejected' then new.status := 'pending'; else new.status := old.status; end if;
      -- O @ não muda depois de aprovado (links antigos continuam valendo)
      if old.status = 'approved' then new.slug := old.slug; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pages_proteger on public.pages;
create trigger pages_proteger before insert or update on public.pages
  for each row execute function public.proteger_pagina();

-- Admin aprova, recusa, suspende ou reativa
create or replace function public.moderar_pagina(p_pagina uuid, p_status text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Só o admin pode fazer isso.'; end if;
  if p_status not in ('approved', 'rejected', 'suspended') then raise exception 'Situação inválida.'; end if;
  update public.pages
     set status = p_status, admin_note = nullif(trim(coalesce(p_nota, '')), ''), reviewed_at = now()
   where id = p_pagina;
end $$;
grant execute on function public.moderar_pagina(uuid, text, text) to authenticated;


-- ---------- Seguir páginas ----------
create table if not exists public.page_follows (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  page_id    uuid not null references public.pages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, page_id)
);
create index if not exists seguidores_pagina on public.page_follows (page_id);

alter table public.page_follows enable row level security;

drop policy if exists "seguidores de pagina visiveis" on public.page_follows;
create policy "seguidores de pagina visiveis" on public.page_follows for select using (true);

drop policy if exists "seguir pagina" on public.page_follows;
create policy "seguir pagina" on public.page_follows for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.pages p where p.id = page_id and p.status = 'approved'));

drop policy if exists "deixar de seguir pagina" on public.page_follows;
create policy "deixar de seguir pagina" on public.page_follows for delete to authenticated
  using (user_id = auth.uid());

grant select on public.page_follows to anon, authenticated;
grant insert, delete on public.page_follows to authenticated;

create or replace function public.contar_seguidores_pagina()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.pages set followers_count = followers_count + 1 where id = new.page_id;
  else
    update public.pages set followers_count = greatest(followers_count - 1, 0) where id = old.page_id;
  end if;
  return null;
end $$;

drop trigger if exists page_follows_contar on public.page_follows;
create trigger page_follows_contar after insert or delete on public.page_follows
  for each row execute function public.contar_seguidores_pagina();


-- ---------- Publicações ----------
create table if not exists public.page_posts (
  id          bigint generated always as identity primary key,
  page_id     uuid not null references public.pages (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text check (char_length(body) <= 2000),
  image_url   text,
  likes_count integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint publicacao_nao_vazia check (coalesce(char_length(trim(body)), 0) > 0 or image_url is not null)
);
create index if not exists publicacoes_pagina on public.page_posts (page_id, created_at desc);
create index if not exists publicacoes_recentes on public.page_posts (created_at desc);

alter table public.page_posts enable row level security;

drop policy if exists "publicacoes visiveis" on public.page_posts;
create policy "publicacoes visiveis" on public.page_posts for select
  using (exists (select 1 from public.pages p where p.id = page_id
                 and (p.status = 'approved' or p.owner_id = auth.uid() or public.is_admin())));

drop policy if exists "publicar na propria pagina" on public.page_posts;
create policy "publicar na propria pagina" on public.page_posts for insert to authenticated
  with check (author_id = auth.uid()
              and exists (select 1 from public.pages p where p.id = page_id and p.owner_id = auth.uid() and p.status = 'approved'));

drop policy if exists "apagar publicacao" on public.page_posts;
create policy "apagar publicacao" on public.page_posts for delete to authenticated
  using (public.is_admin() or exists (select 1 from public.pages p where p.id = page_id and p.owner_id = auth.uid()));

grant select on public.page_posts to anon, authenticated;
grant insert, delete on public.page_posts to authenticated;

-- Limite contra spam (30 publicações por dia por página) e contadores
create or replace function public.antes_de_publicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.page_posts where page_id = new.page_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Esta página já publicou 30 vezes hoje. Tente amanhã.';
  end if;
  new.body := nullif(trim(coalesce(new.body, '')), '');
  new.likes_count := 0;
  new.created_at := now();
  return new;
end $$;

drop trigger if exists page_posts_antes on public.page_posts;
create trigger page_posts_antes before insert on public.page_posts
  for each row execute function public.antes_de_publicar();

create or replace function public.contar_publicacoes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.pages set posts_count = posts_count + 1 where id = new.page_id;
  else
    update public.pages set posts_count = greatest(posts_count - 1, 0) where id = old.page_id;
  end if;
  return null;
end $$;

drop trigger if exists page_posts_contar on public.page_posts;
create trigger page_posts_contar after insert or delete on public.page_posts
  for each row execute function public.contar_publicacoes();


-- ---------- Curtidas ----------
create table if not exists public.page_post_likes (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id    bigint not null references public.page_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists curtidas_publicacao on public.page_post_likes (post_id);

alter table public.page_post_likes enable row level security;

drop policy if exists "curtidas visiveis" on public.page_post_likes;
create policy "curtidas visiveis" on public.page_post_likes for select using (true);

drop policy if exists "curtir" on public.page_post_likes;
create policy "curtir" on public.page_post_likes for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "descurtir" on public.page_post_likes;
create policy "descurtir" on public.page_post_likes for delete to authenticated using (user_id = auth.uid());

grant select on public.page_post_likes to anon, authenticated;
grant insert, delete on public.page_post_likes to authenticated;

create or replace function public.contar_curtidas_publicacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.page_posts set likes_count = likes_count + 1 where id = new.post_id;
  else
    update public.page_posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;

drop trigger if exists page_post_likes_contar on public.page_post_likes;
create trigger page_post_likes_contar after insert or delete on public.page_post_likes
  for each row execute function public.contar_curtidas_publicacao();


-- ---------- Imagens (Storage) ----------
-- Pasta pública "paginas": cada usuário envia só dentro de paginas/<id dele>/
-- Até 5 MB por arquivo (as fotos são reduzidas no navegador antes de enviar)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paginas', 'paginas', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "imagens de paginas visiveis" on storage.objects;
create policy "imagens de paginas visiveis" on storage.objects
  for select using (bucket_id = 'paginas');

drop policy if exists "enviar imagem de pagina" on storage.objects;
create policy "enviar imagem de pagina" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'paginas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "apagar imagem de pagina" on storage.objects;
create policy "apagar imagem de pagina" on storage.objects
  for delete to authenticated
  using (bucket_id = 'paginas' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));


-- ---------- Aviso para o admin ----------
create or replace function public.paginas_pendentes()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then (select count(*)::int from public.pages where status = 'pending') else 0 end;
$$;
grant execute on function public.paginas_pendentes() to authenticated;
