-- ============================================================
-- AnimeSe — etapa 6: feed de vídeos
--
-- * Criadores aprovados postam vídeos (link do YouTube, TikTok ou
--   Instagram) direto no feed, sem aprovação a cada post.
-- * As publicações do admin (tabela posts) também entram no feed.
-- * Qualquer usuário logado pode curtir e republicar no próprio perfil.
--
-- Rode depois do etapa5_criadores.sql, em: Supabase > SQL Editor > Run
-- ============================================================

-- ---------- Vídeos postados pelos criadores ----------
create table if not exists public.feed_videos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  video_url   text not null check (char_length(video_url) <= 400),
  rede        text not null check (rede in ('youtube', 'tiktok', 'instagram')),
  legenda     text check (legenda is null or char_length(legenda) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists feed_videos_recentes on public.feed_videos (created_at desc);
create index if not exists feed_videos_autor on public.feed_videos (user_id, created_at desc);

alter table public.feed_videos enable row level security;

drop policy if exists "feed visivel" on public.feed_videos;
create policy "feed visivel" on public.feed_videos for select using (true);

-- Só criador aprovado posta, e sempre em nome próprio
drop policy if exists "criador posta" on public.feed_videos;
create policy "criador posta" on public.feed_videos for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_creator)
);

-- O autor apaga o próprio vídeo; o admin apaga qualquer um
drop policy if exists "apagar video do feed" on public.feed_videos;
create policy "apagar video do feed" on public.feed_videos for delete
  using (auth.uid() = user_id or public.is_admin());

-- Freio contra spam: no máximo 20 vídeos por dia por pessoa
create or replace function public.limitar_posts_feed()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.feed_videos
       where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Você atingiu o limite de 20 vídeos por dia. Tente de novo amanhã.';
  end if;
  return new;
end $$;

drop trigger if exists feed_videos_limite on public.feed_videos;
create trigger feed_videos_limite before insert on public.feed_videos
  for each row execute function public.limitar_posts_feed();


-- ---------- Curtidas e republicações ----------
-- Cada item do feed tem uma chave: 'c:<id>' (vídeo de criador) ou 'o:<id>' (publicação oficial)
create table if not exists public.feed_likes (
  item_key    text not null check (item_key ~ '^[co]:\d+$'),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (item_key, user_id)
);
create table if not exists public.feed_reposts (
  item_key    text not null check (item_key ~ '^[co]:\d+$'),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (item_key, user_id)
);
create index if not exists feed_reposts_usuario on public.feed_reposts (user_id, created_at desc);

alter table public.feed_likes enable row level security;
alter table public.feed_reposts enable row level security;

drop policy if exists "curtidas visiveis" on public.feed_likes;
create policy "curtidas visiveis" on public.feed_likes for select using (true);
drop policy if exists "curtir no feed" on public.feed_likes;
create policy "curtir no feed" on public.feed_likes for insert with check (auth.uid() = user_id);
drop policy if exists "descurtir no feed" on public.feed_likes;
create policy "descurtir no feed" on public.feed_likes for delete using (auth.uid() = user_id);

drop policy if exists "republicacoes visiveis" on public.feed_reposts;
create policy "republicacoes visiveis" on public.feed_reposts for select using (true);
drop policy if exists "republicar" on public.feed_reposts;
create policy "republicar" on public.feed_reposts for insert with check (auth.uid() = user_id);
drop policy if exists "desfazer republicacao" on public.feed_reposts;
create policy "desfazer republicacao" on public.feed_reposts for delete using (auth.uid() = user_id);

-- Quando um item some, as curtidas e republicações dele somem junto
create or replace function public.limpar_interacoes_feed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  chave text := (case when tg_table_name = 'feed_videos' then 'c:' else 'o:' end) || old.id;
begin
  delete from public.feed_likes where item_key = chave;
  delete from public.feed_reposts where item_key = chave;
  return old;
end $$;

drop trigger if exists feed_videos_limpar on public.feed_videos;
create trigger feed_videos_limpar after delete on public.feed_videos
  for each row execute function public.limpar_interacoes_feed();
drop trigger if exists posts_limpar_feed on public.posts;
create trigger posts_limpar_feed after delete on public.posts
  for each row execute function public.limpar_interacoes_feed();


