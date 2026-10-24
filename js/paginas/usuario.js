// Perfil público de um usuário: lista, avaliações, comentários,
// sugestões e, para criadores de conteúdo, redes e vídeos.
import { montarLayout, esc, caixaErro, cardAnime, avatarHtml, nomeComTag, formatarNumero } from "../ui.js";
import { usuarioAtual } from "../store.js";
import { NOTAS, tempoAtras, nomeAutor as nomeAutorFeed } from "../comunidade.js";
import {
  perfilPublico, listaDoUsuario, avaliacoesDoUsuario, comentariosDoUsuario, sugestoesDoUsuario,
  REDES, videoIncorporavel,
} from "../perfis.js";
import { videosDoFeedDe, republicadosPor } from "../feed.js";

await montarLayout();

const alvo = document.getElementById("perfil-publico");
const params = new URLSearchParams(location.search);
const eu = await usuarioAtual();

try {
  const perfil = await perfilPublico({ id: params.get("id"), nick: params.get("u") });
  if (!perfil) {
    alvo.innerHTML = `<div class="vazio"><h2>Usuário não encontrado</h2><p>O link pode estar errado ou a conta foi removida.</p>
      <a class="btn btn-primario" href="comunidade.html">Ver a comunidade</a></div>`;
  } else {
    await mostrar(perfil);
  }
} catch (e) {
  alvo.innerHTML = `<div style="margin-top:32px">${caixaErro(e.message)}</div>`;
}

