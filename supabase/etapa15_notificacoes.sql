-- ============================================================
-- AnimeSe — etapa 15: notificações (sininho)
--
-- Avisos para o usuário:
--   • página aprovada, recusada ou suspensa
--   • pedido de criador aprovado ou recusado
--   • apoio confirmado
--   • curtidas e republicações nas publicações da página
--     (agrupadas: "Fulano e mais 9 pessoas curtiram…")
--   • anime da lista que estreou e nova temporada de anime já assistido
--     (esses dois são criados uma vez por dia pela função /api/avisos-anime)
--
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

create table if not exists public.notifications (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  tipo         text not null,
  ref          text,                         -- o que agrupa (ex.: id da publicação)
  ator_id      uuid references public.profiles (id) on delete set null,  -- quem fez por último
  atores       integer not null default 1,   -- quantas pessoas no grupo
  dados        jsonb not null default '{}'::jsonb,
  lida         boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists notificacoes_usuario on public.notifications (user_id, updated_at desc);
create index if not exists notificacoes_nao_lidas on public.notifications (user_id) where not lida;
create index if not exists notificacoes_grupo on public.notifications (user_id, tipo, ref) where not lida;

alter table public.notifications enable row level security;

drop policy if exists "ver minhas notificacoes" on public.notifications;
create policy "ver minhas notificacoes" on public.notifications for select to authenticated using (user_id = auth.uid());

drop policy if exists "marcar como lida" on public.notifications;
create policy "marcar como lida" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "apagar notificacao" on public.notifications;
create policy "apagar notificacao" on public.notifications for delete to authenticated using (user_id = auth.uid());

grant select, update, delete on public.notifications to authenticated;
-- (ninguém insere direto: só as funções abaixo, que rodam como sistema)

-- Na atualização feita pelo usuário, só "lida" pode mudar
create or replace function public.proteger_notificacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.user_id := old.user_id; new.tipo := old.tipo; new.ref := old.ref; new.ator_id := old.ator_id;
    new.atores := old.atores; new.dados := old.dados; new.created_at := old.created_at; new.updated_at := old.updated_at;
  end if;
  return new;
end $$;
drop trigger if exists notifications_proteger on public.notifications;
create trigger notifications_proteger before update on public.notifications
  for each row execute function public.proteger_notificacao();

/**
 * Cria uma notificação ou, se já houver uma não lida do mesmo tipo e assunto
 * nas últimas 24 horas, junta nela ("e mais N pessoas").
 */
create or replace function public.notificar(p_usuario uuid, p_tipo text, p_ref text, p_ator uuid, p_dados jsonb, p_agrupar boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  existente bigint;
begin
  if p_usuario is null or p_usuario = p_ator then return; end if;
  if p_agrupar then
    select id into existente from public.notifications
     where user_id = p_usuario and tipo = p_tipo and ref = p_ref and not lida and updated_at > now() - interval '24 hours'
     order by updated_at desc limit 1;
    if existente is not null then
      update public.notifications
         set atores = atores + 1, ator_id = p_ator, dados = dados || p_dados, updated_at = now()
       where id = existente;
      return;
    end if;
  end if;
  insert into public.notifications (user_id, tipo, ref, ator_id, dados) values (p_usuario, p_tipo, p_ref, p_ator, coalesce(p_dados, '{}'::jsonb));
  -- Limpeza: de vez em quando apaga avisos com mais de 60 dias
  if random() < 0.02 then
    delete from public.notifications where updated_at < now() - interval '60 days';
  end if;
end $$;
revoke execute on function public.notificar(uuid, text, text, uuid, jsonb, boolean) from public, anon, authenticated;

-- Contador do sininho
create or replace function public.notificacoes_nao_lidas()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and not lida;
$$;
grant execute on function public.notificacoes_nao_lidas() to authenticated;


-- ---------- Página aprovada / recusada / suspensa ----------
create or replace function public.avisar_pagina()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected', 'suspended') then
    perform public.notificar(new.owner_id,
      case new.status when 'approved' then 'pagina_aprovada' when 'rejected' then 'pagina_recusada' else 'pagina_suspensa' end,
      new.id::text, null,
      jsonb_build_object('nome', new.name, 'slug', new.slug, 'avatar', new.avatar_url, 'nota', new.admin_note));
  end if;
  return null;
end $$;
drop trigger if exists pages_avisar on public.pages;
create trigger pages_avisar after update on public.pages
  for each row execute function public.avisar_pagina();


-- ---------- Pedido de criador avaliado ----------
create or replace function public.avisar_criador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.creator_status = 'pending' and new.creator_status <> 'pending' and new.creator_reviewed_at is distinct from old.creator_reviewed_at then
    perform public.notificar(new.id,
      case when new.creator_note is null then 'criador_aprovado' else 'criador_recusado' end,
      null, null, jsonb_build_object('nota', new.creator_note));
  end if;
  return null;
end $$;
drop trigger if exists profiles_avisar_criador on public.profiles;
create trigger profiles_avisar_criador after update on public.profiles
  for each row execute function public.avisar_criador();


-- ---------- Apoio confirmado ----------
create or replace function public.avisar_apoio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pendente' and new.status = 'confirmado' then
    perform public.notificar(new.user_id, 'apoio_confirmado', new.id::text, null, jsonb_build_object('valor', new.valor));
  elsif old.status = 'pendente' and new.status = 'recusado' then
    perform public.notificar(new.user_id, 'apoio_recusado', new.id::text, null, jsonb_build_object('motivo', new.motivo));
  end if;
  return null;
end $$;
drop trigger if exists supports_avisar on public.supports;
create trigger supports_avisar after update on public.supports
  for each row execute function public.avisar_apoio();


-- ---------- Curtidas e republicações (agrupadas) ----------
create or replace function public.avisar_interacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dono uuid; pagina_nome text; pagina_slug text; trecho text; imagem text;
begin
  select pg.owner_id, pg.name, pg.slug, left(coalesce(pp.body, ''), 90), pp.image_url
    into dono, pagina_nome, pagina_slug, trecho, imagem
    from public.page_posts pp join public.pages pg on pg.id = pp.page_id
   where pp.id = new.post_id;
  perform public.notificar(dono,
    case tg_table_name when 'page_post_likes' then 'curtida' else 'republicacao' end,
    new.post_id::text, new.user_id,
    jsonb_build_object('pagina', pagina_nome, 'slug', pagina_slug, 'trecho', trecho, 'imagem', imagem),
    true);
  return null;
end $$;
drop trigger if exists curtida_avisar on public.page_post_likes;
create trigger curtida_avisar after insert on public.page_post_likes
  for each row execute function public.avisar_interacao();
drop trigger if exists republicacao_avisar on public.page_post_reposts;
create trigger republicacao_avisar after insert on public.page_post_reposts
  for each row execute function public.avisar_interacao();


-- ---------- Avisos de anime (usados pela função diária /api/avisos-anime) ----------
-- Registro do que já foi avisado, para não repetir
create table if not exists public.anime_avisos (
  mal_id     integer not null,
  tipo       text not null,       -- estreou | nova_temporada
  criado_em  timestamptz not null default now(),
  primary key (mal_id, tipo)
);
alter table public.anime_avisos enable row level security;
-- (sem políticas: só a chave de serviço da Vercel lê e escreve)

/**
 * Chamada pela função diária com a chave de serviço.
 *   p_anime: { id, titulo, imagem }   p_prequels: ids das temporadas anteriores
 * Devolve quantas notificações criou.
 */
create or replace function public.avisar_anime(p_anime jsonb, p_prequels integer[], p_prequel_titulo text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  novo integer := (p_anime ->> 'id')::int;
  total integer := 0;
  n integer;
  franquias integer[];
begin
  -- Estreou: quem tem o anime na lista (menos quem dropou)
  if not exists (select 1 from public.anime_avisos where mal_id = novo and tipo = 'estreou') then
    insert into public.notifications (user_id, tipo, ref, dados)
    select distinct al.user_id, 'anime_estreou', novo::text, p_anime
      from public.anime_list al where al.mal_id = novo and al.status <> 'dropado';
    get diagnostics n = row_count; total := total + n;
    insert into public.anime_avisos (mal_id, tipo) values (novo, 'estreou') on conflict do nothing;
  end if;

  -- Nova temporada: quem já assistiu a anterior (ou algo da mesma franquia) e ainda não tem a nova na lista
  if coalesce(array_length(p_prequels, 1), 0) > 0
     and not exists (select 1 from public.anime_avisos where mal_id = novo and tipo = 'nova_temporada') then
    select array_agg(distinct franchise_id) into franquias
      from public.anime_list where mal_id = any(p_prequels) and franchise_id is not null;
    insert into public.notifications (user_id, tipo, ref, dados)
    select distinct al.user_id, 'nova_temporada', novo::text, p_anime || jsonb_build_object('anterior', p_prequel_titulo)
      from public.anime_list al
     where al.status in ('assistido', 'assistindo')
       and (al.mal_id = any(p_prequels) or al.franchise_id = any(coalesce(franquias, '{}')))
       and not exists (select 1 from public.anime_list x where x.user_id = al.user_id and x.mal_id = novo);
    get diagnostics n = row_count; total := total + n;
    insert into public.anime_avisos (mal_id, tipo) values (novo, 'nova_temporada') on conflict do nothing;
  end if;
  return total;
end $$;
revoke execute on function public.avisar_anime(jsonb, integer[], text) from public, anon, authenticated;
grant execute on function public.avisar_anime(jsonb, integer[], text) to service_role;
grant execute on function public.notificar(uuid, text, text, uuid, jsonb, boolean) to service_role;
