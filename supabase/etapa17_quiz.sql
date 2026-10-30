-- ============================================================
-- AnimeSe — etapa 17: Quiz diário de anime
--
-- Segurança:
--   • As tabelas de perguntas e desafios só são lidas pelo admin (RLS).
--   • O usuário recebe UMA pergunta por vez, sem a resposta certa.
--   • Cada resposta é conferida e guardada no banco, sem volta.
--   • Pontos, acertos e tempo são calculados aqui, nunca pelo navegador.
--   • Uma tentativa por usuário por desafio (chave única).
--   • Ninguém grava direto nas tentativas: só as funções abaixo (auth.uid()).
--
-- Regras: 10 perguntas, 10 pontos cada, 10 minutos para terminar.
-- Empate no ranking: vence quem terminou mais rápido.
-- O dia do desafio segue o horário de Brasília.
--
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

-- ---------- Tabelas ----------
create table if not exists public.quiz_questions (
  id            bigint generated always as identity primary key,
  enunciado     text not null check (char_length(trim(enunciado)) between 5 and 400),
  alternativas  jsonb not null check (jsonb_typeof(alternativas) = 'array' and jsonb_array_length(alternativas) between 2 and 5),
  correta       smallint not null check (correta >= 0),
  explicacao    text check (char_length(explicacao) <= 500),
  dificuldade   text not null default 'media' check (dificuldade in ('facil', 'media', 'dificil')),
  anime         text check (char_length(anime) <= 120),
  imagem_url    text,
  ativa         boolean not null default true,
  vezes_usada   integer not null default 0,
  usada_em      date,
  criada_por    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint correta_existe check (correta < jsonb_array_length(alternativas))
);

