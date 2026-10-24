-- ============================================================
-- AnimeSe — etapa 2: novidades, resenhas e vídeos publicados
-- pelo admin, destaques do carrossel e imagens de capa.
--
-- Rode DEPOIS do schema.sql e do etapa3_comunidade.sql (ele usa a
-- função is_admin criada lá), em: Supabase > SQL Editor > Run
-- Pode ser rodado mais de uma vez sem problema.
-- ============================================================

-- ---------- Publicações ----------
create table if not exists public.posts (
  id            bigint generated always as identity primary key,
  kind          text not null default 'noticia',      -- noticia | resenha | video
  title         text not null check (char_length(title) between 3 and 160),
  summary       text check (summary is null or char_length(summary) <= 400),
  body          text check (body is null or char_length(body) <= 30000),
  cover_url     text,
  video_url     text,
  mal_id        integer,                               -- anime relacionado (opcional)
  anime_title   text,
  score         smallint check (score is null or score between 1 and 10), -- nota da resenha
  featured      boolean not null default false,        -- aparece no carrossel da página inicial
  published     boolean not null default false,        -- rascunho até publicar
  published_at  timestamptz,
  author_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tipo_valido check (kind in ('noticia', 'resenha', 'video'))
);
create index if not exists posts_publicados on public.posts (published, published_at desc);
create index if not exists posts_destaques on public.posts (featured, published_at desc) where featured and published;

alter table public.posts enable row level security;

-- Todo mundo vê o que foi publicado; o admin vê também os rascunhos
drop policy if exists "posts visiveis" on public.posts;
create policy "posts visiveis" on public.posts
  for select using (published or public.is_admin());

-- Só o admin cria, edita e apaga
drop policy if exists "admin cria posts" on public.posts;
create policy "admin cria posts" on public.posts for insert with check (public.is_admin());

drop policy if exists "admin edita posts" on public.posts;
create policy "admin edita posts" on public.posts for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin apaga posts" on public.posts;
create policy "admin apaga posts" on public.posts for delete using (public.is_admin());

-- Preenche a data de publicação na primeira vez que o post é publicado
create or replace function public.posts_data_publicacao()
returns trigger language plpgsql as $$
begin
  if new.published and new.published_at is null then
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists posts_data_publicacao on public.posts;
create trigger posts_data_publicacao
  before insert or update on public.posts
  for each row execute function public.posts_data_publicacao();

grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;


-- ---------- Imagens de capa (Supabase Storage) ----------
-- Pasta pública "capas": qualquer um vê, só o admin envia e apaga
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capas', 'capas', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "capas visiveis" on storage.objects;
create policy "capas visiveis" on storage.objects
  for select using (bucket_id = 'capas');

drop policy if exists "admin envia capas" on storage.objects;
create policy "admin envia capas" on storage.objects
  for insert to authenticated with check (bucket_id = 'capas' and public.is_admin());

drop policy if exists "admin apaga capas" on storage.objects;
create policy "admin apaga capas" on storage.objects
  for delete to authenticated using (bucket_id = 'capas' and public.is_admin());


-- ---------- Tornar alguém admin ----------
-- O site não deixa ninguém se promover sozinho. Para dar acesso ao
-- painel, rode no SQL Editor trocando o nick:
--
--   update public.profiles set role = 'admin' where nickname = 'SEU_NICK';


-- ---------- Contador de visitas (anônimo) ----------
-- Cada navegador recebe um código aleatório guardado nele mesmo; não
-- é guardado nome, e-mail nem IP. Serve para o admin ver visitas e
-- visitantes únicos por dia.
create table if not exists public.site_visits (
  id          bigint generated always as identity primary key,
  visitor     text not null check (char_length(visitor) between 8 and 64),
  path        text not null check (char_length(path) <= 120),
  user_id     uuid,
  created_at  timestamptz not null default now()
);
create index if not exists visitas_por_data on public.site_visits (created_at desc);
create index if not exists visitas_por_visitante on public.site_visits (visitor, path, created_at desc);

