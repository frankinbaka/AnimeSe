// Página de um anime: dados do MAL, status na lista, avaliações
// da comunidade (nota 1–10 + comentário, respostas e likes) e
// sugestões de quem recomenda o anime.
import { montarLayout, caixaErro, esc, formatarNota, formatarNumero, toast, entrar, nomeComTag, avatarHtml, temSeloApoiador, seloApoiador } from "../ui.js";
import { detalhes, traduzirStatus, nomeTemporada, sinopseEmPortugues, temporadasDoAnime } from "../mal.js";
import { usuarioAtual, lerPerfil, statusNaLista, definirStatus, removerDaLista, STATUS, nomeStatus } from "../store.js";
import { linkPerfil } from "../perfis.js";
import { amigosNoAnime } from "../social.js";
import {
  COMUNIDADE_ATIVA, NOTAS, nomeAutor, tempoAtras, estatisticas, avaliacoesDoAnime, salvarAvaliacao,
  excluirAvaliacao, meusLikes, curtir, descurtir, responder, excluirResposta,
  sugestoesDoAnime, sugerir, removerSugestao,
} from "../comunidade.js";

await montarLayout();

const alvo = document.getElementById("conteudo-anime");
const id = new URLSearchParams(location.search).get("id");
const usuario = await usuarioAtual();
// O admin pode apagar avaliações e respostas de qualquer pessoa (moderação)
const souAdmin = usuario ? (await lerPerfil().catch(() => null))?.papel === "admin" : false;

if (!id || !/^\d+$/.test(id)) {
  alvo.innerHTML = `<div class="vazio"><h2>Anime não informado</h2><p><a href="buscar.html">Buscar um anime</a></p></div>`;
} else {
  try {
    const anime = await detalhes(id);
    document.title = `${anime.titulo} — AnimeSe`;
    alvo.innerHTML = montarPagina(anime);
    carregarSinopse(anime);
    carregarTemporadas(anime);
    if (COMUNIDADE_ATIVA && usuario) mostrarAmigos(anime);
    await montarPainelLista(anime);
    if (COMUNIDADE_ATIVA) montarAvaliacoes(anime); // carrega também as sugestões
  } catch (e) {
    alvo.innerHTML = `<div style="margin-top:32px">${caixaErro(e.message)}</div>`;
  }
}

// ------------------------------------------------------------
// Estrutura da página
// ------------------------------------------------------------
function montarPagina(a) {
  const numeros = [
    ["Nota no MAL", formatarNota(a.nota)],
    ["Nota AnimeSe", "…", "nota-animese"],
    ["Ranking", a.ranking ? `#${formatarNumero(a.ranking)}` : "—"],
    ["Episódios", a.episodios ?? "?"],
    ["Situação", traduzirStatus(a.status)],
    ["Estreia", nomeTemporada(a.temporada, a.ano) || "—"],
  ];
  return `
    <div class="anime-topo">
      <div class="anime-coluna-esquerda">
        <img class="poster-grande" src="${esc(a.imagem)}" alt="Pôster de ${esc(a.titulo)}">
        <aside class="temporadas" id="temporadas" aria-labelledby="titulo-temporadas" hidden></aside>
      </div>
      <div>
        <h1>${esc(a.titulo)}</h1>
        ${a.tituloOriginal !== a.titulo || a.tituloJapones
          ? `<p class="anime-titulo-alt">${esc([a.tituloOriginal !== a.titulo ? a.tituloOriginal : null, a.tituloJapones].filter(Boolean).join(" / "))}</p>`
          : ""}
        <ul class="anime-numeros">
          ${numeros.map(([r, v, idEl]) => `<li><span>${r}</span><strong ${idEl ? `id="${idEl}"` : ""}>${esc(v)}</strong></li>`).join("")}
        </ul>
        ${a.generos.length ? `<div class="generos">${a.generos.map((g) => `<span class="genero">${esc(g)}</span>`).join("")}</div>` : ""}
        <div class="painel-lista" id="painel-lista"></div>
        <div id="amigos-anime"></div>
        <h2>Sinopse</h2>
        <p class="sinopse" id="sinopse" aria-busy="true">Carregando sinopse em português…</p>
        <p class="anime-titulo-alt">
          ${[a.tipo, a.duracao, a.estudios.join(", ")].filter(Boolean).map(esc).join(", ")}
          ${a.exibicao ? `<br>Exibição: ${esc(a.exibicao)}` : ""}
        </p>
        <p><a href="${esc(a.urlMal)}" target="_blank" rel="noopener">Ver no MyAnimeList</a></p>
      </div>
    </div>
    ${COMUNIDADE_ATIVA ? `
      <section class="secao" id="secao-sugestoes" aria-labelledby="titulo-sugestoes"></section>
      <section class="secao" id="secao-avaliacoes" aria-labelledby="titulo-avaliacoes">
        <h2 id="titulo-avaliacoes">Avaliações da comunidade</h2>
        <p class="secao-descricao">Carregando…</p>
      </section>` : ""}`;
}