create table if not exists public.quiz_challenges (
  id          bigint generated always as identity primary key,
  dia         date not null unique,
  titulo      text check (char_length(titulo) <= 120),
  criado_por  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.quiz_challenge_questions (
  challenge_id  bigint not null references public.quiz_challenges (id) on delete cascade,
  ordem         smallint not null check (ordem between 1 and 20),
  question_id   bigint not null references public.quiz_questions (id) on delete restrict,
  primary key (challenge_id, ordem),
  unique (challenge_id, question_id)
);

create table if not exists public.quiz_attempts (
  id              bigint generated always as identity primary key,
  challenge_id    bigint not null references public.quiz_challenges (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  acertos         integer not null default 0,
  pontos          integer not null default 0,
  tempo_segundos  integer,
  unique (challenge_id, user_id)
);
create index if not exists quiz_tentativas_ranking on public.quiz_attempts (challenge_id, pontos desc, tempo_segundos) where finished_at is not null;
create index if not exists quiz_tentativas_usuario on public.quiz_attempts (user_id, started_at desc);

create table if not exists public.quiz_answers (
  attempt_id    bigint not null references public.quiz_attempts (id) on delete cascade,
  ordem         smallint not null,
  question_id   bigint not null references public.quiz_questions (id) on delete cascade,
  escolha       smallint,            -- null = não respondeu (tempo esgotado)
  correta       boolean not null default false,
  respondida_em timestamptz not null default now(),
  primary key (attempt_id, ordem)
);

-- ---------- RLS ----------
alter table public.quiz_questions enable row level security;
alter table public.quiz_challenges enable row level security;
alter table public.quiz_challenge_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;

-- Perguntas e desafios: só o admin lê e edita (os usuários recebem pelas funções)
drop policy if exists "admin perguntas" on public.quiz_questions;
create policy "admin perguntas" on public.quiz_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin desafios" on public.quiz_challenges;
create policy "admin desafios" on public.quiz_challenges for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin perguntas do desafio" on public.quiz_challenge_questions;
create policy "admin perguntas do desafio" on public.quiz_challenge_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tentativas: cada um vê só as próprias, e ninguém grava direto
drop policy if exists "ver minhas tentativas" on public.quiz_attempts;
create policy "ver minhas tentativas" on public.quiz_attempts for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Respostas: sem política de leitura (o resultado sai pela função, depois de terminar)

revoke all on public.quiz_questions, public.quiz_challenges, public.quiz_challenge_questions, public.quiz_attempts, public.quiz_answers from anon;
grant select, insert, update, delete on public.quiz_questions, public.quiz_challenges, public.quiz_challenge_questions to authenticated;
grant select on public.quiz_attempts to authenticated;
revoke insert, update, delete on public.quiz_attempts, public.quiz_answers from authenticated;


-- ---------- Funções internas ----------
create or replace function public.quiz_hoje()
returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Garante o desafio do dia: se o admin não montou, sorteia 10 perguntas
-- (as nunca usadas primeiro, depois as usadas há mais tempo)
create or replace function public.quiz_garantir_desafio(p_dia date)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  desafio bigint;
begin
  select id into desafio from public.quiz_challenges where dia = p_dia;
  if desafio is not null then return desafio; end if;
  if (select count(*) from public.quiz_questions where ativa) < 10 then return null; end if;
  insert into public.quiz_challenges (dia, titulo) values (p_dia, 'Desafio do dia')
  on conflict (dia) do nothing returning id into desafio;
  if desafio is null then select id into desafio from public.quiz_challenges where dia = p_dia; return desafio; end if;
  insert into public.quiz_challenge_questions (challenge_id, ordem, question_id)
  select desafio, row_number() over (), id from (
    select id from public.quiz_questions where ativa
     order by usada_em nulls first, random() limit 10
  ) q;
  update public.quiz_questions set vezes_usada = vezes_usada + 1, usada_em = p_dia
   where id in (select question_id from public.quiz_challenge_questions where challenge_id = desafio);
  return desafio;
end $$;
revoke execute on function public.quiz_garantir_desafio(date) from public, anon, authenticated;

-- Fecha a tentativa: calcula tudo no banco
create or replace function public.quiz_fechar(p_tentativa bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
  limite timestamptz;
begin
  select * into t from public.quiz_attempts where id = p_tentativa for update;
  if t.finished_at is not null then return; end if;
  limite := t.started_at + interval '10 minutes';
  -- Perguntas que ficaram sem resposta contam como erro
  insert into public.quiz_answers (attempt_id, ordem, question_id, escolha, correta, respondida_em)
  select t.id, cq.ordem, cq.question_id, null, false, least(now(), limite)
    from public.quiz_challenge_questions cq
   where cq.challenge_id = t.challenge_id
     and not exists (select 1 from public.quiz_answers a where a.attempt_id = t.id and a.ordem = cq.ordem);
  update public.quiz_attempts
     set finished_at = least(now(), limite),
         acertos = (select count(*) from public.quiz_answers where attempt_id = t.id and correta),
         pontos = 10 * (select count(*) from public.quiz_answers where attempt_id = t.id and correta),
         tempo_segundos = greatest(1, extract(epoch from (least(now(), limite) - t.started_at))::int)
   where id = t.id;
end $$;
revoke execute on function public.quiz_fechar(bigint) from public, anon, authenticated;

-- Pergunta da vez (sem a resposta certa)
create or replace function public.quiz_pergunta_da_vez(p_tentativa bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t record; prox record; total integer; feitas integer;
begin
  select * into t from public.quiz_attempts where id = p_tentativa;
  select count(*) into total from public.quiz_challenge_questions where challenge_id = t.challenge_id;
  select count(*) into feitas from public.quiz_answers where attempt_id = t.id;
  select cq.ordem, q.enunciado, q.alternativas, q.imagem_url, q.anime, q.dificuldade into prox
    from public.quiz_challenge_questions cq join public.quiz_questions q on q.id = cq.question_id
   where cq.challenge_id = t.challenge_id and cq.ordem = feitas + 1;
  return jsonb_build_object(
    'tentativa', t.id, 'total', total, 'respondidas', feitas,
    'inicio', t.started_at, 'prazo', t.started_at + interval '10 minutes', 'agora', now(),
    'pergunta', case when prox.ordem is null then null else jsonb_build_object(
      'ordem', prox.ordem, 'enunciado', prox.enunciado, 'alternativas', prox.alternativas,
      'imagem', prox.imagem_url, 'anime', prox.anime, 'dificuldade', prox.dificuldade) end);
end $$;
revoke execute on function public.quiz_pergunta_da_vez(bigint) from public, anon, authenticated;


-- ---------- Funções para o site ----------

-- Situação do desafio de hoje para quem está vendo
create or replace function public.quiz_do_dia()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  desafio bigint; d record; t record; total integer; participantes integer;
begin
  desafio := public.quiz_garantir_desafio(public.quiz_hoje());
  if desafio is null then return jsonb_build_object('desafio', null); end if;
  select * into d from public.quiz_challenges where id = desafio;
  select count(*) into total from public.quiz_challenge_questions where challenge_id = desafio;
  select count(*) into participantes from public.quiz_attempts where challenge_id = desafio and finished_at is not null;
  -- (sem login, auth.uid() é nulo e nada é encontrado)
  select * into t from public.quiz_attempts where challenge_id = desafio and user_id = auth.uid();
  -- Tempo esgotado com a página fechada: fecha agora
  if t.id is not null and t.finished_at is null and now() > t.started_at + interval '10 minutes' then
    perform public.quiz_fechar(t.id);
    select * into t from public.quiz_attempts where id = t.id;
  end if;
  return jsonb_build_object(
    'desafio', jsonb_build_object('id', d.id, 'dia', d.dia, 'titulo', d.titulo, 'total', total, 'participantes', participantes),
    'tentativa', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'concluida', t.finished_at is not null, 'pontos', t.pontos, 'acertos', t.acertos) end);
end $$;
grant execute on function public.quiz_do_dia() to anon, authenticated;

-- Começa (ou continua) o desafio de hoje
create or replace function public.quiz_iniciar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  desafio bigint; t record;
begin
  if auth.uid() is null then raise exception 'Entre com sua conta para jogar.'; end if;
  desafio := public.quiz_garantir_desafio(public.quiz_hoje());
  if desafio is null then raise exception 'O desafio de hoje ainda não está pronto.'; end if;
  insert into public.quiz_attempts (challenge_id, user_id) values (desafio, auth.uid())
  on conflict (challenge_id, user_id) do nothing;
  select * into t from public.quiz_attempts where challenge_id = desafio and user_id = auth.uid();
  if t.finished_at is null and now() > t.started_at + interval '10 minutes' then perform public.quiz_fechar(t.id); end if;
  if (select finished_at from public.quiz_attempts where id = t.id) is not null then
    raise exception 'Você já fez o desafio de hoje. Volte amanhã!';
  end if;
  return public.quiz_pergunta_da_vez(t.id);
end $$;
grant execute on function public.quiz_iniciar() to authenticated;

-- Responde a pergunta da vez (não dá para voltar nem trocar)
create or replace function public.quiz_responder(p_tentativa bigint, p_ordem integer, p_escolha integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record; q record; feitas integer; total integer;
begin
  select * into t from public.quiz_attempts where id = p_tentativa and user_id = auth.uid() for update;
  if t.id is null then raise exception 'Tentativa não encontrada.'; end if;
  if t.finished_at is not null then raise exception 'Este desafio já foi concluído.'; end if;
  if now() > t.started_at + interval '10 minutes' then
    perform public.quiz_fechar(t.id);
    return jsonb_build_object('fim', true, 'tempo_esgotado', true);
  end if;
  select count(*) into feitas from public.quiz_answers where attempt_id = t.id;
  if p_ordem <> feitas + 1 then raise exception 'Responda as perguntas em ordem.'; end if;
  select cq.question_id, qq.correta, jsonb_array_length(qq.alternativas) as n into q
    from public.quiz_challenge_questions cq join public.quiz_questions qq on qq.id = cq.question_id
   where cq.challenge_id = t.challenge_id and cq.ordem = p_ordem;
  if q.question_id is null then raise exception 'Pergunta inválida.'; end if;
  if p_escolha is null or p_escolha < 0 or p_escolha >= q.n then raise exception 'Alternativa inválida.'; end if;
  insert into public.quiz_answers (attempt_id, ordem, question_id, escolha, correta)
  values (t.id, p_ordem, q.question_id, p_escolha, p_escolha = q.correta);

  select count(*) into total from public.quiz_challenge_questions where challenge_id = t.challenge_id;
  if p_ordem >= total then
    perform public.quiz_fechar(t.id);
    return jsonb_build_object('fim', true);
  end if;
  return public.quiz_pergunta_da_vez(t.id);
end $$;
grant execute on function public.quiz_responder(bigint, integer, integer) to authenticated;

-- Resultado (só depois de concluir): pontos, posição e o gabarito
create or replace function public.quiz_resultado(p_desafio bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  desafio bigint := coalesce(p_desafio, (select id from public.quiz_challenges where dia = public.quiz_hoje()));
  t record; pos integer; participantes integer;
begin
  select * into t from public.quiz_attempts where challenge_id = desafio and user_id = auth.uid();
  if t.id is null or t.finished_at is null then raise exception 'Conclua o desafio para ver o resultado.'; end if;
  select count(*) + 1 into pos from public.quiz_attempts
   where challenge_id = desafio and finished_at is not null
     and (pontos > t.pontos or (pontos = t.pontos and tempo_segundos < t.tempo_segundos));
  select count(*) into participantes from public.quiz_attempts where challenge_id = desafio and finished_at is not null;
  return jsonb_build_object(
    'dia', (select dia from public.quiz_challenges where id = desafio),
    'pontos', t.pontos, 'acertos', t.acertos,
    'total', (select count(*) from public.quiz_answers where attempt_id = t.id),
    'tempo', t.tempo_segundos, 'posicao', pos, 'participantes', participantes,
    'gabarito', (select jsonb_agg(jsonb_build_object(
        'ordem', a.ordem, 'enunciado', q.enunciado, 'alternativas', q.alternativas, 'anime', q.anime,
        'escolha', a.escolha, 'certa', q.correta, 'acertou', a.correta, 'explicacao', q.explicacao) order by a.ordem)
      from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id where a.attempt_id = t.id));
end $$;
grant execute on function public.quiz_resultado(bigint) to authenticated;

-- Ranking: 'diario' (hoje), 'semanal' (últimos 7 dias) ou 'geral'
create or replace function public.quiz_ranking(p_periodo text default 'diario')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  inicio date := case p_periodo when 'diario' then public.quiz_hoje() when 'semanal' then public.quiz_hoje() - 6 else date '2000-01-01' end;
  resultado jsonb;
begin
  with soma as (
    select a.user_id, sum(a.pontos)::int as pontos, sum(a.acertos)::int as acertos,
           count(*)::int as desafios, sum(a.tempo_segundos)::int as tempo
      from public.quiz_attempts a join public.quiz_challenges c on c.id = a.challenge_id
     where a.finished_at is not null and c.dia between inicio and public.quiz_hoje()
     group by a.user_id
  ), ordem as (
    select s.*, rank() over (order by s.pontos desc, s.tempo asc) as posicao from soma s
  )
  select jsonb_build_object(
    'lista', coalesce((select jsonb_agg(jsonb_build_object(
        'posicao', o.posicao, 'user_id', o.user_id, 'pontos', o.pontos, 'acertos', o.acertos,
        'desafios', o.desafios, 'tempo', o.tempo,
        'nickname', p.nickname, 'display_name', p.display_name, 'tag', p.tag, 'favorite_title', p.favorite_title,
        'avatar_url', p.avatar_url, 'supporter_until', p.supporter_until) order by o.posicao, o.tempo)
      from (select * from ordem order by posicao, tempo limit 50) o join public.profiles p on p.id = o.user_id), '[]'::jsonb),
    'eu', (select jsonb_build_object('posicao', posicao, 'pontos', pontos, 'acertos', acertos, 'desafios', desafios, 'tempo', tempo)
             from ordem where user_id = auth.uid()),
    'participantes', (select count(*) from soma))
  into resultado;
  return resultado;
end $$;
grant execute on function public.quiz_ranking(text) to anon, authenticated;

-- Histórico e estatísticas de quem está vendo
create or replace function public.quiz_historico()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  resultado jsonb;
begin
  with minhas as (
    select a.*, c.dia, (select count(*) from public.quiz_challenge_questions where challenge_id = a.challenge_id) as total,
           (select count(*) + 1 from public.quiz_attempts o where o.challenge_id = a.challenge_id and o.finished_at is not null
              and (o.pontos > a.pontos or (o.pontos = a.pontos and o.tempo_segundos < a.tempo_segundos))) as posicao,
           (select count(*) from public.quiz_attempts o where o.challenge_id = a.challenge_id and o.finished_at is not null) as participantes
      from public.quiz_attempts a join public.quiz_challenges c on c.id = a.challenge_id
     where a.user_id = auth.uid() and a.finished_at is not null
  ), dias as (
    select dia, dia - (row_number() over (order by dia))::int as grupo from minhas
  ), sequencias as (
    select grupo, count(*) as tamanho, max(dia) as ultimo from dias group by grupo
  )
  select jsonb_build_object(
    'lista', coalesce((select jsonb_agg(jsonb_build_object('desafio', challenge_id, 'dia', dia, 'pontos', pontos, 'acertos', acertos,
              'total', total, 'tempo', tempo_segundos, 'posicao', posicao, 'participantes', participantes) order by dia desc)
            from (select * from minhas order by dia desc limit 60) m), '[]'::jsonb),
    'desafios', (select count(*) from minhas),
    'pontos', coalesce((select sum(pontos) from minhas), 0),
    'aproveitamento', coalesce((select round(100.0 * sum(acertos) / nullif(sum(total), 0)) from minhas), 0),
    'melhor', coalesce((select max(pontos) from minhas), 0),
    'vitorias', (select count(*) from minhas where posicao = 1),
    'sequencia_atual', coalesce((select tamanho from sequencias where ultimo >= public.quiz_hoje() - 1 order by ultimo desc limit 1), 0),
    'maior_sequencia', coalesce((select max(tamanho) from sequencias), 0))
  into resultado;
  return resultado;
end $$;
grant execute on function public.quiz_historico() to authenticated;


-- ---------- Admin ----------
-- Monta (ou refaz) o desafio de um dia com as perguntas escolhidas, na ordem
create or replace function public.quiz_montar_desafio(p_dia date, p_perguntas bigint[], p_titulo text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  desafio bigint;
begin
  if not public.is_admin() then raise exception 'Só o admin pode montar desafios.'; end if;
  if coalesce(array_length(p_perguntas, 1), 0) < 3 or array_length(p_perguntas, 1) > 20 then
    raise exception 'Escolha de 3 a 20 perguntas.';
  end if;
  select id into desafio from public.quiz_challenges where dia = p_dia;
  if desafio is not null and exists (select 1 from public.quiz_attempts where challenge_id = desafio) then
    raise exception 'Alguém já jogou o desafio desse dia; ele não pode mais ser alterado.';
  end if;
  if desafio is null then
    insert into public.quiz_challenges (dia, titulo, criado_por) values (p_dia, nullif(trim(coalesce(p_titulo, '')), ''), auth.uid()) returning id into desafio;
  else
    update public.quiz_challenges set titulo = nullif(trim(coalesce(p_titulo, '')), '') where id = desafio;
    delete from public.quiz_challenge_questions where challenge_id = desafio;
  end if;
  insert into public.quiz_challenge_questions (challenge_id, ordem, question_id)
  select desafio, ord, pid from unnest(p_perguntas) with ordinality as u(pid, ord);
  update public.quiz_questions set vezes_usada = vezes_usada + 1, usada_em = greatest(coalesce(usada_em, p_dia), p_dia)
   where id = any(p_perguntas);
  return desafio;
end $$;
grant execute on function public.quiz_montar_desafio(date, bigint[], text) to authenticated;

-- Desafios (passados e futuros) com número de participantes, para o painel
create or replace function public.quiz_desafios_admin()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Só o admin.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'dia', c.dia, 'titulo', c.titulo,
      'perguntas', (select jsonb_agg(question_id order by ordem) from public.quiz_challenge_questions where challenge_id = c.id),
      'participantes', (select count(*) from public.quiz_attempts where challenge_id = c.id and finished_at is not null),
      'media', (select round(avg(pontos)) from public.quiz_attempts where challenge_id = c.id and finished_at is not null)) order by c.dia desc)
    from (select * from public.quiz_challenges where dia >= public.quiz_hoje() - 30 order by dia desc) c), '[]'::jsonb);
end $$;
grant execute on function public.quiz_desafios_admin() to authenticated;


-- ---------- Perguntas iniciais (só entram se o banco estiver vazio) ----------
insert into public.quiz_questions (enunciado, alternativas, correta, explicacao, dificuldade, anime, criada_por)
select v.enunciado, v.alternativas::jsonb, v.correta, v.explicacao, v.dificuldade, v.anime, null
from (values
  ('Qual é o nome da raposa de nove caudas selada dentro de Naruto Uzumaki?', '["Shukaku","Kurama","Matatabi","Gyuki"]', 1, 'A Kyuubi se chama Kurama e foi selada em Naruto no dia em que ele nasceu.', 'facil', 'Naruto'),
  ('Qual é o grande sonho de Monkey D. Luffy?', '["Encontrar o All Blue","Ser o maior espadachim do mundo","Tornar-se o Rei dos Piratas","Desenhar o mapa do mundo"]', 2, 'Luffy quer encontrar o One Piece e se tornar o Rei dos Piratas.', 'facil', 'One Piece'),
  ('Qual é o nome do shinigami que deixa o Death Note cair no mundo humano?', '["Rem","Ryuk","Sidoh","Gelus"]', 1, 'Ryuk deixa o caderno cair porque estava entediado no mundo dos shinigamis.', 'facil', 'Death Note'),
  ('Como se chama o irmão mais novo de Edward Elric?', '["Alphonse","Roy","Maes","Van"]', 0, 'Alphonse Elric teve a alma presa a uma armadura após a transmutação humana.', 'facil', 'Fullmetal Alchemist: Brotherhood'),
  ('Em qual distrito Eren Yeager morava quando o Titã Colossal apareceu?', '["Trost","Stohess","Shiganshina","Karanes"]', 2, 'O ataque à muralha Maria começa pelo distrito de Shiganshina, onde Eren vivia.', 'media', 'Attack on Titan'),
  ('Qual estúdio produziu o filme "A Viagem de Chihiro"?', '["Toei Animation","Studio Ghibli","Madhouse","Kyoto Animation"]', 1, 'O filme é do Studio Ghibli, dirigido por Hayao Miyazaki, e ganhou o Oscar de animação.', 'facil', 'A Viagem de Chihiro'),
  ('Qual é o nome saiyajin de Goku?', '["Kakarotto","Bardock","Raditz","Tarble"]', 0, 'Goku nasceu como Kakarotto, filho de Bardock.', 'facil', 'Dragon Ball'),
  ('Qual é o nome da irmã de Tanjiro que se transforma em oni?', '["Kanao","Nezuko","Shinobu","Mitsuri"]', 1, 'Nezuko Kamado vira oni, e Tanjiro entra para o Esquadrão de Caçadores para salvá-la.', 'facil', 'Demon Slayer'),
  ('Qual maldição passa a viver dentro do corpo de Yuji Itadori?', '["Mahito","Jogo","Ryomen Sukuna","Hanami"]', 2, 'Yuji come um dedo de Ryomen Sukuna e se torna o receptáculo do Rei das Maldições.', 'facil', 'Jujutsu Kaisen'),
  ('Qual é o nome de Kazuto Kirigaya dentro dos jogos?', '["Klein","Kirito","Eugeo","Heathcliff"]', 1, 'Kazuto usa o nome Kirito, o famoso Espadachim Negro.', 'facil', 'Sword Art Online'),
  ('Qual é o nome da individualidade que Izuku Midoriya herda de All Might?', '["All For One","One For All","Half-Cold Half-Hot","Explosion"]', 1, 'One For All é passada de usuário para usuário, acumulando força.', 'facil', 'My Hero Academia'),
  ('Quem é o melhor amigo de Gon Freecss?', '["Kurapika","Leorio","Killua","Hisoka"]', 2, 'Killua Zoldyck, herdeiro de uma família de assassinos, vira o melhor amigo de Gon.', 'facil', 'Hunter x Hunter'),
  ('Qual é o nome da nave onde vive a tripulação de Spike Spiegel?', '["Swordfish","Red Tail","Bebop","Hammerhead"]', 2, 'A nave Bebop dá nome ao anime. Swordfish II é a nave pessoal de Spike.', 'media', 'Cowboy Bebop'),
  ('Quem pilota a Unidade 01 do EVA na maior parte de Evangelion?', '["Rei Ayanami","Asuka Langley","Shinji Ikari","Kaworu Nagisa"]', 2, 'Shinji Ikari é o piloto da Unidade 01, a pedido do pai, Gendo.', 'facil', 'Neon Genesis Evangelion'),
  ('Qual é a habilidade secreta de Anya Forger?', '["Ver o futuro","Ler mentes","Ficar invisível","Falar com animais"]', 1, 'Anya é telepata, fruto de um experimento, e lê a mente das pessoas.', 'facil', 'Spy x Family'),
  ('Qual é a raça de Frieren?', '["Humana","Anã","Elfa","Demônio"]', 2, 'Frieren é uma elfa, por isso vive milhares de anos.', 'facil', 'Frieren e a Jornada para o Além'),
  ('Quem é o protagonista de Tokyo Ghoul?', '["Ken Kaneki","Touka Kirishima","Shuu Tsukiyama","Kotaro Amon"]', 0, 'Ken Kaneki vira meio-ghoul após receber órgãos de Rize.', 'facil', 'Tokyo Ghoul'),
  ('Em que posição Shoyo Hinata joga no Karasuno?', '["Levantador","Líbero","Central (bloqueador de meio)","Oposto"]', 2, 'Hinata é central e faz dupla famosa com o levantador Kageyama.', 'media', 'Haikyu!!'),
  ('Como Rintaro Okabe gosta de se chamar?', '["Hououin Kyouma","Kyouma Okarin","Lab Mem 001","Daru"]', 0, 'Okabe se apresenta como o cientista louco Hououin Kyouma.', 'media', 'Steins;Gate'),
  ('Qual é o nome da zanpakutō de Ichigo Kurosaki?', '["Senbonzakura","Zangetsu","Hyorinmaru","Zabimaru"]', 1, 'A espada de Ichigo se chama Zangetsu.', 'media', 'Bleach'),
  ('Qual é o nome do demônio-motosserra que se une a Denji?', '["Power","Pochita","Beam","Kobeni"]', 1, 'Pochita dá seu coração a Denji, que se torna o Homem-Motosserra.', 'facil', 'Chainsaw Man'),
  ('Quem dá o poder do Geass a Lelouch?', '["Suzaku","C.C.","Kallen","V.V."]', 1, 'C.C. faz um contrato com Lelouch e lhe concede o Geass.', 'media', 'Code Geass')
) as v(enunciado, alternativas, correta, explicacao, dificuldade, anime)
where not exists (select 1 from public.quiz_questions);
