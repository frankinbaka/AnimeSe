-- ============================================================
-- AnimeSe — etapa 18: quiz com 20 segundos por pergunta
--                     e perguntas importadas do Open Trivia DB
--
-- Cada pergunta tem 20 segundos (mais 3 de tolerância para a internet).
-- O relógio é o do banco: passou do prazo, a pergunta conta como erro,
-- mesmo que alguém tente responder depois pelo console.
-- Se a pessoa fechar a página, o tempo continua correndo.
--
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

alter table public.quiz_attempts add column if not exists pergunta_ordem smallint;
alter table public.quiz_attempts add column if not exists pergunta_desde timestamptz;

-- Origem das perguntas importadas (evita importar a mesma duas vezes)
alter table public.quiz_questions add column if not exists origem text;
alter table public.quiz_questions add column if not exists origem_ref text;
alter table public.quiz_questions add column if not exists original jsonb;  -- texto em inglês, para revisar a tradução
drop index if exists public.quiz_perguntas_origem;
create unique index if not exists quiz_perguntas_origem_ref on public.quiz_questions (origem_ref);
-- Textos traduzidos podem passar um pouco do limite antigo
alter table public.quiz_questions drop constraint if exists quiz_questions_enunciado_check;
alter table public.quiz_questions add constraint quiz_questions_enunciado_check check (char_length(trim(enunciado)) between 5 and 600);

/**
 * Acerta o relógio da tentativa: marca como erro as perguntas cujo prazo
 * passou e liga o relógio da pergunta da vez. Fecha a tentativa se acabou.
 */