async function carregarSinopse(anime) {
  const el = document.getElementById("sinopse");
  try {
    const pt = await sinopseEmPortugues(anime.id);
    el.textContent = pt || "Este anime ainda não tem sinopse no MyAnimeList.";
  } catch {
    el.textContent = anime.sinopse
      ? `${anime.sinopse}\n\n(Não foi possível traduzir a sinopse agora. Tente recarregar a página mais tarde.)`
      : "Este anime ainda não tem sinopse no MyAnimeList.";
  } finally {
    el.removeAttribute("aria-busy");
  }
}

// ------------------------------------------------------------
// Outras temporadas da mesma franquia
// ------------------------------------------------------------
async function carregarTemporadas(anime) {
  const caixa = document.getElementById("temporadas");
  let lista;
  try {
    lista = await temporadasDoAnime(anime.id);
  } catch {
    return; // sem a lista, a página continua normal
  }
  if (lista.length < 2) return; // anime sem continuações, filmes ou OVAs

  // Separa por formato, mantendo a ordem de estreia dentro de cada grupo
  const grupos = [
    { titulo: "Temporadas", itens: lista.filter((t) => ["Série", "ONA"].includes(t.tipo)) },
    { titulo: "Filmes", itens: lista.filter((t) => t.tipo === "Filme") },
    { titulo: "OVAs e especiais", itens: lista.filter((t) => !["Série", "ONA", "Filme"].includes(t.tipo)) },
  ].filter((g) => g.itens.length);

  const item = (t, ordem) => {
    const atual = t.id === anime.id;
    const detalhes = [t.tipo, t.episodios ? `${t.episodios} ep.` : null, t.ano || (t.emBreve ? "Em breve" : null)].filter(Boolean).join(", ");
    return `
      <li>
        <a href="anime.html?id=${t.id}" ${atual ? 'aria-current="page"' : ""}>
          <span class="ordem" aria-hidden="true">${ordem}</span>
          ${t.imagem ? `<img src="${esc(t.imagem)}" alt="" loading="lazy">` : `<span class="sem-capa"></span>`}
          <span class="info">
            <strong>${esc(t.titulo)}</strong>
            <span>${esc(detalhes)}</span>
            ${atual ? `<span class="voce-esta-aqui">Você está aqui</span>` : ""}
          </span>
        </a>
      </li>`;
  };

  caixa.innerHTML = `
    <h2 id="titulo-temporadas">Franquia</h2>
    <p class="secao-descricao">${lista.length} títulos, em ordem de estreia.</p>
    <div class="grupos-temporadas">
      ${grupos.map((g) => `
        <section>
          <h3>${g.titulo} <span class="contador">${g.itens.length}</span></h3>
          <ol class="lista-temporadas">${g.itens.map((t, i) => item(t, i + 1)).join("")}</ol>
        </section>`).join("")}
    </div>`;
  caixa.hidden = false;
}

