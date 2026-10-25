-- ============================================================
-- AnimeSe — etapa 10: agrupar a lista por franquia
--
-- Guarda em cada item da lista o anime "raiz" da franquia
-- (o primeiro lançado). Assim temporadas, filmes e OVAs do mesmo
-- anime aparecem juntos num card só.
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

alter table public.anime_list add column if not exists franchise_id integer;
create index if not exists anime_list_franquia on public.anime_list (user_id, franchise_id);
