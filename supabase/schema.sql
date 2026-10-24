-- ============================================================
-- AnimeSe — banco de dados (Supabase / PostgreSQL)
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- ============================================================

-- ---------- Perfis ----------
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  nickname         text unique,
  tag              text,
  favorite_mal_id  integer,
  favorite_title   text,
  favorite_image   text,
  avatar_url       text,
  role             text not null default 'user',   -- 'user' ou 'admin' (área de admin, próxima etapa)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint nickname_formato check (nickname is null or nickname ~ '^[[:alnum:]._-]{3,20}$'),
  constraint tag_formato      check (tag is null or tag ~ '^[A-Z0-9]{1,5}$'),
  constraint role_valida      check (role in ('user', 'admin'))
);

-- Nick único sem diferenciar maiúsculas de minúsculas
create unique index if not exists profiles_nickname_unico on public.profiles (lower(nickname));

alter table public.profiles enable row level security;

-- Qualquer pessoa pode ver perfis (nick e tag são públicos)
drop policy if exists "perfis visiveis" on public.profiles;
create policy "perfis visiveis" on public.profiles
  for select using (true);

-- Cada usuário cria e edita só o próprio perfil
drop policy if exists "criar proprio perfil" on public.profiles;
create policy "criar proprio perfil" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "editar proprio perfil" on public.profiles;
create policy "editar proprio perfil" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Impede que o próprio usuário se promova a admin pelo navegador
create or replace function public.proteger_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and current_user = 'authenticated' then
    new.role := old.role;
  end if;
  return new;
end $$;

drop trigger if exists profiles_proteger_role on public.profiles;
create trigger profiles_proteger_role
  before update on public.profiles
  for each row execute function public.proteger_role();

-- Cria o perfil automaticamente no primeiro login com Google
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();


-- ---------- Lista de animes ----------
create table if not exists public.anime_list (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mal_id      integer not null,
  title       text not null,
  image_url   text,
  episodes    integer,
  score       numeric(4,2),
  status      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint status_valido check (status in ('assistindo', 'assistido', 'pretendo', 'dropado')),
  constraint um_registro_por_anime unique (user_id, mal_id)
);

create index if not exists anime_list_usuario on public.anime_list (user_id, updated_at desc);

alter table public.anime_list enable row level security;

-- Cada usuário vê e altera só a própria lista
drop policy if exists "ver propria lista" on public.anime_list;
create policy "ver propria lista" on public.anime_list
  for select using (auth.uid() = user_id);

drop policy if exists "adicionar na propria lista" on public.anime_list;
create policy "adicionar na propria lista" on public.anime_list
  for insert with check (auth.uid() = user_id);

drop policy if exists "editar propria lista" on public.anime_list;
create policy "editar propria lista" on public.anime_list
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "remover da propria lista" on public.anime_list;
create policy "remover da propria lista" on public.anime_list
  for delete using (auth.uid() = user_id);
