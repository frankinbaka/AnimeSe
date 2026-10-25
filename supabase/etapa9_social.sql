-- ============================================================
-- AnimeSe — etapa 9: seguir usuários e chat geral em tempo real
--
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

-- ---------- Seguir ----------
create table if not exists public.follows (
  follower_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  following_id  uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint nao_segue_a_si_mesmo check (follower_id <> following_id)
);
create index if not exists seguidores_de on public.follows (following_id, created_at desc);

alter table public.follows enable row level security;

drop policy if exists "seguidores visiveis" on public.follows;
create policy "seguidores visiveis" on public.follows for select using (true);

drop policy if exists "seguir" on public.follows;
create policy "seguir" on public.follows for insert to authenticated with check (auth.uid() = follower_id);

drop policy if exists "deixar de seguir" on public.follows;
create policy "deixar de seguir" on public.follows for delete using (auth.uid() = follower_id);

grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;

-- Contagem de seguidores e seguindo de um perfil
create or replace function public.contagem_seguidores(p_usuario uuid)
returns table (seguidores integer, seguindo integer)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from public.follows where following_id = p_usuario),
         (select count(*)::int from public.follows where follower_id = p_usuario);
$$;
grant execute on function public.contagem_seguidores(uuid) to anon, authenticated;


-- ---------- Chat geral ----------
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists chat_recentes on public.chat_messages (created_at desc);

alter table public.chat_messages enable row level security;

-- Só quem tem conta lê e escreve no chat
drop policy if exists "chat para logados" on public.chat_messages;
create policy "chat para logados" on public.chat_messages for select to authenticated using (true);

drop policy if exists "enviar no chat" on public.chat_messages;
create policy "enviar no chat" on public.chat_messages for insert to authenticated with check (auth.uid() = user_id);

-- Cada um apaga a própria mensagem; o admin apaga qualquer uma
drop policy if exists "apagar do chat" on public.chat_messages;
create policy "apagar do chat" on public.chat_messages for delete using (auth.uid() = user_id or public.is_admin());

grant select, insert, delete on public.chat_messages to authenticated;

-- Freio contra spam: 1 mensagem a cada 2 segundos e no máximo 20 por minuto
create or replace function public.limitar_chat()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.chat_messages where user_id = new.user_id and created_at > now() - interval '2 seconds') then
    raise exception 'Calma! Espere um instante antes de mandar outra mensagem.';
  end if;
  if (select count(*) from public.chat_messages where user_id = new.user_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Muitas mensagens seguidas. Espere um minuto.';
  end if;
  new.body := trim(new.body);
  return new;
end $$;

drop trigger if exists chat_limite on public.chat_messages;
create trigger chat_limite before insert on public.chat_messages
  for each row execute function public.limitar_chat();

-- Mensagens novas e apagadas chegam na hora para quem está com o site aberto
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;
alter table public.chat_messages replica identity full;
