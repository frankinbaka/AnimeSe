-- ============================================================
-- AnimeSe — etapa 3: avaliações, respostas, likes e
-- animes sugeridos pela comunidade.
--
-- Rode DEPOIS do schema.sql, em: Supabase > SQL Editor > New query > Run
-- Pode ser rodado mais de uma vez sem problema.
-- ============================================================

-- ---------- Perfis: nome do Google e admin ----------
alter table public.profiles add column if not exists display_name text;

-- Preenche o nome de quem já entrou no site
update public.profiles p
   set display_name = coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
 where u.id = p.id and p.display_name is null;

-- Garante um perfil para todo usuário que já existe
insert into public.profiles (id, avatar_url, display_name)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
on conflict (id) do nothing;

-- Novos usuários já entram com nome e foto do Google
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, avatar_url, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- true quando quem está logado é admin (usado nas regras de moderação)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;


-- ---------- Avaliações (nota de 1 a 10 + comentário) ----------
create table if not exists public.reviews (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  mal_id       integer not null,
  anime_title  text not null,
  anime_image  text,
  score        smallint not null check (score between 1 and 10),
  body         text check (body is null or char_length(body) <= 2000),
  spoiler      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uma_avaliacao_por_anime unique (user_id, mal_id)
);
create index if not exists reviews_por_anime on public.reviews (mal_id, created_at desc);
create index if not exists reviews_recentes on public.reviews (created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "avaliacoes visiveis" on public.reviews;
create policy "avaliacoes visiveis" on public.reviews for select using (true);

drop policy if exists "criar propria avaliacao" on public.reviews;
create policy "criar propria avaliacao" on public.reviews for insert with check (auth.uid() = user_id);

drop policy if exists "editar propria avaliacao" on public.reviews;
create policy "editar propria avaliacao" on public.reviews for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "remover avaliacao" on public.reviews;
create policy "remover avaliacao" on public.reviews for delete
  using (auth.uid() = user_id or public.is_admin());


-- ---------- Respostas às avaliações ----------
create table if not exists public.review_replies (
  id          bigint generated always as identity primary key,
  review_id   bigint not null references public.reviews (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists replies_por_avaliacao on public.review_replies (review_id, created_at);

alter table public.review_replies enable row level security;

drop policy if exists "respostas visiveis" on public.review_replies;
create policy "respostas visiveis" on public.review_replies for select using (true);

drop policy if exists "criar propria resposta" on public.review_replies;
create policy "criar propria resposta" on public.review_replies for insert with check (auth.uid() = user_id);

drop policy if exists "remover resposta" on public.review_replies;
create policy "remover resposta" on public.review_replies for delete
  using (auth.uid() = user_id or public.is_admin());


-- ---------- Likes nas avaliações ----------
create table if not exists public.review_likes (
  review_id   bigint not null references public.reviews (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (review_id, user_id)
);
create index if not exists likes_por_usuario on public.review_likes (user_id);

alter table public.review_likes enable row level security;

drop policy if exists "likes visiveis" on public.review_likes;
create policy "likes visiveis" on public.review_likes for select using (true);

-- Cada um curte com a própria conta e não pode curtir a própria avaliação
drop policy if exists "curtir" on public.review_likes;
create policy "curtir" on public.review_likes for insert with check (
  auth.uid() = user_id
  and not exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid())
);

drop policy if exists "descurtir" on public.review_likes;
create policy "descurtir" on public.review_likes for delete using (auth.uid() = user_id);


-- ---------- Animes sugeridos pela comunidade ----------
create table if not exists public.recommendations (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  mal_id       integer not null,
  anime_title  text not null,
  anime_image  text,
  reason       text check (reason is null or char_length(reason) <= 500),
  created_at   timestamptz not null default now(),
  constraint uma_sugestao_por_anime unique (user_id, mal_id)
);
create index if not exists sugestoes_por_anime on public.recommendations (mal_id, created_at desc);

alter table public.recommendations enable row level security;

drop policy if exists "sugestoes visiveis" on public.recommendations;
create policy "sugestoes visiveis" on public.recommendations for select using (true);

drop policy if exists "criar propria sugestao" on public.recommendations;
create policy "criar propria sugestao" on public.recommendations for insert with check (auth.uid() = user_id);

drop policy if exists "editar propria sugestao" on public.recommendations;
create policy "editar propria sugestao" on public.recommendations for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "remover sugestao" on public.recommendations;
create policy "remover sugestao" on public.recommendations for delete
  using (auth.uid() = user_id or public.is_admin());


-- ---------- Resumos (views) ----------
-- Animes mais sugeridos: quantas pessoas sugeriram cada um
create or replace view public.community_recommendations
with (security_invoker = true) as
select mal_id,
       (array_agg(anime_title order by created_at desc))[1] as anime_title,
       (array_agg(anime_image order by created_at desc))[1] as anime_image,
       count(*)::int as total,
       max(created_at) as last_at
  from public.recommendations
 group by mal_id;

-- Nota média dos usuários do AnimeSe em cada anime
create or replace view public.review_stats
with (security_invoker = true) as
select mal_id,
       round(avg(score)::numeric, 2) as average,
       count(*)::int as total
  from public.reviews
 group by mal_id;


-- ---------- Permissões de acesso pela API ----------
grant select on public.reviews, public.review_replies, public.review_likes, public.recommendations,
                public.community_recommendations, public.review_stats to anon, authenticated;
grant insert, update, delete on public.reviews, public.review_replies, public.review_likes,
                public.recommendations to authenticated;