-- ---------- O feed: vídeos dos criadores + publicações oficiais ----------
create or replace view public.feed_itens
with (security_invoker = true) as
with base as (
  select 'c:' || v.id   as chave, 'criador'::text as origem, v.user_id as autor_id, 'video'::text as tipo,
         null::text as titulo, v.legenda as texto, null::text as imagem, v.video_url, v.created_at
    from public.feed_videos v
  union all
  select 'o:' || p.id, 'oficial', p.author_id, p.kind,
         p.title, p.summary, p.cover_url, p.video_url, p.published_at
    from public.posts p
   where p.published
)
select b.*,
       (select count(*)::int from public.feed_likes l where l.item_key = b.chave) as curtidas,
       (select count(*)::int from public.feed_reposts r where r.item_key = b.chave) as republicacoes
  from base b;


-- ---------- Permissões ----------
grant select on public.feed_videos, public.feed_likes, public.feed_reposts, public.feed_itens to anon, authenticated;
grant insert, delete on public.feed_videos, public.feed_likes, public.feed_reposts to authenticated;


-- ============================================================
-- Denúncias
-- * Qualquer usuário logado denuncia um item do feed (uma vez por item).
-- * Toda denúncia aparece no painel admin, aba Denúncias.
-- * Vídeo de criador com 5 denúncias de pessoas diferentes em 24 horas
--   é removido automaticamente (publicações oficiais nunca são).
-- * O admin decide: manter (denúncias arquivadas) ou remover a publicação.
-- ============================================================
create table if not exists public.feed_reports (
  id           bigint generated always as identity primary key,
  item_key     text not null check (item_key ~ '^[co]:\d+$'),
  reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  motivo       text not null check (motivo in ('sexual', 'violencia', 'odio', 'spam', 'fora_do_contexto', 'outro')),
  detalhe      text check (detalhe is null or char_length(detalhe) <= 300),
  status       text not null default 'aberta' check (status in ('aberta', 'mantida', 'removida', 'removida_auto')),
  -- cópia do que foi denunciado, para o admin ver mesmo depois de removido
  autor_id     uuid,
  video_url    text,
  legenda      text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  constraint uma_denuncia_por_pessoa unique (item_key, reporter_id)
);
create index if not exists denuncias_abertas on public.feed_reports (status, created_at desc);

alter table public.feed_reports enable row level security;

drop policy if exists "denunciar" on public.feed_reports;
create policy "denunciar" on public.feed_reports for insert to authenticated
  with check (auth.uid() = reporter_id and status = 'aberta');

-- Só o admin lê as denúncias
drop policy if exists "admin ve denuncias" on public.feed_reports;
create policy "admin ve denuncias" on public.feed_reports for select using (public.is_admin());

grant insert on public.feed_reports to authenticated;
grant select on public.feed_reports to authenticated;

-- Guarda uma cópia do item e aplica a remoção automática
create or replace function public.processar_denuncia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  vid public.feed_videos%rowtype;
  total int;
begin
  if new.item_key like 'c:%' then
    select * into vid from public.feed_videos where id = substr(new.item_key, 3)::bigint;
    if vid.id is null then raise exception 'Esse vídeo não existe mais.'; end if;
    if vid.user_id = new.reporter_id then raise exception 'Você não pode denunciar o próprio vídeo.'; end if;
    new.autor_id := vid.user_id; new.video_url := vid.video_url; new.legenda := vid.legenda;

    select count(distinct reporter_id) + 1 into total
      from public.feed_reports
     where item_key = new.item_key and created_at > now() - interval '24 hours' and reporter_id <> new.reporter_id;

    if total >= 5 then
      delete from public.feed_videos where id = vid.id;
      update public.feed_reports set status = 'removida_auto', resolved_at = now()
       where item_key = new.item_key and status = 'aberta';
      new.status := 'removida_auto';
      new.resolved_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists feed_reports_processar on public.feed_reports;
create trigger feed_reports_processar before insert on public.feed_reports
  for each row execute function public.processar_denuncia();

-- Decisão do admin sobre um item denunciado
create or replace function public.resolver_denuncias(p_item text, p_remover boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Só o admin pode resolver denúncias.' using errcode = '42501'; end if;
  if p_remover then
    if p_item like 'c:%' then delete from public.feed_videos where id = substr(p_item, 3)::bigint;
    else delete from public.posts where id = substr(p_item, 3)::bigint;
    end if;
  end if;
  update public.feed_reports
     set status = case when p_remover then 'removida' else 'mantida' end, resolved_at = now()
   where item_key = p_item and status = 'aberta';
end $$;

-- Quantos itens têm denúncia aberta (para o aviso do admin)
create or replace function public.denuncias_abertas()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_admin()
              then (select count(distinct item_key)::int from public.feed_reports where status = 'aberta')
              else 0 end;
$$;

grant execute on function public.resolver_denuncias(text, boolean) to authenticated;
grant execute on function public.denuncias_abertas() to authenticated;