// ------------------------------------------------------------
// Quem você segue já assistiu ou avaliou este anime
// ------------------------------------------------------------
async function mostrarAmigos(anime) {
  const caixa = document.getElementById("amigos-anime");
  const dados = await amigosNoAnime(anime.id).catch(() => null);
  if (!dados || (!dados.assistiram.length && !dados.avaliaram.length)) return;

  const nomeDe = (p) => p.nickname || p.display_name?.split(" ")[0] || "Usuário";
  const pessoa = (p, extra = "") => `
    <a class="amigo" href="usuario.html?id=${p.id}" title="${esc(nomeDe(p))}">
      ${avatarHtml(p.avatar_url, nomeDe(p), temSeloApoiador(p.supporter_until))}
      <span>${esc(nomeDe(p))}${extra}</span>
    </a>`;

  // Quem avaliou já aparece com a nota; não repete em "já assistiram"
  const avaliaramIds = new Set(dados.avaliaram.map((a) => a.perfil.id));
  const soAssistiram = dados.assistiram.filter((p) => !avaliaramIds.has(p.id));

  caixa.innerHTML = `
    <section class="amigos-anime" aria-label="Pessoas que você segue">
      ${dados.avaliaram.length ? `
        <div class="amigos-grupo">
          <h2>Quem você segue avaliou</h2>
          <div class="amigos-lista">${dados.avaliaram.map((a) => pessoa(a.perfil, ` <strong class="nota-amigo">★ ${a.nota}</strong>`)).join("")}</div>
        </div>` : ""}
      ${soAssistiram.length ? `
        <div class="amigos-grupo">
          <h2>Quem você segue já assistiu</h2>
          <div class="amigos-lista">${soAssistiram.map((p) => pessoa(p)).join("")}</div>
        </div>` : ""}
    </section>`;
}

// ------------------------------------------------------------
// Status na minha lista
// ------------------------------------------------------------
async function montarPainelLista(anime) {
  const painel = document.getElementById("painel-lista");

  if (!usuario) {
    painel.innerHTML = `
      <h2>Adicionar à minha lista</h2>
      <p>Entre com sua conta Google para marcar, avaliar e sugerir este anime.</p>
      <button class="btn btn-primario" id="btn-entrar-lista">Entrar com Google</button>`;
    painel.querySelector("#btn-entrar-lista").addEventListener("click", entrar);
    return;
  }

  let atual = await statusNaLista(anime.id).catch(() => null);

  const render = () => {
    painel.innerHTML = `
      <h2>${atual ? `Na sua lista: ${nomeStatus(atual)}` : "Adicionar à minha lista"}</h2>
      <div class="opcoes-status" role="group" aria-label="Status do anime">
        ${STATUS.map((s) => `<button class="opcao-status st-btn-${s.id}" data-status="${s.id}" aria-pressed="${atual === s.id}">${s.nome}</button>`).join("")}
      </div>
      ${atual ? `<button class="link-remover" id="btn-remover">Remover da lista</button>` : ""}`;

    painel.querySelectorAll(".opcao-status").forEach((b) =>
      b.addEventListener("click", async () => {
        const novo = b.dataset.status;
        if (novo === atual) return;
        try {
          await definirStatus(anime, novo);
          atual = novo;
          render();
          toast(`Marcado como "${nomeStatus(novo)}"`);
        } catch (e) { toast(e.message); }
      })
    );
    painel.querySelector("#btn-remover")?.addEventListener("click", async () => {
      try {
        await removerDaLista(anime.id);
        atual = null;
        render();
        toast("Removido da sua lista");
      } catch (e) { toast(e.message); }
    });
  };
  render();
}

