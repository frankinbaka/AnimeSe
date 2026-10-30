// Quiz diário: desafio do dia, perguntas, resultado, rankings e histórico.
// Toda a conferência e a pontuação acontecem no banco (supabase/etapa17_quiz.sql).
import { montarLayout, esc, caixaErro, toast, entrar, formatarNumero, avatarHtml, nomeComTag, temSeloApoiador } from "../ui.js";
import { usuarioAtual, clienteSupabase } from "../store.js";

await montarLayout();

const db = clienteSupabase();
const alvo = document.getElementById("conteudo-quiz");
const abasEl = document.getElementById("abas-quiz");
const eu = await usuarioAtual();
const LETRAS = ["A", "B", "C", "D", "E"];
let relogio = null;

const rpc = async (nome, args = {}) => {
  const { data, error } = await db.rpc(nome, args);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) throw new Error("O quiz ainda não foi ativado no banco (falta rodar o SQL da etapa 17).");
    throw new Error(error.message);
  }
  return data;
};
const nomeDe = (p) => p?.nickname || p?.display_name?.split(" ")[0] || "Usuário";
const dataBR = (d) => { const t = new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1); };
const dataCurta = (d) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const duracao = (s) => (s == null ? "—" : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`);

abasEl.addEventListener("click", (e) => { const b = e.target.closest(".aba"); if (b) abrir(b.dataset.aba); });
function abrir(aba) {
  clearInterval(relogio);
  abasEl.querySelectorAll(".aba").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === aba)));
  history.replaceState(null, "", aba === "desafio" ? "quiz.html" : `quiz.html?aba=${aba}`);
  ({ desafio: mostrarDesafio, ranking: mostrarRanking, historico: mostrarHistorico }[aba] || mostrarDesafio)();
}
abrir(new URLSearchParams(location.search).get("aba") || "desafio");

// ------------------------------------------------------------
// Desafio do dia
// ------------------------------------------------------------
async function mostrarDesafio() {
  alvo.innerHTML = `<p class="secao-descricao">Carregando o desafio…</p>`;
  let info;
  try { info = await rpc("quiz_do_dia"); } catch (e) { alvo.innerHTML = caixaErro(e.message); return; }
  const d = info?.desafio;
  if (!d) {
    alvo.innerHTML = `<div class="vazio"><h2>O desafio de hoje ainda não está pronto</h2><p>Volte daqui a pouco!</p></div>`;
    return;
  }
  if (info.tentativa?.concluida) return mostrarResultado();

  const continuar = Boolean(info.tentativa);
  alvo.innerHTML = `
    <section class="quiz-capa">
      <div class="quiz-capa-icone" aria-hidden="true">?</div>
      <p class="quiz-data">${esc(dataBR(d.dia))}</p>
      <h2>${esc(d.titulo || "Desafio do dia")}</h2>
      <ul class="quiz-regras">
        <li><strong>${d.total}</strong> perguntas</li>
        <li><strong>10</strong> minutos</li>
        <li><strong>10</strong> pontos por acerto</li>
        <li><strong>1</strong> tentativa por dia</li>
      </ul>
      <p class="secao-descricao">As respostas não podem ser trocadas depois de confirmadas e o gabarito só aparece no fim.
        Em caso de empate, fica na frente quem terminou mais rápido.</p>
      ${eu ? `<button type="button" class="btn btn-primario btn-grande" id="btn-comecar">${continuar ? "Continuar desafio" : "Começar desafio"}</button>`
           : `<button type="button" class="btn btn-primario btn-grande" id="btn-entrar-quiz">Entrar com Google para jogar</button>`}
      <p class="quiz-participantes">${d.participantes ? `${formatarNumero(d.participantes)} ${d.participantes === 1 ? "pessoa já jogou" : "pessoas já jogaram"} hoje` : "Seja o primeiro a jogar hoje!"}</p>
    </section>`;
  alvo.querySelector("#btn-entrar-quiz")?.addEventListener("click", entrar);
  alvo.querySelector("#btn-comecar")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try { mostrarPergunta(await rpc("quiz_iniciar")); }
    catch (err) { toast(err.message); mostrarDesafio(); }
  });
}

function mostrarPergunta(estado) {
  clearInterval(relogio);
  const q = estado.pergunta;
  if (!q) return mostrarResultado();
  // Relógio pelo horário do servidor (o do computador pode estar errado)
  const diferenca = new Date(estado.agora).getTime() - Date.now();
  const prazo = new Date(estado.prazo).getTime();
  const restante = () => Math.max(0, Math.round((prazo - (Date.now() + diferenca)) / 1000));
  let escolha = null;

  alvo.innerHTML = `
    <section class="quiz-jogo">
      <div class="quiz-topo">
        <span>Pergunta <strong>${q.ordem}</strong> de ${estado.total}</span>
        <span class="quiz-relogio" id="quiz-relogio" aria-live="off">⏱ —</span>
      </div>
      <div class="quiz-progresso" role="progressbar" aria-valuemin="0" aria-valuemax="${estado.total}" aria-valuenow="${q.ordem - 1}">
        <span style="width:${((q.ordem - 1) / estado.total) * 100}%"></span>
      </div>
      ${q.anime ? `<p class="quiz-anime">${esc(q.anime)}</p>` : ""}
      ${q.imagem ? `<img class="quiz-imagem" src="${esc(q.imagem)}" alt="">` : ""}
      <h2 class="quiz-enunciado">${esc(q.enunciado)}</h2>
      <div class="quiz-alternativas" role="radiogroup" aria-label="Alternativas">
        ${q.alternativas.map((alt, i) => `
          <button type="button" class="quiz-alternativa" role="radio" aria-checked="false" data-i="${i}">
            <span class="quiz-letra">${LETRAS[i]}</span><span>${esc(alt)}</span>
          </button>`).join("")}
      </div>
      <button type="button" class="btn btn-primario btn-grande" id="btn-confirmar" disabled>${q.ordem === estado.total ? "Confirmar e finalizar" : "Confirmar resposta"}</button>
    </section>`;

  const relogioEl = alvo.querySelector("#quiz-relogio");
  const tick = async () => {
    const s = restante();
    relogioEl.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    relogioEl.classList.toggle("acabando", s <= 60);
    if (s <= 0) {
      clearInterval(relogio);
      toast("O tempo acabou!");
      await rpc("quiz_do_dia").catch(() => {}); // o banco fecha a tentativa
      mostrarResultado();
    }
  };
  tick();
  relogio = setInterval(tick, 1000);

  const botoes = alvo.querySelectorAll(".quiz-alternativa");
  const confirmar = alvo.querySelector("#btn-confirmar");
  botoes.forEach((b) => b.addEventListener("click", () => {
    escolha = Number(b.dataset.i);
    botoes.forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    confirmar.disabled = false;
  }));
  document.onkeydown = (e) => {
    if (!alvo.querySelector(".quiz-jogo")) { document.onkeydown = null; return; }
    const i = LETRAS.indexOf(e.key.toUpperCase());
    if (i >= 0 && botoes[i]) botoes[i].click();
    if (e.key === "Enter" && !confirmar.disabled) confirmar.click();
  };
  confirmar.addEventListener("click", async () => {
    if (escolha === null) return;
    confirmar.disabled = true;
    botoes.forEach((b) => (b.disabled = true));
    try {
      const r = await rpc("quiz_responder", { p_tentativa: estado.tentativa, p_ordem: q.ordem, p_escolha: escolha });
      if (r.fim) { clearInterval(relogio); document.onkeydown = null; if (r.tempo_esgotado) toast("O tempo acabou!"); mostrarResultado(); }
      else mostrarPergunta(r);
    } catch (err) {
      toast(err.message);
      // Recarrega o estado verdadeiro do banco
      try { mostrarPergunta(await rpc("quiz_iniciar")); } catch { mostrarDesafio(); }
    }
  });
}

async function mostrarResultado(desafio = null) {
  clearInterval(relogio);
  alvo.innerHTML = `<p class="secao-descricao">Calculando seu resultado…</p>`;
  let r;
  try { r = await rpc("quiz_resultado", { p_desafio: desafio }); } catch (e) { alvo.innerHTML = caixaErro(e.message); return; }
  const erros = r.total - r.acertos;
  const pct = r.total ? Math.round((r.acertos / r.total) * 100) : 0;
  const frase = pct === 100 ? "Gabaritou! Lenda dos animes! 🏆" : pct >= 70 ? "Mandou muito bem! 🔥" : pct >= 40 ? "Nada mal! Amanhã tem mais." : "Dia difícil… amanhã você se recupera! 💪";
  alvo.innerHTML = `
    <section class="quiz-resultado">
      ${desafio ? `<button type="button" class="btn btn-contorno btn-pequeno" id="voltar-historico">← Voltar ao histórico</button>` : ""}
      <p class="quiz-data">${esc(dataBR(r.dia))}</p>
      <div class="quiz-placar"><strong>${r.pontos}</strong><span>pontos</span></div>
      <p class="quiz-frase">${frase}</p>
      <ul class="quiz-numeros">
        <li><strong class="ok">${r.acertos}</strong><span>acertos</span></li>
        <li><strong class="erro">${erros}</strong><span>erros</span></li>
        <li><strong>${pct}%</strong><span>aproveitamento</span></li>
        <li><strong>${duracao(r.tempo)}</strong><span>tempo</span></li>
        <li><strong>${r.posicao}º</strong><span>de ${formatarNumero(r.participantes)} no dia</span></li>
      </ul>
      ${desafio ? "" : `<div class="form-acoes" style="justify-content:center"><button type="button" class="btn btn-primario" data-ir="ranking">Ver ranking</button>
        <button type="button" class="btn btn-contorno" id="compartilhar-quiz">Compartilhar resultado</button></div>
        <p class="secao-descricao" style="text-align:center;margin-top:12px">Um novo desafio aparece amanhã, à meia-noite (horário de Brasília).</p>`}
      <h2 class="titulo-bloco">Gabarito</h2>
      <ol class="quiz-gabarito">
        ${(r.gabarito || []).map((g) => `
          <li class="${g.acertou ? "acertou" : "errou"}">
            <p class="quiz-gabarito-pergunta"><span aria-hidden="true">${g.acertou ? "✅" : "❌"}</span> ${esc(g.enunciado)}${g.anime ? ` <small>(${esc(g.anime)})</small>` : ""}</p>
            <p>Resposta certa: <strong>${esc(g.alternativas[g.certa])}</strong>
              ${!g.acertou ? `<br>Sua resposta: ${g.escolha === null ? "<em>não respondeu</em>" : esc(g.alternativas[g.escolha])}` : ""}</p>
            ${g.explicacao ? `<p class="dica">${esc(g.explicacao)}</p>` : ""}
          </li>`).join("")}
      </ol>
    </section>`;
  alvo.querySelector("[data-ir]")?.addEventListener("click", () => abrir("ranking"));
  alvo.querySelector("#voltar-historico")?.addEventListener("click", () => abrir("historico"));
  alvo.querySelector("#compartilhar-quiz")?.addEventListener("click", async () => {
    const quadrinhos = (r.gabarito || []).map((g) => (g.acertou ? "🟩" : "🟥")).join("");
    const texto = `Quiz diário AnimeSe (${dataCurta(r.dia)})\n${quadrinhos}\n${r.acertos}/${r.total} acertos, ${r.pontos} pontos, ${r.posicao}º lugar\n${location.origin}/quiz.html`;
    try {
      if (navigator.share) await navigator.share({ text: texto });
      else { await navigator.clipboard.writeText(texto); toast("Resultado copiado! Cole onde quiser."); }
    } catch {}
  });
}

// ------------------------------------------------------------
// Rankings
// ------------------------------------------------------------
async function mostrarRanking(periodo = "diario") {
  const nomes = { diario: "Hoje", semanal: "Semana", geral: "Geral" };
  alvo.innerHTML = `
    <div class="quiz-periodos" role="tablist">
      ${Object.entries(nomes).map(([id, n]) => `<button type="button" class="chip" data-periodo="${id}" aria-pressed="${id === periodo}">${n}</button>`).join("")}
    </div>
    <div id="lista-ranking"><p class="secao-descricao">Carregando…</p></div>`;
  alvo.querySelectorAll("[data-periodo]").forEach((b) => b.addEventListener("click", () => mostrarRanking(b.dataset.periodo)));
  const caixa = alvo.querySelector("#lista-ranking");
  let r;
  try { r = await rpc("quiz_ranking", { p_periodo: periodo }); } catch (e) { caixa.innerHTML = caixaErro(e.message); return; }
  if (!r.lista.length) {
    caixa.innerHTML = `<p class="vazio">${periodo === "diario" ? "Ninguém terminou o desafio de hoje ainda." : "Ainda não há resultados neste período."}</p>`;
    return;
  }
  const medalha = (p) => ({ 1: "🥇", 2: "🥈", 3: "🥉" }[p] || `${p}º`);
  const euNaLista = r.lista.some((x) => x.user_id === eu?.id);
  caixa.innerHTML = `
    ${r.eu && !euNaLista ? `<p class="quiz-minha-posicao">Sua posição: <strong>${r.eu.posicao}º</strong> com ${r.eu.pontos} pontos</p>` : ""}
    <ol class="quiz-ranking">
      ${r.lista.map((x) => `
        <li class="${x.user_id === eu?.id ? "sou-eu" : ""} ${x.posicao <= 3 ? "podio" : ""}">
          <span class="quiz-pos">${medalha(x.posicao)}</span>
          <a href="usuario.html?id=${x.user_id}" class="quiz-jogador">
            ${avatarHtml(x.avatar_url, nomeDe(x), temSeloApoiador(x.supporter_until))}
            <span>${nomeComTag(nomeDe(x), x.tag, x.favorite_title)}
              <small>${x.acertos} acertos${periodo !== "diario" ? ` · ${x.desafios} ${x.desafios === 1 ? "desafio" : "desafios"}` : ""} · ${duracao(x.tempo)}</small></span>
          </a>
          <strong class="quiz-pontos">${formatarNumero(x.pontos)}<small>pts</small></strong>
        </li>`).join("")}
    </ol>
    <p class="dica" style="text-align:center">${formatarNumero(r.participantes)} ${r.participantes === 1 ? "participante" : "participantes"}. Empates: vence quem terminou mais rápido.</p>`;
}

// ------------------------------------------------------------
// Histórico
// ------------------------------------------------------------
async function mostrarHistorico() {
  if (!eu) {
    alvo.innerHTML = `<div class="vazio"><h2>Entre para ver seu histórico</h2><button class="btn btn-primario" id="entrar-hist">Entrar com Google</button></div>`;
    alvo.querySelector("#entrar-hist").addEventListener("click", entrar);
    return;
  }
  alvo.innerHTML = `<p class="secao-descricao">Carregando…</p>`;
  let h;
  try { h = await rpc("quiz_historico"); } catch (e) { alvo.innerHTML = caixaErro(e.message); return; }
  if (!h.desafios) {
    alvo.innerHTML = `<div class="vazio"><h2>Você ainda não jogou</h2><p>Faça o desafio de hoje para começar seu histórico.</p>
      <button class="btn btn-primario" id="ir-desafio">Jogar agora</button></div>`;
    alvo.querySelector("#ir-desafio").addEventListener("click", () => abrir("desafio"));
    return;
  }
  alvo.innerHTML = `
    <section class="tiles quiz-tiles">
      <div class="tile"><span class="tile-rotulo">Desafios feitos</span><strong class="tile-valor">${h.desafios}</strong></div>
      <div class="tile"><span class="tile-rotulo">Pontos no total</span><strong class="tile-valor">${formatarNumero(h.pontos)}</strong></div>
      <div class="tile"><span class="tile-rotulo">Aproveitamento</span><strong class="tile-valor">${h.aproveitamento}%</strong></div>
      <div class="tile"><span class="tile-rotulo">Melhor pontuação</span><strong class="tile-valor">${h.melhor}</strong></div>
      <div class="tile"><span class="tile-rotulo">1º lugar no dia</span><strong class="tile-valor">${h.vitorias}×</strong></div>
      <div class="tile"><span class="tile-rotulo">Sequência</span><strong class="tile-valor">${h.sequencia_atual} 🔥</strong><span class="tile-detalhe">recorde: ${h.maior_sequencia} ${h.maior_sequencia === 1 ? "dia" : "dias"}</span></div>
    </section>
    <h2 class="titulo-bloco">Resultados anteriores</h2>
    <ul class="quiz-historico">
      ${h.lista.map((x) => `
        <li>
          <button type="button" data-desafio="${x.desafio}">
            <span class="quiz-hist-data">${esc(dataCurta(x.dia))}</span>
            <span class="quiz-hist-barra"><span style="width:${x.total ? (x.acertos / x.total) * 100 : 0}%"></span></span>
            <span><strong>${x.pontos}</strong> pts · ${x.acertos}/${x.total}</span>
            <span class="quiz-hist-pos">${x.posicao}º de ${x.participantes}</span>
            <span class="dica">${duracao(x.tempo)}</span>
          </button>
        </li>`).join("")}
    </ul>`;
  alvo.querySelectorAll("[data-desafio]").forEach((b) => b.addEventListener("click", () => mostrarResultado(Number(b.dataset.desafio))));
}
