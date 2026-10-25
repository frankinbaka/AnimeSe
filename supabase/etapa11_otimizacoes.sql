-- ============================================================
-- AnimeSe — etapa 11: otimizações
--   1. Chat: mensagens com mais de 30 dias são apagadas sozinhas
--   2. Sinopses traduzidas guardadas para sempre (cada uma é
--      traduzida uma única vez; o admin poderá corrigir depois)
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

-- ---------- 1. Limpeza automática do chat ----------
-- Aproveita o próprio envio de mensagens: de vez em quando (1 em cada
-- 20 envios) apaga as mensagens antigas. Sem tarefa agendada.
create or replace function public.limitar_chat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.chat_messages where user_id = new.user_id and created_at > now() - interval '2 seconds') then
    raise exception 'Calma! Espere um instante antes de mandar outra mensagem.';
  end if;
  if (select count(*) from public.chat_messages where user_id = new.user_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Muitas mensagens seguidas. Espere um minuto.';
  end if;
  new.body := trim(new.body);
  if random() < 0.05 then
    delete from public.chat_messages where created_at < now() - interval '30 days';
  end if;
  return new;
end $$;

-- Limpa agora o que já passou dos 30 dias
delete from public.chat_messages where created_at < now() - interval '30 days';


-- ---------- 2. Sinopses em português ----------
create table if not exists public.synopses_pt (
  mal_id       integer primary key,
  texto        text not null,
  tradutor     text,                       -- deepl | google | admin
  revisado     boolean not null default false,
  revisado_por uuid references public.profiles (id) on delete set null,
  atualizado   timestamptz not null default now()
);

alter table public.synopses_pt enable row level security;

drop policy if exists "sinopses visiveis" on public.synopses_pt;
create policy "sinopses visiveis" on public.synopses_pt for select using (true);

-- Só o admin corrige (a função da Vercel grava com a chave de serviço)
drop policy if exists "admin corrige sinopse" on public.synopses_pt;
create policy "admin corrige sinopse" on public.synopses_pt for update using (public.is_admin()) with check (public.is_admin());

grant select on public.synopses_pt to anon, authenticated;
grant update on public.synopses_pt to authenticated;