async function mostrar(p) {
  const nome = p.nickname || p.display_name?.split(" ")[0] || "Usuário";
  document.title = `${nome} — AnimeSe`;
  const souEu = eu?.id === p.id;

  const [lista, avaliacoes, comentarios, sugestoes, doFeed, republicados] = await Promise.all([
    listaDoUsuario(p.id).catch(() => []),
    avaliacoesDoUsuario(p.id).catch(() => []),
    comentariosDoUsuario(p.id).catch(() => []),
    sugestoesDoUsuario(p.id).catch(() => []),
    videosDoFeedDe(p.id).catch(() => []),
    republicadosPor(p.id).catch(() => []),
  ]);

  const redes = Object.keys(REDES).filter((r) => p[`${r}_url`]);
  const videos = (p.creator_videos || []).map(videoIncorporavel).filter(Boolean);
  const criador = p.is_creator && (redes.length || videos.length || doFeed.length);
  // O perfil público mostra só os animes já assistidos
  const assistidosLista = lista.filter((a) => a.status === "assistido");
  const assistidos = assistidosLista.length;

  const abas = [
    { id: "lista", nome: "Assistidos", total: assistidos },
    { id: "avaliacoes", nome: "Avaliações", total: avaliacoes.length },
    { id: "comentarios", nome: "Comentários", total: comentarios.length },
    { id: "sugestoes", nome: "Sugestões", total: sugestoes.length },
    ...(criador ? [{ id: "videos", nome: "Vídeos", total: videos.length + doFeed.length }] : []),
    { id: "republicados", nome: "Republicados", total: republicados.length },
  ];

  alvo.innerHTML = `
    <header class="perfil-cabecalho">
      ${avatarHtml(p.avatar_url, nome)}
      <div class="perfil-identidade">
        <h1>${nomeComTag(nome, p.tag, p.favorite_title)}</h1>
        <div class="perfil-selos">
          ${p.role === "admin" ? `<span class="selo selo-admin">Admin do AnimeSe</span>` : ""}
          ${criador ? `<span class="selo selo-criador">Criador de conteúdo</span>` : ""}
          <span class="perfil-desde">No AnimeSe desde ${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(p.created_at))}</span>
        </div>
        ${p.bio ? `<p class="perfil-bio">${esc(p.bio)}</p>` : ""}
        ${redes.length ? `
          <div class="perfil-redes">
            ${redes.map((r) => `<a class="rede rede-${r}" href="${esc(p[`${r}_url`])}" target="_blank" rel="noopener nofollow">${REDES[r].nome}</a>`).join("")}
          </div>` : ""}
        ${souEu ? `<a class="btn btn-contorno btn-editar-perfil" href="perfil.html">Editar meu perfil</a>` : ""}
      </div>
      ${p.favorite_mal_id ? `
        <a class="perfil-favorito" href="anime.html?id=${p.favorite_mal_id}">
          ${p.favorite_image ? `<img src="${esc(p.favorite_image)}" alt="">` : ""}
          <span><small>Anime favorito</small><strong>${esc(p.favorite_title)}</strong></span>
        </a>` : ""}
    </header>

    <ul class="perfil-numeros">
      <li><strong>${formatarNumero(assistidos)}</strong><span>já assistidos</span></li>
      <li><strong>${formatarNumero(comentarios.length)}</strong><span>comentários</span></li>
      <li><strong>${formatarNumero(avaliacoes.length)}</strong><span>avaliações</span></li>
      <li><strong>${formatarNumero(sugestoes.length)}</strong><span>sugestões</span></li>
    </ul>

    <div class="abas" role="tablist" id="abas-perfil">
      ${abas.map((a) => `<button class="aba" role="tab" data-aba="${a.id}" aria-selected="false">${a.nome}<span class="contador">${a.total}</span></button>`).join("")}
    </div>
    <div id="painel-perfil" role="tabpanel"></div>`;

  const painel = alvo.querySelector("#painel-perfil");
  const vazio = (texto) => `<p class="vazio">${texto}</p>`;
  const pronome = souEu ? "Você" : nome;

  const render = {
    lista() {
      painel.innerHTML = assistidosLista.length
        ? `<div class="grade">${assistidosLista.map((a) => cardAnime(a)).join("")}</div>`
        : vazio(`${pronome} ainda não marcou nenhum anime como já assistido.`);
    },
    avaliacoes() {
      painel.innerHTML = avaliacoes.length ? `<div class="lista-avaliacoes">${avaliacoes.map((r) => `
        <article class="avaliacao avaliacao-resumo">
          <header>
            <a href="anime.html?id=${r.mal_id}" class="miniatura"><img src="${esc(r.anime_image)}" alt="" loading="lazy"></a>
            <div class="linha-autor">
              <a class="titulo-anime" href="anime.html?id=${r.mal_id}">${esc(r.anime_title)}</a>
              <span class="data">${tempoAtras(r.created_at)}${r.likes ? `, ♥ ${r.likes}` : ""}</span>
            </div>
            <span class="nota-grande" title="${NOTAS[r.score]}">★ ${r.score}<small>/10</small></span>
          </header>
          ${r.body ? (r.spoiler
            ? `<div class="spoiler"><button class="btn-spoiler" type="button">Contém spoiler, clique para ler</button><p class="texto-avaliacao" hidden>${esc(r.body)}</p></div>`
            : `<p class="texto-avaliacao">${esc(r.body)}</p>`) : ""}
        </article>`).join("")}</div>` : vazio(`${pronome} ainda não avaliou nenhum anime.`);
      painel.querySelectorAll(".btn-spoiler").forEach((b) => b.addEventListener("click", () => { b.nextElementSibling.hidden = false; b.remove(); }));
    },
    comentarios() {
      painel.innerHTML = comentarios.length ? `<div class="lista-avaliacoes">${comentarios.map((c) => `
        <article class="avaliacao avaliacao-resumo">
          <header>
            ${c.review ? `<a href="anime.html?id=${c.review.mal_id}#secao-avaliacoes" class="miniatura"><img src="${esc(c.review.anime_image)}" alt="" loading="lazy"></a>` : ""}
            <div class="linha-autor">
              <span>Respondeu numa avaliação de ${c.review ? `<a class="titulo-anime" href="anime.html?id=${c.review.mal_id}#secao-avaliacoes">${esc(c.review.anime_title)}</a>` : "um anime"}</span>
              <span class="data">${tempoAtras(c.created_at)}</span>
            </div>
          </header>
          <p class="texto-avaliacao">${esc(c.body)}</p>
        </article>`).join("")}</div>` : vazio(`${pronome} ainda não comentou nas avaliações.`);
    },
    sugestoes() {
      painel.innerHTML = sugestoes.length ? `<div class="lista-sugestoes-perfil">${sugestoes.map((s) => `
        <a class="sugestao-perfil" href="anime.html?id=${s.mal_id}">
          <img src="${esc(s.anime_image)}" alt="" loading="lazy">
          <span><strong>${esc(s.anime_title)}</strong>${s.reason ? `<span>“${esc(s.reason)}”</span>` : ""}<small>${tempoAtras(s.created_at)}</small></span>
        </a>`).join("")}</div>` : vazio(`${pronome} ainda não sugeriu animes para a comunidade.`);
    },
    videos() {
      const grade = (lista) => `<div class="grade-videos">${lista.map((v) => `
        <div class="video-criador ${v.vertical ? "vertical" : ""}">
          <iframe src="${esc(v.embed)}" title="Vídeo do ${REDES[v.rede].nome}" loading="lazy" allowfullscreen
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
          ${v.chave ? `<a href="feed.html?item=${v.chave}">Ver no feed</a>` : `<a href="${esc(v.url)}" target="_blank" rel="noopener nofollow">Abrir no ${REDES[v.rede].nome}</a>`}
        </div>`).join("")}</div>`;
      const noFeed = doFeed.map((i) => ({ ...videoIncorporavel(i.video_url), chave: i.chave })).filter((v) => v.embed);
      painel.innerHTML = `
        ${redes.length ? `<p class="secao-descricao">Siga ${souEu ? "seus canais" : `os canais de ${esc(nome)}`}: ${redes.map((r) => `<a href="${esc(p[`${r}_url`])}" target="_blank" rel="noopener nofollow">${REDES[r].nome}</a>`).join(", ")}.</p>` : ""}
        ${videos.length ? `<h2 class="titulo-bloco">Em destaque</h2>${grade(videos)}` : ""}
        ${noFeed.length ? `<h2 class="titulo-bloco">Publicados no feed</h2>${grade(noFeed)}` : ""}
        ${!videos.length && !noFeed.length ? vazio(souEu ? `Você ainda não publicou vídeos. <a href="feed.html">Publique no feed</a>.` : `${esc(nome)} ainda não publicou vídeos.`) : ""}`;
    },
    republicados() {
      if (!republicados.length) return (painel.innerHTML = vazio(`${pronome} ainda não republicou nada do feed.`));
      painel.innerHTML = `<div class="grade-videos">${republicados.map((i) => {
        const v = i.video_url ? videoIncorporavel(i.video_url) : null;
        const autorNome = i.origem === "oficial" ? "AnimeSe" : nomeAutorFeed(i.autor);
        return `<div class="video-criador ${v?.vertical ? "vertical" : ""}">
          ${v ? `<iframe src="${esc(v.embed)}" title="Vídeo republicado" loading="lazy" allowfullscreen></iframe>`
              : `<a class="cartao-republicado" href="post.html?id=${i.chave.slice(2)}">${i.imagem ? `<img src="${esc(i.imagem)}" alt="">` : ""}<strong>${esc(i.titulo || "")}</strong></a>`}
          <span class="secao-descricao">De ${esc(autorNome)}. <a href="feed.html?item=${i.chave}">Ver no feed</a></span>
        </div>`;
      }).join("")}</div>`;
    },
  };

  const abasEl = alvo.querySelector("#abas-perfil");
  const abrir = (id) => {
    if (!render[id] || !abas.some((a) => a.id === id)) id = "lista";
    abasEl.querySelectorAll(".aba").forEach((a) => a.setAttribute("aria-selected", String(a.dataset.aba === id)));
    const url = new URL(location.href);
    url.searchParams.set("aba", id);
    history.replaceState(null, "", url);
    render[id]();
  };
  abasEl.addEventListener("click", (e) => { const a = e.target.closest(".aba"); if (a) abrir(a.dataset.aba); });
  abrir(params.get("aba") || "lista");
}
