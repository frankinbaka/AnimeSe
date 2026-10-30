-- ============================================================
-- AnimeSe — etapa 16: estatísticas do anime e comentários no feed
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

-- ---------- Estatísticas da comunidade por anime ----------
create index if not exists lista_por_anime on public.anime_list (mal_id, status);

create or replace function public.estatisticas_lista_anime(p_mal_id integer)
returns table (assistindo integer, assistido integer, pretendo integer, dropado integer, total integer)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where status = 'assistindo')::int,
         count(*) filter (where status = 'assistido')::int,
         count(*) filter (where status = 'pretendo')::int,
         count(*) filter (where status = 'dropado')::int,
         count(*)::int
    from public.anime_list where mal_id = p_mal_id;
$$;
grant execute on function public.estatisticas_lista_anime(integer) to anon, authenticated;


-- ---------- Comentários nas publicações das páginas ----------
alter table public.page_posts add column if not exists comments_count integer not null default 0;

create table if not exists public.page_post_comments (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.page_posts (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists comentarios_publicacao on public.page_post_comments (post_id, created_at);

alter table public.page_post_comments enable row level security;

drop policy if exists "comentarios visiveis" on public.page_post_comments;
create policy "comentarios visiveis" on public.page_post_comments for select
  using (exists (select 1 from public.page_posts pp join public.pages pg on pg.id = pp.page_id
                 where pp.id = post_id and (pg.status = 'approved' or pg.owner_id = auth.uid() or public.is_admin())));

drop policy if exists "comentar" on public.page_post_comments;
create policy "comentar" on public.page_post_comments for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.page_posts pp join public.pages pg on pg.id = pp.page_id
                          where pp.id = post_id and pg.status = 'approved'));

-- Apaga: quem escreveu, o dono da página ou o admin
drop policy if exists "apagar comentario" on public.page_post_comments;
create policy "apagar comentario" on public.page_post_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.page_posts pp join public.pages pg on pg.id = pp.page_id
                    where pp.id = post_id and pg.owner_id = auth.uid()));

grant select on public.page_post_comments to anon, authenticated;
grant insert, delete on public.page_post_comments to authenticated;

-- Freio contra spam: 1 comentário a cada 5 segundos, 30 por hora
create or replace function public.antes_de_comentar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.page_post_comments where user_id = new.user_id and created_at > now() - interval '5 seconds') then
    raise exception 'Calma! Espere um instante antes de comentar de novo.';
  end if;
  if (select count(*) from public.page_post_comments where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Muitos comentários seguidos. Tente daqui a pouco.';
  end if;
  new.body := trim(new.body);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists comentarios_antes on public.page_post_comments;
create trigger comentarios_antes before insert on public.page_post_comments
  for each row execute function public.antes_de_comentar();

-- Contador e notificação (agrupada) para o dono da página
create or replace function public.depois_de_comentar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dono uuid; pagina_nome text; pagina_slug text; trecho text;
begin
  if tg_op = 'INSERT' then
    update public.page_posts set comments_count = comments_count + 1 where id = new.post_id;
    select pg.owner_id, pg.name, pg.slug, left(coalesce(pp.body, ''), 90)
      into dono, pagina_nome, pagina_slug, trecho
      from public.page_posts pp join public.pages pg on pg.id = pp.page_id where pp.id = new.post_id;
    perform public.notificar(dono, 'comentario', new.post_id::text, new.user_id,
      jsonb_build_object('pagina', pagina_nome, 'slug', pagina_slug, 'trecho', trecho, 'comentario', left(new.body, 80)), true);
  else
    update public.page_posts set comments_count = greatest(comments_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists comentarios_depois on public.page_post_comments;
create trigger comentarios_depois after insert or delete on public.page_post_comments
  for each row execute function public.depois_de_comentar();

-- A edição de publicação (etapa 14) não pode mexer no contador de comentários
create or replace function public.ao_editar_publicacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.page_id := old.page_id; new.author_id := old.author_id; new.image_url := old.image_url;
    new.likes_count := old.likes_count; new.reposts_count := old.reposts_count; new.comments_count := old.comments_count;
    new.created_at := old.created_at;
    new.body := nullif(trim(coalesce(new.body, '')), '');
    if new.body is distinct from old.body then new.edited_at := now(); else new.edited_at := old.edited_at; end if;
  end if;
  return new;
end $$;

-- Publicação nova sempre começa com os contadores zerados
create or replace function public.antes_de_publicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.page_posts where page_id = new.page_id and created_at > now() - interval '1 day') >= 15 then
    raise exception 'Esta página já publicou 15 vezes nas últimas 24 horas. Tente mais tarde.';
  end if;
  new.body := nullif(trim(coalesce(new.body, '')), '');
  new.likes_count := 0;
  new.reposts_count := 0;
  new.comments_count := 0;
  new.created_at := now();
  return new;
end $$;
