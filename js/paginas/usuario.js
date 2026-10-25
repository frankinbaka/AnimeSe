// Perfil público de um usuário: lista, avaliações, comentários,
// sugestões e, para criadores de conteúdo, redes e vídeos.
import { montarLayout, esc, caixaErro, cardAnime, avatarHtml, nomeComTag, formatarNumero, temSeloApoiador, seloApoiador } from "../ui.js";
import { usuarioAtual } from "../store.js";
import { NOTAS, tempoAtras, nomeAutor as nomeAutorFeed } from "../comunidade.js";
import {
  perfilPublico, listaDoUsuario, avaliacoesDoUsuario, comentariosDoUsuario, sugestoesDoUsuario,
  REDES, videoIncorporavel,
} from "../perfis.js";
import { videosDoFeedDe, republicadosPor } from "../feed.js";
import { FEED_ATIVO } from "../config.js";
import { contagem, euSigo, seguir, listaSocial } from "../social.js";
import { toast, entrar } from "../ui.js";
import { completarFranquias, agrupar, cardGrupo, ligarGrupos } from "../franquias.js";
import { PAGINAS_ATIVAS } from "../config.js";
import { paginasDoUsuario, republicadasPor, minhasCurtidas, minhasRepublicacoes } from "../paginas-dados.js";
import { avatarPagina, cardPublicacao, ligarPublicacoes } from "../paginas-ui.js";
import { tempoAtras as haQuanto } from "../comunidade.js";

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

  const [lista, avaliacoes, comentarios, sugestoes, doFeed, republicados, social, sigo] = await Promise.all([
    listaDoUsuario(p.id).catch(() => []),
    avaliacoesDoUsuario(p.id).catch(() => []),
    comentariosDoUsuario(p.id).catch(() => []),
    sugestoesDoUsuario(p.id).catch(() => []),
    FEED_ATIVO ? videosDoFeedDe(p.id).catch(() => []) : [],
    FEED_ATIVO ? republicadosPor(p.id).catch(() => []) : [],
    contagem(p.id),
    euSigo(p.id).catch(() => false),
  ]);
  const [paginasDele, republicadas] = PAGINAS_ATIVAS
    ? await Promise.all([paginasDoUsuario(p.id).catch(() => []), republicadasPor(p.id).catch(() => [])])
    : [[], []];
  let seguidores = social.seguidores;

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
    ...(PAGINAS_ATIVAS ? [{ id: "republicacoes", nome: "Republicados", total: republicadas.length }] : []),
    ...(FEED_ATIVO ? [{ id: "republicados", nome: PAGINAS_ATIVAS ? "Vídeos republicados" : "Republicados", total: republicados.length }] : []),
    { id: "seguidores", nome: "Seguidores", total: seguidores },
    { id: "seguindo", nome: "Seguindo", total: social.seguindo },
  ];

  alvo.innerHTML = `
    <header class="perfil-cabecalho">
      ${avatarHtml(p.avatar_url, nome, temSeloApoiador(p.supporter_until))}
      <div class="perfil-identidade">
        <h1>${nomeComTag(nome, p.tag, p.favorite_title)}</h1>
        <div class="perfil-selos">
          ${p.role === "admin" ? `<span class="selo selo-admin">Admin do AnimeSe</span>` : ""}
          ${criador ? `<span class="selo selo-criador">Criador de conteúdo</span>` : ""}
          ${temSeloApoiador(p.supporter_until) ? seloApoiador() : ""}
          ${p.created_at ? `<span class="perfil-desde">No AnimeSe desde ${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(p.created_at))}</span>` : ""}
        </div>
        ${p.bio ? `<p class="perfil-bio">${esc(p.bio)}</p>` : ""}
        ${redes.length ? `
          <div class="perfil-redes">
            ${redes.map((r) => `<a class="rede rede-${r}" href="${esc(p[`${r}_url`])}" target="_blank" rel="noopener nofollow">${REDES[r].nome}</a>`).join("")}
          </div>` : ""}
        ${paginasDele.length ? `<div class="perfil-paginas" aria-label="Páginas que administra">
          ${paginasDele.map((pg) => `<a href="pagina.html?p=${esc(pg.slug)}">${avatarPagina(pg)} ${esc(pg.name)}</a>`).join("")}
        </div>` : ""}
        ${souEu ? `<a class="btn btn-contorno btn-editar-perfil" href="perfil.html">Editar meu perfil</a>`
                : `<button type="button" class="btn ${sigo ? "btn-contorno" : "btn-primario"} btn-seguir" id="btn-seguir" aria-pressed="${sigo}">${sigo ? "Seguindo" : "Seguir"}</button>`}
      </div>
      ${p.favorite_mal_id ? `
        <a class="perfil-favorito" href="anime.html?id=${p.favorite_mal_id}">
          ${p.favorite_image ? `<img src="${esc(p.favorite_image)}" alt="">` : ""}
          <span><small>Anime favorito</small><strong>${esc(p.favorite_title)}</strong></span>
        </a>` : ""}
    </header>

    <ul class="perfil-numeros">
      <li><button type="button" data-ir="seguidores"><strong id="num-seguidores">${formatarNumero(seguidores)}</strong><span>${seguidores === 1 ? "seguidor" : "seguidores"}</span></button></li>
      <li><button type="button" data-ir="seguindo"><strong>${formatarNumero(social.seguindo)}</strong><span>seguindo</span></button></li>
      <li><button type="button" data-ir="lista"><strong>${formatarNumero(assistidos)}</strong><span>já assistidos</span></button></li>
      <li><button type="button" data-ir="avaliacoes"><strong>${formatarNumero(avaliacoes.length)}</strong><span>avaliações</span></button></li>
    </ul>

    <div class="abas" role="tablist" id="abas-perfil">
      ${abas.map((a) => `<button class="aba" role="tab" data-aba="${a.id}" aria-selected="false">${a.nome}<span class="contador">${a.total}</span></button>`).join("")}
    </div>
    <div id="painel-perfil" role="tabpanel"></div>`;

  const painel = alvo.querySelector("#painel-perfil");
  // Assistidos agrupados por franquia (temporadas e filmes num card só)
  let grupos = agrupar(assistidosLista);
  ligarGrupos(painel, () => grupos, { pronome: souEu ? "Você" : nome });
  if (assistidosLista.some((a) => !a.franquia)) {
    completarFranquias(assistidosLista, souEu ? p.id : null).then(() => {
      grupos = agrupar(assistidosLista);
      if (abasEl.querySelector('[data-aba="lista"]')?.getAttribute("aria-selected") === "true") render.lista();
    }).catch(() => {});
  }
  const vazio = (texto) => `<p class="vazio">${texto}</p>`;
  const pronome = souEu ? "Você" : nome;

  // Lista de pessoas (seguidores ou seguindo)
  const listaPessoas = async (tipo) => {
    painel.innerHTML = `<p class="secao-descricao">Carregando…</p>`;
    const pessoas = await listaSocial(p.id, tipo).catch(() => []);
    painel.innerHTML = pessoas.length
      ? `<ul class="lista-pessoas">${pessoas.map((u) => {
          const n = u.nickname || u.display_name?.split(" ")[0] || "Usuário";
          return `<li><a href="usuario.html?id=${u.id}">${avatarHtml(u.avatar_url, n, temSeloApoiador(u.supporter_until))}
            <span>${nomeComTag(n, u.tag, u.favorite_title)}</span></a></li>`;
        }).join("")}</ul>`
      : vazio(tipo === "seguidores" ? `${souEu ? "Você ainda não tem" : `${esc(nome)} ainda não tem`} seguidores.` : `${pronome} ainda não segue ninguém.`);
  };

  const render = {
    seguidores() { listaPessoas("seguidores"); },
    seguindo() { listaPessoas("seguindo"); },
    lista() {
      painel.innerHTML = assistidosLista.length
        ? `<div class="grade">${grupos.map((g, i) => cardGrupo(g, i)).join("")}</div>`
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
        ${!videos.length && !noFeed.length ? vazio(souEu ? (FEED_ATIVO ? `Você ainda não publicou vídeos. <a href="feed.html">Publique no feed</a>.` : `Você ainda não destacou vídeos. <a href="perfil.html">Adicione no seu perfil</a>.`) : `${esc(nome)} ainda não publicou vídeos.`) : ""}`;
    },
    async republicacoes() {
      if (!republicadas.length) return (painel.innerHTML = vazio(`${pronome} ainda não republicou nenhuma publicação.`));
      const ids = republicadas.map((x) => x.id);
      const [curtidas, minhas] = await Promise.all([minhasCurtidas(ids).catch(() => new Set()), minhasRepublicacoes(ids).catch(() => new Set())]);
      painel.innerHTML = `<div class="lista-publicacoes lista-republicadas">${republicadas.map((post) => cardPublicacao(post, {
        curtido: curtidas.has(post.id), republicado: minhas.has(post.id),
        rotulo: `${souEu ? "Você republicou" : `${esc(nome)} republicou`} ${haQuanto(post.republicadoEm)}`,
      })).join("")}</div>`;
      ligarPublicacoes(painel.querySelector(".lista-republicadas"), { obterPost: (id) => republicadas.find((x) => x.id === id) });
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
  alvo.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => {
    abrir(b.dataset.ir);
    abasEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  // Seguir / deixar de seguir
  alvo.querySelector("#btn-seguir")?.addEventListener("click", async (e) => {
    const botao = e.currentTarget;
    if (!eu) { toast("Entre com sua conta Google para seguir pessoas"); return entrar(); }
    const seguindoAgora = botao.getAttribute("aria-pressed") === "true";
    botao.disabled = true;
    try {
      await seguir(p.id, !seguindoAgora);
      seguidores += seguindoAgora ? -1 : 1;
      botao.setAttribute("aria-pressed", String(!seguindoAgora));
      botao.textContent = seguindoAgora ? "Seguir" : "Seguindo";
      botao.classList.toggle("btn-primario", seguindoAgora);
      botao.classList.toggle("btn-contorno", !seguindoAgora);
      alvo.querySelector("#num-seguidores").textContent = formatarNumero(seguidores);
      const contadorAba = abasEl.querySelector('[data-aba="seguidores"] .contador');
      if (contadorAba) contadorAba.textContent = seguidores;
      toast(seguindoAgora ? `Você deixou de seguir ${nome}` : `Agora você segue ${nome}`);
    } catch (err) { toast(err.message); }
    botao.disabled = false;
  });
  abrir(params.get("aba") || "lista");
}