// ------------------------------------------------------------
// Sugestões da comunidade
// ------------------------------------------------------------
async function montarSugestoes(anime, notasPorUsuario = null) {
  const secao = document.getElementById("secao-sugestoes");
  let lista;
  try {
    lista = await sugestoesDoAnime(anime.id);
  } catch (e) {
    secao.innerHTML = `<h2 id="titulo-sugestoes">Sugerido pela comunidade</h2>${caixaErro(e.message)}`;
    return;
  }
  // Notas que cada pessoa deu a este anime (preenchidas pelas avaliações)
  const notas = notasPorUsuario || secao._notas || {};
  const minha = usuario && lista.find((s) => s.user_id === usuario.id);

  secao.innerHTML = `
    <h2 id="titulo-sugestoes">Sugerido pela comunidade</h2>
    <p class="secao-descricao">${lista.length
      ? `${lista.length} ${lista.length === 1 ? "pessoa sugere" : "pessoas sugerem"} este anime.`
      : "Ninguém sugeriu este anime ainda."}</p>

    ${usuario ? `
      <div class="painel-lista">
        ${minha ? `
          <p><strong>Você sugeriu este anime.</strong>${minha.reason ? ` Seu motivo: “${esc(minha.reason)}”` : ""}</p>
          <button class="link-remover" id="btn-remover-sugestao">Retirar minha sugestão</button>
        ` : `
          <form id="form-sugestao">
            <label class="rotulo" for="motivo-sugestao">Por que você recomenda este anime? <span class="opcional">(opcional)</span></label>
            <textarea id="motivo-sugestao" maxlength="500" rows="2" placeholder="Ex.: Animação incrível e uma história que prende do começo ao fim."></textarea>
            <button class="btn btn-primario" type="submit">Sugerir para a comunidade</button>
          </form>`}
      </div>` : ""}

    ${lista.length ? `
      <ul class="lista-sugestores">
        ${lista.map((s) => `
          <li>
            ${avatarHtml(s.autor?.avatar_url, nomeAutor(s.autor), temSeloApoiador(s.autor?.supporter_until))}
            <div>
              <div class="linha-autor">
                ${nomeComTag(nomeAutor(s.autor), s.autor?.tag, s.autor?.favorite_title, linkPerfil(s.autor))}${temSeloApoiador(s.autor?.supporter_until) ? seloApoiador() : ""}
                ${notas[s.user_id] ? `<span class="nota-usuario" title="Nota que deu ao anime">★ ${notas[s.user_id]}/10</span>` : ""}
                <span class="data">${tempoAtras(s.created_at)}</span>
              </div>
              ${s.reason ? `<p>${esc(s.reason)}</p>` : ""}
            </div>
          </li>`).join("")}
      </ul>` : ""}`;

  secao._notas = notas;

  secao.querySelector("#form-sugestao")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const botao = e.target.querySelector("button");
    botao.disabled = true;
    try {
      await sugerir(anime, secao.querySelector("#motivo-sugestao").value);
      toast("Anime sugerido para a comunidade");
      await montarSugestoes(anime, notas);
    } catch (err) { toast(err.message); botao.disabled = false; }
  });
  secao.querySelector("#btn-remover-sugestao")?.addEventListener("click", async () => {
    try {
      await removerSugestao(anime.id);
      toast("Sugestão retirada");
      await montarSugestoes(anime, notas);
    } catch (err) { toast(err.message); }
  });
}

