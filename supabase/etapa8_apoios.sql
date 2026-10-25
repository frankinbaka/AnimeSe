-- ============================================================
-- AnimeSe — etapa 8: apoio via Pix e selo de Apoiador
--
-- * O usuário faz o Pix e avisa pelo site ("Já fiz o Pix").
-- * O pedido fica 'pendente' até o admin conferir no banco e confirmar.
-- * Ao confirmar, o perfil ganha o selo de Apoiador até a data escolhida
--   (30 dias, 1 ano ou para sempre).
--
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

-- Selo no perfil: apoiador enquanto supporter_until estiver no futuro
alter table public.profiles add column if not exists supporter_until timestamptz;
-- Se aceita aparecer no mural de apoiadores
alter table public.profiles add column if not exists supporter_public boolean not null default true;

-- O usuário não pode se dar o selo sozinho pelo site
create or replace function public.proteger_selo_apoiador()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then new.supporter_until := null;
    else new.supporter_until := old.supporter_until;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_proteger_apoiador on public.profiles;
create trigger profiles_proteger_apoiador
  before insert or update on public.profiles
  for each row execute function public.proteger_selo_apoiador();


-- ---------- Apoios ----------
create table if not exists public.supports (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  valor         numeric(10,2) not null check (valor >= 1 and valor <= 10000),
  mensagem      text check (mensagem is null or char_length(mensagem) <= 280),
  nome_pagador  text check (nome_pagador is null or char_length(nome_pagador) <= 80),
  status        text not null default 'pendente' check (status in ('pendente', 'confirmado', 'recusado')),
  motivo        text check (motivo is null or char_length(motivo) <= 300),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists apoios_por_status on public.supports (status, created_at desc);
create index if not exists apoios_por_usuario on public.supports (user_id, created_at desc);

alter table public.supports enable row level security;

-- Cada um vê os próprios apoios; o admin vê todos
drop policy if exists "ver apoios" on public.supports;
create policy "ver apoios" on public.supports for select
  using (auth.uid() = user_id or public.is_admin());

-- Cada um registra o próprio apoio, sempre como pendente
drop policy if exists "registrar apoio" on public.supports;
create policy "registrar apoio" on public.supports for insert to authenticated
  with check (auth.uid() = user_id and status = 'pendente');

grant select, insert on public.supports to authenticated;

-- Freio contra spam: no máximo 5 avisos pendentes por pessoa
create or replace function public.limitar_apoios_pendentes()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.supports where user_id = new.user_id and status = 'pendente') >= 5 then
    raise exception 'Você já tem avisos de apoio aguardando confirmação. Aguarde o admin conferir.';
  end if;
  return new;
end $$;

drop trigger if exists supports_limite on public.supports;
create trigger supports_limite before insert on public.supports
  for each row execute function public.limitar_apoios_pendentes();


-- ---------- Funções do admin ----------
-- p_dias: 30, 365 ou null (para sempre)
create or replace function public.confirmar_apoio(p_apoio bigint, p_dias integer default 30)
returns void language plpgsql security definer set search_path = public as $$
declare
  usuario uuid;
  base timestamptz;
begin
  if not public.is_admin() then raise exception 'Só o admin pode confirmar apoios.' using errcode = '42501'; end if;
  update public.supports set status = 'confirmado', resolved_at = now(), motivo = null
   where id = p_apoio and status = 'pendente'
  returning user_id into usuario;
  if usuario is null then raise exception 'Esse aviso não existe mais ou já foi resolvido.'; end if;

  if p_dias is null then
    update public.profiles set supporter_until = 'infinity' where id = usuario;
  else
    -- Soma os dias a partir do fim do selo atual, se ele ainda estiver valendo
    select greatest(coalesce(supporter_until, now()), now()) into base from public.profiles where id = usuario;
    update public.profiles
       set supporter_until = case when base = 'infinity' then base else base + make_interval(days => p_dias) end
     where id = usuario;
  end if;
end $$;

create or replace function public.recusar_apoio(p_apoio bigint, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Só o admin pode recusar apoios.' using errcode = '42501'; end if;
  update public.supports
     set status = 'recusado', resolved_at = now(), motivo = left(nullif(trim(p_motivo), ''), 300)
   where id = p_apoio and status = 'pendente';
end $$;

create or replace function public.apoios_pendentes()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_admin()
              then (select count(*)::int from public.supports where status = 'pendente') else 0 end;
$$;

-- Mural: apoiadores com selo valendo que aceitaram aparecer (sem valores)
create or replace function public.mural_apoiadores()
returns table (id uuid, nickname text, tag text, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.tag, p.display_name, p.avatar_url
    from public.profiles p
   where p.supporter_until > now() and p.supporter_public
   order by p.supporter_until desc
   limit 200;
$$;

grant execute on function public.confirmar_apoio(bigint, integer) to authenticated;
grant execute on function public.recusar_apoio(bigint, text) to authenticated;
grant execute on function public.apoios_pendentes() to authenticated;
grant execute on function public.mural_apoiadores() to anon, authenticated;
