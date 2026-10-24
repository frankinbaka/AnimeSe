-- ============================================================
-- AnimeSe — etapa 5: criadores de conteúdo com aprovação do admin
--
-- Como funciona:
--  * O usuário preenche os links e vídeos e SOLICITA acesso.
--    Isso fica guardado em "creator_pending" e o status vira 'pending'.
--  * O admin vê o pedido no painel, confere e APROVA ou RECUSA (com motivo).
--  * Só ao aprovar os links/vídeos são copiados para os campos públicos
--    (youtube_url, tiktok_url, instagram_url, creator_videos) e o selo
--    de criador (is_creator) é ligado.
--  * Se um criador aprovado mudar os links, a mudança vira um novo pedido;
--    os links antigos continuam no ar até o admin aprovar os novos.
--
-- Rode depois do etapa4_perfil_publico.sql, em: Supabase > SQL Editor > Run
-- ============================================================

alter table public.profiles add column if not exists creator_status       text not null default 'none';
alter table public.profiles add column if not exists creator_pending      jsonb;
alter table public.profiles add column if not exists creator_requested_at timestamptz;
alter table public.profiles add column if not exists creator_reviewed_at  timestamptz;
alter table public.profiles add column if not exists creator_note         text;

do $$ begin
  alter table public.profiles add constraint creator_status_valido
    check (creator_status in ('none', 'pending', 'approved', 'rejected'));
exception when duplicate_object then null; end $$;

create index if not exists perfis_criadores_pendentes on public.profiles (creator_requested_at) where creator_status = 'pending';

-- Quem já tinha marcado "sou criador" antes desta etapa passa a aguardar
-- a análise do admin: os dados viram um pedido e saem do ar.
update public.profiles
   set creator_pending = jsonb_build_object(
         'youtube', youtube_url, 'tiktok', tiktok_url, 'instagram', instagram_url,
         'videos', coalesce(creator_videos, '[]'::jsonb)),
       creator_status = 'pending',
       creator_requested_at = coalesce(creator_requested_at, now()),
       is_creator = false,
       youtube_url = null, tiktok_url = null, instagram_url = null,
       creator_videos = '[]'::jsonb
 where is_creator and creator_status = 'none';


-- ---------- Proteção: o usuário não se aprova sozinho ----------
-- Pelo site (papel "authenticated"), estes campos não podem ser mudados
-- direto; só pelas funções abaixo ou pelo SQL Editor.
create or replace function public.proteger_campos_criador()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_creator := false;
      new.youtube_url := null; new.tiktok_url := null; new.instagram_url := null;
      new.creator_videos := '[]'::jsonb;
      new.creator_status := 'none';
      new.creator_pending := null;
      new.creator_requested_at := null; new.creator_reviewed_at := null; new.creator_note := null;
    else
      new.is_creator := old.is_creator;
      new.youtube_url := old.youtube_url; new.tiktok_url := old.tiktok_url; new.instagram_url := old.instagram_url;
      new.creator_videos := old.creator_videos;
      new.creator_status := old.creator_status;
      new.creator_pending := old.creator_pending;
      new.creator_requested_at := old.creator_requested_at;
      new.creator_reviewed_at := old.creator_reviewed_at;
      new.creator_note := old.creator_note;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_proteger_criador on public.profiles;
create trigger profiles_proteger_criador
  before insert or update on public.profiles
  for each row execute function public.proteger_campos_criador();


-- ---------- Funções usadas pelo site ----------

-- Valida e limpa os dados enviados num pedido
create or replace function public.limpar_dados_criador(p jsonb)
returns jsonb language plpgsql immutable as $$
declare
  yt text := nullif(trim(p ->> 'youtube'), '');
  tk text := nullif(trim(p ->> 'tiktok'), '');
  ig text := nullif(trim(p ->> 'instagram'), '');
  videos jsonb := coalesce(p -> 'videos', '[]'::jsonb);
begin
  if yt is not null and yt !~* '^https://([a-z0-9-]+\.)?youtube\.com/' then raise exception 'O link do YouTube parece errado.'; end if;
  if tk is not null and tk !~* '^https://([a-z0-9-]+\.)?tiktok\.com/' then raise exception 'O link do TikTok parece errado.'; end if;
  if ig is not null and ig !~* '^https://([a-z0-9-]+\.)?instagram\.com/' then raise exception 'O link do Instagram parece errado.'; end if;
  if jsonb_typeof(videos) <> 'array' or jsonb_array_length(videos) > 12 then raise exception 'Envie no máximo 12 vídeos.'; end if;
  if yt is null and tk is null and ig is null and jsonb_array_length(videos) = 0 then
    raise exception 'Adicione pelo menos um canal ou vídeo.';
  end if;
  return jsonb_build_object('youtube', yt, 'tiktok', tk, 'instagram', ig, 'videos', videos);