// ------------------------------------------------------------
// Avaliações: nota 1–10, comentário, respostas e likes
// ------------------------------------------------------------
async function montarAvaliacoes(anime) {
  const secao = document.getElementById("secao-avaliacoes");
  let avaliacoes, stats, curtidas;
  try {
    [avaliacoes, stats] = await Promise.all([avaliacoesDoAnime(anime.id), estatisticas(anime.id)]);
    curtidas = await meusLikes(avaliacoes.map((r) => r.id));
  } catch (e) {
    secao.innerHTML = `<h2 id="titulo-avaliacoes">Avaliações da comunidade</h2>${caixaErro(e.message)}`;
    document.getElementById("nota-animese").textContent = "—";
    montarSugestoes(anime);
    return;
  }

  // Nota média do site no topo da página
  document.getElementById("nota-animese").textContent = stats.media ? formatarNota(stats.media) : "—";

  // Repassa as notas para a lista de quem sugeriu
  const notas = Object.fromEntries(avaliacoes.map((r) => [r.user_id, r.score]));
  const secaoSug = document.getElementById("secao-sugestoes");
  if (secaoSug) { secaoSug._notas = notas; montarSugestoes(anime, notas); }

  const minha = usuario && avaliacoes.find((r) => r.user_id === usuario.id);
  const outras = avaliacoes.filter((r) => r !== minha);

  secao.innerHTML = `
    <h2 id="titulo-avaliacoes">Avaliações da comunidade</h2>
    <p class="secao-descricao">${stats.total
      ? `Nota média <strong>${formatarNota(stats.media)}</strong> em ${stats.total} ${stats.total === 1 ? "avaliação" : "avaliações"} no AnimeSe.`
      : "Ninguém avaliou este anime ainda. Seja o primeiro!"}</p>
    <div id="area-minha-avaliacao"></div>
    <div class="lista-avaliacoes">
      ${minha ? cartaoAvaliacao(minha, curtidas) : ""}
      ${outras.map((r) => cartaoAvaliacao(r, curtidas)).join("")}
    </div>`;

  montarFormulario(anime, minha);
  ligarEventosAvaliacoes(anime, secao);
}

function montarFormulario(anime, minha) {
  const area = document.getElementById("area-minha-avaliacao");
  if (!usuario) {
    area.innerHTML = `<div class="painel-lista"><p>Entre com sua conta Google para dar sua nota e comentar.</p>
      <button class="btn btn-primario" id="btn-entrar-avaliar">Entrar com Google</button></div>`;
    area.querySelector("#btn-entrar-avaliar").addEventListener("click", entrar);
    return;
  }

  // Quem já avaliou vê o cartão; o formulário abre ao clicar em "Editar"
  if (minha && !area._editando) {
    area.innerHTML = "";
    return;
  }

  let nota = minha?.score || 0;
  area.innerHTML = `
    <form class="painel-lista form-avaliacao" id="form-avaliacao">
      <h3>${minha ? "Editar minha avaliação" : "Avaliar este anime"}</h3>
      <fieldset class="escolha-nota">
        <legend>Sua nota</legend>
        <div class="botoes-nota" role="radiogroup" aria-label="Nota de 1 a 10">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
            `<button type="button" role="radio" aria-checked="${n === nota}" data-nota="${n}" title="${n} — ${NOTAS[n]}">${n}</button>`).join("")}
        </div>
        <p class="significado-nota" id="significado-nota">${nota ? `${nota} — ${NOTAS[nota]}` : "Escolha de 1 a 10"}</p>
      </fieldset>
      <label class="rotulo" for="texto-avaliacao">O que você achou? <span class="opcional">(opcional)</span></label>
      <textarea id="texto-avaliacao" maxlength="2000" rows="4" placeholder="Conte o que gostou, o que não gostou, se recomenda…">${esc(minha?.body || "")}</textarea>
      <label class="check"><input type="checkbox" id="spoiler-avaliacao" ${minha?.spoiler ? "checked" : ""}> Meu comentário tem spoiler</label>
      <div class="acoes-form">
        <button class="btn btn-primario" type="submit">${minha ? "Salvar alterações" : "Publicar avaliação"}</button>
        ${minha ? `<button class="btn btn-contorno" type="button" id="btn-cancelar-edicao">Cancelar</button>` : ""}
      </div>
    </form>`;

  const significado = area.querySelector("#significado-nota");
  area.querySelectorAll("[data-nota]").forEach((b) =>
    b.addEventListener("click", () => {
      nota = Number(b.dataset.nota);
      area.querySelectorAll("[data-nota]").forEach((x) => x.setAttribute("aria-checked", x === b));
      significado.textContent = `${nota} — ${NOTAS[nota]}`;
    })
  );

  area.querySelector("#btn-cancelar-edicao")?.addEventListener("click", () => {
    area._editando = false;
    area.innerHTML = "";
  });

  area.querySelector("#form-avaliacao").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!nota) { toast("Escolha uma nota de 1 a 10"); return; }
    const botao = e.target.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await salvarAvaliacao(anime, {
        nota,
        texto: area.querySelector("#texto-avaliacao").value,
        spoiler: area.querySelector("#spoiler-avaliacao").checked,
      });
      area._editando = false;
      toast(minha ? "Avaliação atualizada" : "Avaliação publicada");
      await montarAvaliacoes(anime);
    } catch (err) {
      toast(err.message);
      botao.disabled = false;
    }
  });
}

