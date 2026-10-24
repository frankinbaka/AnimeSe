-- ============================================================
-- AnimeSe — etapa 4: perfil público e criadores de conteúdo
--
-- Rode depois dos outros arquivos, em: Supabase > SQL Editor > Run
-- Pode ser rodado mais de uma vez sem problema.
-- ============================================================

-- ---------- Campos de criador de conteúdo no perfil ----------
alter table public.profiles add column if not exists bio            text;
alter table public.profiles add column if not exists is_creator     boolean not null default false;
alter table public.profiles add column if not exists youtube_url    text;
alter table public.profiles add column if not exists tiktok_url     text;
alter table public.profiles add column if not exists instagram_url  text;
alter table public.profiles add column if not exists creator_videos jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.profiles add constraint bio_tamanho check (bio is null or char_length(bio) <= 300);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint links_https check (
        (youtube_url   is null or youtube_url   ~* '^https://([a-z0-9-]+\.)?youtube\.com/')
    and (tiktok_url    is null or tiktok_url    ~* '^https://([a-z0-9-]+\.)?tiktok\.com/')
    and (instagram_url is null or instagram_url ~* '^https://([a-z0-9-]+\.)?instagram\.com/')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint videos_limite check (
    jsonb_typeof(creator_videos) = 'array' and jsonb_array_length(creator_videos) <= 12
  );
exception when duplicate_object then null; end $$;


-- ---------- Listas visíveis no perfil público ----------
-- Antes cada usuário via só a própria lista; agora qualquer pessoa
-- pode ver a lista de outro usuário (só ver: editar continua só o dono).
drop policy if exists "ver propria lista" on public.anime_list;
drop policy if exists "listas visiveis" on public.anime_list;
create policy "listas visiveis" on public.anime_list for select using (true);

grant select on public.anime_list to anon, authenticated;
grant select on public.profiles to anon, authenticated;