alter table public.site_visits enable row level security;
-- Ninguém lê nem grava direto: só pelas funções abaixo
revoke all on public.site_visits from anon, authenticated;

-- Registra uma visita. A mesma página aberta de novo pelo mesmo
-- navegador em menos de 30 minutos não conta outra vez.
create or replace function public.registrar_visita(p_visitor text, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_visitor is null or char_length(p_visitor) not between 8 and 64 then return; end if;
  p_path := left(coalesce(nullif(p_path, ''), '/'), 120);
  if exists (
    select 1 from public.site_visits
     where visitor = p_visitor and path = p_path and created_at > now() - interval '30 minutes'
  ) then return; end if;
  insert into public.site_visits (visitor, path, user_id) values (p_visitor, p_path, auth.uid());
end $$;

grant execute on function public.registrar_visita(text, text) to anon, authenticated;


-- ---------- Estatísticas para o painel de admin ----------
create or replace function public.estatisticas_admin()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  resultado jsonb;
begin
  if not public.is_admin() then
    raise exception 'Só o admin pode ver as estatísticas.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'usuarios', jsonb_build_object(
      'total',  (select count(*) from profiles),
      'dias7',  (select count(*) from profiles where created_at > now() - interval '7 days'),
      'dias30', (select count(*) from profiles where created_at > now() - interval '30 days'),
      'com_nick', (select count(*) from profiles where nickname is not null)
    ),
    'visitas', jsonb_build_object(
      'hoje',   (select count(*) from site_visits where created_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
      'dias7',  (select count(*) from site_visits where created_at > now() - interval '7 days'),
      'dias30', (select count(*) from site_visits where created_at > now() - interval '30 days'),
      'unicos7',  (select count(distinct visitor) from site_visits where created_at > now() - interval '7 days'),
      'unicos30', (select count(distinct visitor) from site_visits where created_at > now() - interval '30 days')
    ),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia::date, 'visitas', coalesce(v.visitas, 0), 'visitantes', coalesce(v.visitantes, 0)) order by d.dia)
        from generate_series((now() at time zone 'America/Sao_Paulo')::date - 29, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') as d(dia)
        left join (
          select (created_at at time zone 'America/Sao_Paulo')::date as dia, count(*) as visitas, count(distinct visitor) as visitantes
            from site_visits where created_at > now() - interval '31 days' group by 1
        ) v on v.dia = d.dia::date
    ), '[]'::jsonb),
    'paginas', coalesce((
      select jsonb_agg(x) from (
        select path as pagina, count(*) as visitas from site_visits
         where created_at > now() - interval '30 days' group by path order by count(*) desc limit 8
      ) x
    ), '[]'::jsonb),
    'comunidade', jsonb_build_object(
      'avaliacoes', (select count(*) from reviews),
      'respostas',  (select count(*) from review_replies),
      'likes',      (select count(*) from review_likes),
      'sugestoes',  (select count(*) from recommendations)
    ),
    'listas', jsonb_build_object(
      'total',      (select count(*) from anime_list),
      'assistindo', (select count(*) from anime_list where status = 'assistindo'),
      'assistido',  (select count(*) from anime_list where status = 'assistido'),
      'pretendo',   (select count(*) from anime_list where status = 'pretendo'),
      'dropado',    (select count(*) from anime_list where status = 'dropado')
    ),
    'animes_mais_adicionados', coalesce((
      select jsonb_agg(x) from (
        select mal_id, (array_agg(title))[1] as titulo, (array_agg(image_url))[1] as imagem, count(*) as total
          from anime_list group by mal_id order by count(*) desc limit 8
      ) x
    ), '[]'::jsonb),
    'ultimos_usuarios', coalesce((
      select jsonb_agg(x) from (
        select id, nickname, display_name, avatar_url, tag, created_at from profiles order by created_at desc limit 8
      ) x
    ), '[]'::jsonb),
    'publicacoes', jsonb_build_object(
      'publicadas', (select count(*) from posts where published),
      'rascunhos',  (select count(*) from posts where not published)
    )
  ) into resultado;

  return resultado;
end $$;

grant execute on function public.estatisticas_admin() to authenticated;