function cartaoAvaliacao(r, curtidas) {
  const minha = usuario && r.user_id === usuario.id;
  const curtiu = curtidas.has(r.id);
  const nome = nomeAutor(r.autor);
  return `
    <article class="avaliacao ${minha ? "avaliacao-minha" : ""}" data-id="${r.id}">
      <header>
        ${avatarHtml(r.autor?.avatar_url, nome, temSeloApoiador(r.autor?.supporter_until))}
        <div class="linha-autor">
          ${nomeComTag(nome, r.autor?.tag, r.autor?.favorite_title, linkPerfil(r.autor))}${temSeloApoiador(r.autor?.supporter_until) ? seloApoiador() : ""}
          ${minha ? `<span class="selo-voce">você</span>` : ""}
          <span class="data">${tempoAtras(r.created_at)}${r.updated_at && r.updated_at !== r.created_at && new Date(r.updated_at) - new Date(r.created_at) > 60000 ? " (editada)" : ""}</span>
        </div>
        <span class="nota-grande" title="${NOTAS[r.score]}">★ ${r.score}<small>/10</small></span>
      </header>
      ${r.body ? (r.spoiler
        ? `<div class="spoiler"><button class="btn-spoiler" type="button">Contém spoiler, clique para ler</button><p class="texto-avaliacao" hidden>${esc(r.body)}</p></div>`
        : `<p class="texto-avaliacao">${esc(r.body)}</p>`) : ""}
      <footer class="acoes-avaliacao">
        <button class="btn-like" type="button" data-acao="like" aria-pressed="${curtiu}" ${minha || !usuario ? "disabled" : ""}
          title="${minha ? "Você não pode curtir a própria avaliação" : !usuario ? "Entre para curtir" : curtiu ? "Descurtir" : "Curtir"}">
          ♥ <span>${r.likes}</span>
        </button>
        ${usuario ? `<button class="btn-texto" type="button" data-acao="responder">Responder</button>` : ""}
        ${minha ? `<button class="btn-texto" type="button" data-acao="editar">Editar</button>
                   <button class="btn-texto perigo" type="button" data-acao="excluir">Excluir</button>` : ""}
        ${!minha && souAdmin ? `<button class="btn-texto perigo" type="button" data-acao="excluir" data-moderacao="1" title="Moderação: apagar a avaliação desta pessoa">Remover (admin)</button>` : ""}
      </footer>
      ${r.respostas?.length || usuario ? `
        <div class="respostas">
          ${(r.respostas || []).map((resp) => `
            <div class="resposta" data-resposta="${resp.id}">
              ${avatarHtml(resp.autor?.avatar_url, nomeAutor(resp.autor), temSeloApoiador(resp.autor?.supporter_until))}
              <div>
                <div class="linha-autor">
                  ${nomeComTag(nomeAutor(resp.autor), resp.autor?.tag, resp.autor?.favorite_title, linkPerfil(resp.autor))}${temSeloApoiador(resp.autor?.supporter_until) ? seloApoiador() : ""}
                  <span class="data">${tempoAtras(resp.created_at)}</span>
                  ${usuario && resp.user_id === usuario.id ? `<button class="btn-texto perigo" type="button" data-acao="excluir-resposta">Excluir</button>`
                    : souAdmin ? `<button class="btn-texto perigo" type="button" data-acao="excluir-resposta" data-moderacao="1">Remover (admin)</button>` : ""}
                </div>
                <p>${esc(resp.body)}</p>
              </div>
            </div>`).join("")}
          <form class="form-resposta" hidden>
            <label class="sr-only" for="resp-${r.id}">Sua resposta</label>
            <textarea id="resp-${r.id}" maxlength="1000" rows="2" placeholder="Escreva sua resposta…"></textarea>
            <div class="acoes-form">
              <button class="btn btn-primario" type="submit">Responder</button>
              <button class="btn btn-contorno" type="button" data-acao="cancelar-resposta">Cancelar</button>
            </div>
          </form>
        </div>` : ""}
    </article>`;
}