end $$;

-- O usuário envia (ou reenvia) o pedido de criador
create or replace function public.solicitar_criador(p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre com sua conta para solicitar.'; end if;
  update public.profiles
     set creator_pending = public.limpar_dados_criador(p_dados),
         creator_status = 'pending',
         creator_requested_at = now(),
         creator_note = null
   where id = auth.uid();
end $$;

-- O usuário desiste do pedido (um criador aprovado continua aprovado)
create or replace function public.cancelar_pedido_criador()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set creator_pending = null,
         creator_status = case when is_creator then 'approved' else 'none' end,
         creator_requested_at = null
   where id = auth.uid() and creator_status = 'pending';
end $$;

-- O usuário deixa de ser criador (tira o selo e os links do perfil)
create or replace function public.sair_de_criador()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set is_creator = false, creator_status = 'none', creator_pending = null,
         youtube_url = null, tiktok_url = null, instagram_url = null, creator_videos = '[]'::jsonb,
         creator_requested_at = null, creator_note = null
   where id = auth.uid();
end $$;

-- O admin aprova ou recusa um pedido
create or replace function public.avaliar_criador(p_usuario uuid, p_aprovar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  dados jsonb;
begin
  if not public.is_admin() then raise exception 'Só o admin pode avaliar pedidos.' using errcode = '42501'; end if;
  select creator_pending into dados from public.profiles where id = p_usuario and creator_status = 'pending';
  if dados is null then raise exception 'Esse pedido não existe mais ou já foi avaliado.'; end if;

  if p_aprovar then
    update public.profiles
       set is_creator = true,
           youtube_url = dados ->> 'youtube', tiktok_url = dados ->> 'tiktok', instagram_url = dados ->> 'instagram',
           creator_videos = coalesce(dados -> 'videos', '[]'::jsonb),
           creator_status = 'approved', creator_pending = null,
           creator_reviewed_at = now(), creator_note = null
     where id = p_usuario;
  else
    update public.profiles
       set creator_status = case when is_creator then 'approved' else 'rejected' end,
           creator_pending = null,
           creator_reviewed_at = now(),
           creator_note = left(nullif(trim(p_motivo), ''), 500)
     where id = p_usuario;
  end if;
end $$;

-- O admin tira o selo de um criador já aprovado
create or replace function public.revogar_criador(p_usuario uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Só o admin pode revogar.' using errcode = '42501'; end if;
  update public.profiles
     set is_creator = false, creator_status = 'rejected', creator_pending = null,
         youtube_url = null, tiktok_url = null, instagram_url = null, creator_videos = '[]'::jsonb,
         creator_reviewed_at = now(), creator_note = left(nullif(trim(p_motivo), ''), 500)
   where id = p_usuario;
end $$;

grant execute on function public.solicitar_criador(jsonb) to authenticated;
grant execute on function public.cancelar_pedido_criador() to authenticated;
grant execute on function public.sair_de_criador() to authenticated;
grant execute on function public.avaliar_criador(uuid, boolean, text) to authenticated;
grant execute on function public.revogar_criador(uuid, text) to authenticated;


-- ---------- Estatísticas: pedidos pendentes ----------
create or replace function public.pedidos_criador_pendentes()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_admin()
              then (select count(*)::int from public.profiles where creator_status = 'pending')
              else 0 end;
$$;
grant execute on function public.pedidos_criador_pendentes() to authenticated;


-- ---------- Perfil público mostra só os animes já assistidos ----------
-- Outras pessoas veem apenas os "Já assisti" de cada usuário; o próprio
-- dono continua vendo a lista inteira (assistindo, pretendo, dropei).
drop policy if exists "listas visiveis" on public.anime_list;
drop policy if exists "ver propria lista" on public.anime_list;
drop policy if exists "lista propria e assistidos visiveis" on public.anime_list;
create policy "lista propria e assistidos visiveis" on public.anime_list
  for select using (auth.uid() = user_id or status = 'assistido');