create or replace function public.quiz_sincronizar(p_tentativa bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record; total integer; feitas integer;
  prazo constant interval := interval '20 seconds';
  tolerancia constant interval := interval '3 seconds';
begin
  loop
    select * into t from public.quiz_attempts where id = p_tentativa for update;
    if t.id is null or t.finished_at is not null then return; end if;
    select count(*) into total from public.quiz_challenge_questions where challenge_id = t.challenge_id;
    select count(*) into feitas from public.quiz_answers where attempt_id = t.id;
    if feitas >= total then perform public.quiz_fechar(t.id); return; end if;

    if t.pergunta_ordem is distinct from feitas + 1 or t.pergunta_desde is null then
      update public.quiz_attempts set pergunta_ordem = feitas + 1, pergunta_desde = now() where id = t.id;
      return;
    end if;

    if now() > t.pergunta_desde + prazo + tolerancia then
      -- Tempo esgotado: erro, e a próxima pergunta começa quando esta venceu
      insert into public.quiz_answers (attempt_id, ordem, question_id, escolha, correta, respondida_em)
      select t.id, cq.ordem, cq.question_id, null, false, t.pergunta_desde + prazo
        from public.quiz_challenge_questions cq where cq.challenge_id = t.challenge_id and cq.ordem = feitas + 1
      on conflict do nothing;
      if feitas + 1 >= total then perform public.quiz_fechar(t.id); return; end if;
      update public.quiz_attempts set pergunta_ordem = feitas + 2, pergunta_desde = t.pergunta_desde + prazo where id = t.id;
      -- volta ao início do laço para conferir a próxima
    else
      return;
    end if;
  end loop;
end $$;
revoke execute on function public.quiz_sincronizar(bigint) from public, anon, authenticated;

-- Pergunta da vez com o prazo dela (sem a resposta certa)
create or replace function public.quiz_pergunta_da_vez(p_tentativa bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  t record; prox record; total integer; feitas integer;
begin
  perform public.quiz_sincronizar(p_tentativa);
  select * into t from public.quiz_attempts where id = p_tentativa;
  if t.finished_at is not null then return jsonb_build_object('fim', true, 'tempo_esgotado', true); end if;
  select count(*) into total from public.quiz_challenge_questions where challenge_id = t.challenge_id;
  select count(*) into feitas from public.quiz_answers where attempt_id = t.id;
  select cq.ordem, q.enunciado, q.alternativas, q.imagem_url, q.anime, q.dificuldade into prox
    from public.quiz_challenge_questions cq join public.quiz_questions q on q.id = cq.question_id
   where cq.challenge_id = t.challenge_id and cq.ordem = feitas + 1;
  return jsonb_build_object(
    'tentativa', t.id, 'total', total, 'respondidas', feitas, 'segundos', 20,
    'prazo', t.pergunta_desde + interval '20 seconds', 'agora', now(),
    'pergunta', case when prox.ordem is null then null else jsonb_build_object(
      'ordem', prox.ordem, 'enunciado', prox.enunciado, 'alternativas', prox.alternativas,
      'imagem', prox.imagem_url, 'anime', prox.anime, 'dificuldade', prox.dificuldade) end);
end $$;
revoke execute on function public.quiz_pergunta_da_vez(bigint) from public, anon, authenticated;

create or replace function public.quiz_do_dia()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  desafio bigint; d record; t record; total integer; participantes integer;
begin
  desafio := public.quiz_garantir_desafio(public.quiz_hoje());
  if desafio is null then return jsonb_build_object('desafio', null); end if;
  select * into d from public.quiz_challenges where id = desafio;
  select count(*) into total from public.quiz_challenge_questions where challenge_id = desafio;
  select * into t from public.quiz_attempts where challenge_id = desafio and user_id = auth.uid();
  if t.id is not null and t.finished_at is null then
    perform public.quiz_sincronizar(t.id);
    select * into t from public.quiz_attempts where id = t.id;
  end if;
  select count(*) into participantes from public.quiz_attempts where challenge_id = desafio and finished_at is not null;
  return jsonb_build_object(
    'desafio', jsonb_build_object('id', d.id, 'dia', d.dia, 'titulo', d.titulo, 'total', total, 'participantes', participantes, 'segundos', 20),
    'tentativa', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'concluida', t.finished_at is not null, 'pontos', t.pontos, 'acertos', t.acertos) end);
end $$;
grant execute on function public.quiz_do_dia() to anon, authenticated;

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
  perform public.quiz_sincronizar(t.id);
  if (select finished_at from public.quiz_attempts where id = t.id) is not null then
    raise exception 'Você já fez o desafio de hoje. Volte amanhã!';
  end if;
  return public.quiz_pergunta_da_vez(t.id);
end $$;
grant execute on function public.quiz_iniciar() to authenticated;

-- p_escolha nulo = deixou o tempo acabar
create or replace function public.quiz_responder(p_tentativa bigint, p_ordem integer, p_escolha integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record; q record; feitas integer; total integer; atrasada boolean;
begin
  select * into t from public.quiz_attempts where id = p_tentativa and user_id = auth.uid();
  if t.id is null then raise exception 'Tentativa não encontrada.'; end if;
  if t.finished_at is not null then raise exception 'Este desafio já foi concluído.'; end if;

  -- Antes de tudo, aplica os prazos vencidos
  perform public.quiz_sincronizar(t.id);
  select * into t from public.quiz_attempts where id = t.id for update;
  if t.finished_at is not null then return jsonb_build_object('fim', true, 'tempo_esgotado', true); end if;
  select count(*) into feitas from public.quiz_answers where attempt_id = t.id;
  if p_ordem <= feitas then
    -- Essa pergunta já venceu: segue para a próxima
    return public.quiz_pergunta_da_vez(t.id) || jsonb_build_object('expirou', true);
  end if;
  if p_ordem <> feitas + 1 then raise exception 'Responda as perguntas em ordem.'; end if;

  select cq.question_id, qq.correta, jsonb_array_length(qq.alternativas) as n into q
    from public.quiz_challenge_questions cq join public.quiz_questions qq on qq.id = cq.question_id
   where cq.challenge_id = t.challenge_id and cq.ordem = p_ordem;
  if q.question_id is null then raise exception 'Pergunta inválida.'; end if;
  if p_escolha is not null and (p_escolha < 0 or p_escolha >= q.n) then raise exception 'Alternativa inválida.'; end if;

  atrasada := now() > t.pergunta_desde + interval '23 seconds';
  insert into public.quiz_answers (attempt_id, ordem, question_id, escolha, correta)
  values (t.id, p_ordem, q.question_id, case when atrasada then null else p_escolha end,
          not atrasada and p_escolha is not null and p_escolha = q.correta);

  select count(*) into total from public.quiz_challenge_questions where challenge_id = t.challenge_id;
  if p_ordem >= total then
    perform public.quiz_fechar(t.id);
    return jsonb_build_object('fim', true);
  end if;
  return public.quiz_pergunta_da_vez(t.id);
end $$;
grant execute on function public.quiz_responder(bigint, integer, integer) to authenticated;