function ligarEventosAvaliacoes(anime, secao) {
  if (secao._ligado) return; // a seção é redesenhada, mas os eventos são ligados uma vez só
  secao._ligado = true;
  secao.addEventListener("click", async (e) => {
    const botao = e.target.closest("button");
    if (!botao) return;
    const cartao = botao.closest(".avaliacao");
    const reviewId = cartao ? Number(cartao.dataset.id) : null;

    if (botao.classList.contains("btn-spoiler")) {
      botao.nextElementSibling.hidden = false;
      botao.remove();
      return;
    }

    switch (botao.dataset.acao) {
      case "like": {
        const curtiu = botao.getAttribute("aria-pressed") === "true";
        const contador = botao.querySelector("span");
        botao.disabled = true;
        try {
          if (curtiu) await descurtir(reviewId); else await curtir(reviewId);
          botao.setAttribute("aria-pressed", String(!curtiu));
          botao.title = curtiu ? "Curtir" : "Descurtir";
          contador.textContent = Number(contador.textContent) + (curtiu ? -1 : 1);
        } catch (err) { toast(err.message); }
        botao.disabled = false;
        break;
      }
      case "responder": {
        const form = cartao.querySelector(".form-resposta");
        form.hidden = false;
        form.querySelector("textarea").focus();
        break;
      }
      case "cancelar-resposta":
        botao.closest(".form-resposta").hidden = true;
        break;
      case "editar": {
        const area = document.getElementById("area-minha-avaliacao");
        area._editando = true;
        const avaliacoes = await avaliacoesDoAnime(anime.id);
        montarFormulario(anime, avaliacoes.find((r) => r.id === reviewId));
        area.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      }
      case "excluir":
        if (!confirm(botao.dataset.moderacao
          ? "Remover a avaliação desta pessoa? As respostas e likes dela também serão apagados. Não dá para desfazer."
          : "Excluir sua avaliação? As respostas e likes dela também serão apagados.")) return;
        try {
          await excluirAvaliacao(reviewId);
          toast("Avaliação excluída");
          await montarAvaliacoes(anime);
        } catch (err) { toast(err.message); }
        break;
      case "excluir-resposta": {
        const respostaId = Number(botao.closest(".resposta").dataset.resposta);
        if (!confirm(botao.dataset.moderacao ? "Remover a resposta desta pessoa? Não dá para desfazer." : "Excluir sua resposta?")) return;
        try {
          await excluirResposta(respostaId);
          botao.closest(".resposta").remove();
          toast("Resposta excluída");
        } catch (err) { toast(err.message); }
        break;
      }
    }
  });

  secao.addEventListener("submit", async (e) => {
    const form = e.target.closest(".form-resposta");
    if (!form) return;
    e.preventDefault();
    const reviewId = Number(form.closest(".avaliacao").dataset.id);
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await responder(reviewId, form.querySelector("textarea").value);
      toast("Resposta publicada");
      await montarAvaliacoes(anime);
    } catch (err) {
      toast(err.message);
      botao.disabled = false;
    }
  });
}
