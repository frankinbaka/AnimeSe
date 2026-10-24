// Feed estilo TikTok: um item por tela, rolagem vertical.
import { montarLayout, esc, toast, entrar, avatarHtml, nomeComTag } from "../ui.js";
import { usuarioAtual, lerPerfil } from "../store.js";
import { nomeAutor, tempoAtras } from "../comunidade.js";
import { REDES, videoIncorporavel, linkPerfil } from "../perfis.js";
import { idYoutube, TIPOS_POST } from "../conteudo.js";
import {
  paginaDoFeed, itemDoFeed, minhasInteracoes, curtirItem, republicarItem, publicarVideo, excluirVideo,
  denunciar, MOTIVOS_DENUNCIA,
} from "../feed.js";

await montarLayout();

const feed = document.getElementById("feed");
const barra = document.getElementById("feed-barra");
const usuario = await usuarioAtual();
const perfil = usuario ? await lerPerfil().catch(() => null) : null;
const souCriador = Boolean(perfil?.criador);
const souAdmin = perfil?.papel === "admin";

const carregados = new Set();
let ultimoCreatedAt = null;
let acabou = false;
let carregando = false;

// ------------------------------------------------------------
// Barra do topo: publicar (criadores) ou convite para ser criador
// ------------------------------------------------------------
barra.innerHTML = souCriador
  ? `<button class="btn btn-primario" id="btn-publicar">Publicar vídeo</button>`
  : usuario
    ? `<a class="feed-convite" href="perfil.html#form-criador">Faz vídeos sobre anime? Peça o selo de criador para publicar aqui.</a>`
    : "";
barra.querySelector("#btn-publicar")?.addEventListener("click", abrirPublicar);

// ------------------------------------------------------------
// Montagem dos itens
// ------------------------------------------------------------
function htmlMidia(item) {
  const v = item.video_url ? videoIncorporavel(item.video_url) : null;
  if (v) {
    return `<div class="feed-midia ${v.vertical ? "vertical" : "horizontal"}" data-embed="${esc(v.embed)}" data-rede="${v.rede}">
      <div class="feed-espera"><span class="icone-play" aria-hidden="true">▶</span><span>${REDES[v.rede].nome}</span></div>
    </div>`;
  }
  // Publicação oficial com imagem/texto
  return `<a class="feed-midia feed-post" href="post.html?id=${item.chave.slice(2)}">
    ${item.imagem ? `<img src="${esc(item.imagem)}" alt="" loading="lazy">` : ""}
    <div class="feed-post-texto">
      <span class="selo-tipo selo-${item.tipo}">${TIPOS_POST[item.tipo]?.nome || "Publicação"}</span>
      <h2>${esc(item.titulo || "")}</h2>
      ${item.texto ? `<p>${esc(item.texto)}</p>` : ""}
      <span class="feed-ler-mais">Ler publicação completa</span>
    </div>
  </a>`;
}

function htmlItem(item, inter) {
  const oficial = item.origem === "oficial";
  const nome = oficial ? "AnimeSe" : nomeAutor(item.autor);
  const curtiu = inter.curtidas.has(item.chave);
  const republicou = inter.republicados.has(item.chave);
  const podeExcluir = !oficial && usuario && (item.autor_id === usuario.id || souAdmin);
  const acao = oficial ? (item.tipo === "video" ? "publicou um vídeo" : "fez uma publicação") : "publicou um vídeo";
  return `
    <article class="item-feed" data-chave="${item.chave}" aria-label="${esc(nome)} ${acao}">
      <div class="feed-palco">
        ${htmlMidia(item)}
        <div class="feed-info">
          <div class="feed-autor">
            ${oficial ? `<span class="avatar avatar-oficial" aria-hidden="true">ア</span>` : avatarHtml(item.autor?.avatar_url, nome)}
            <div>
              ${oficial ? `<span class="nome-usuario">AnimeSe <span class="selo selo-oficial">Oficial</span></span>`
                        : nomeComTag(nome, item.autor?.tag, item.autor?.favorite_title, linkPerfil(item.autor))}
              <span class="feed-quando">${acao}, ${tempoAtras(item.created_at)}</span>
            </div>
          </div>
          ${!oficial && item.texto ? `<p class="feed-legenda">${esc(item.texto)}</p>` : ""}
          ${oficial && item.video_url && item.titulo ? `<p class="feed-legenda"><strong>${esc(item.titulo)}</strong>${item.texto ? `<br>${esc(item.texto)}` : ""}</p>` : ""}
        </div>
        <div class="feed-acoes">
          <button type="button" class="feed-acao" data-acao="curtir" aria-pressed="${curtiu}" aria-label="Curtir">
            <span class="icone" aria-hidden="true">♥</span><span class="contagem">${item.curtidas}</span>
          </button>
          <button type="button" class="feed-acao" data-acao="republicar" aria-pressed="${republicou}" aria-label="Republicar no meu perfil">
            <span class="icone" aria-hidden="true">↻</span><span class="contagem">${item.republicacoes}</span>
          </button>
          <button type="button" class="feed-acao" data-acao="link" aria-label="Copiar link">
            <span class="icone" aria-hidden="true">🔗</span><span class="contagem">Link</span>
          </button>
          ${!oficial && item.autor_id !== usuario?.id ? `<button type="button" class="feed-acao" data-acao="denunciar" aria-label="Denunciar">
            <span class="icone" aria-hidden="true">⚑</span><span class="contagem">Denunciar</span></button>` : ""}
          ${podeExcluir ? `<button type="button" class="feed-acao" data-acao="excluir" aria-label="Excluir vídeo">
            <span class="icone" aria-hidden="true">🗑</span><span class="contagem">Excluir</span></button>` : ""}
        </div>
      </div>
    </article>`;
}

async function acrescentar(itens) {
  const novos = itens.filter((i) => !carregados.has(i.chave));
  if (!novos.length) return;
  novos.forEach((i) => carregados.add(i.chave));
  const inter = await minhasInteracoes(novos.map((i) => i.chave));
  feed.querySelector(".feed-fim")?.remove();
  feed.insertAdjacentHTML("beforeend", novos.map((i) => htmlItem(i, inter)).join(""));
  novos.forEach((i) => observarItem(feed.querySelector(`[data-chave="${i.chave}"]`)));
}

async function carregarMais() {
  if (carregando || acabou) return;
  carregando = true;
  try {
    const itens = await paginaDoFeed({ antesDe: ultimoCreatedAt, limite: 8 });
    if (itens.length) ultimoCreatedAt = itens.at(-1).created_at;
    if (itens.length < 8) acabou = true;
    feed.querySelector(".feed-carregando")?.remove();
    await acrescentar(itens);
    if (acabou) {
      feed.insertAdjacentHTML("beforeend", carregados.size
        ? `<div class="feed-fim"><p>Você viu tudo por enquanto.</p><button class="btn btn-claro" type="button" id="btn-topo">Voltar ao topo</button></div>`
        : `<div class="feed-fim"><h2>O feed ainda está vazio</h2><p>${souCriador ? "Seja o primeiro: clique em Publicar vídeo." : "Os vídeos dos criadores de conteúdo vão aparecer aqui."}</p></div>`);
      feed.querySelector("#btn-topo")?.addEventListener("click", () => feed.scrollTo({ top: 0, behavior: "smooth" }));
    }
  } catch (e) {
    feed.querySelector(".feed-carregando")?.remove();
    feed.insertAdjacentHTML("beforeend", `<div class="feed-fim"><p>${esc(e.message)}</p></div>`);
    acabou = true;
  } finally {
    carregando = false;
  }
}

// ------------------------------------------------------------
// Carrega só o vídeo visível (e os vizinhos); descarrega os distantes
// ------------------------------------------------------------
const observador = new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    if (!e.isIntersecting) continue;
    const itens = [...feed.querySelectorAll(".item-feed")];
    const i = itens.indexOf(e.target);
    // Só o vídeo na tela fica carregado e tocando; os outros são desligados
    itens.forEach((el, j) => (j === i ? ligarVideo(el) : desligarVideo(el)));
    history.replaceState(null, "", `feed.html?item=${e.target.dataset.chave}`);
    if (i >= itens.length - 3) carregarMais();
  }
}, { root: feed, threshold: 0.6 });

function observarItem(el) { if (el) observador.observe(el); }

/**
 * Reprodução automática. Os navegadores só deixam um vídeo tocar sozinho
 * COM SOM depois que a pessoa já clicou ou tocou em algo na página. Antes
 * disso, o vídeo começa mudo e aparece o botão "Ativar som".
 */
const podeTocarComSom = () => Boolean(navigator.userActivation?.hasBeenActive);

function urlAutoplay(embed, rede, mudo) {
  const url = new URL(embed);
  if (rede === "youtube") {
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("mute", mudo ? "1" : "0");
    url.searchParams.set("playsinline", "1");
  } else if (rede === "tiktok") {
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("muted", mudo ? "1" : "0");
  }
  // Instagram não permite reprodução automática em sites de fora
  return url.toString();
}

function ligarVideo(el, forcarSom = false) {
  const midia = el.querySelector("[data-embed]");
  if (!midia || (midia.querySelector("iframe") && !forcarSom)) return;
  midia.querySelector("iframe")?.remove();
  midia.querySelector(".btn-som")?.remove();
  const rede = midia.dataset.rede;
  const mudo = !forcarSom && !podeTocarComSom() && rede !== "instagram";
  midia.insertAdjacentHTML("beforeend", `<iframe src="${esc(urlAutoplay(midia.dataset.embed, rede, mudo))}" title="Vídeo" allowfullscreen
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
    ${mudo ? `<button type="button" class="btn-som">🔇 Ativar som</button>` : ""}`);
  midia.querySelector(".btn-som")?.addEventListener("click", () => ligarVideo(el, true));
}
function desligarVideo(el) {
  el.querySelector("[data-embed] iframe")?.remove();
  el.querySelector("[data-embed] .btn-som")?.remove();
}

// Teclado: setas para cima e para baixo trocam de vídeo
document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]") || /input|textarea/i.test(document.activeElement?.tagName)) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    feed.scrollBy({ top: (e.key === "ArrowDown" ? 1 : -1) * feed.clientHeight, behavior: "smooth" });
  }
});

// ------------------------------------------------------------
// Ações: curtir, republicar, copiar link, excluir
// ------------------------------------------------------------
feed.addEventListener("click", async (e) => {
  const botao = e.target.closest(".feed-acao");
  if (!botao) return;
  const item = botao.closest(".item-feed");
  const chave = item.dataset.chave;
  const acao = botao.dataset.acao;

  if (acao === "link") {
    const url = `${location.origin}/feed.html?item=${chave}`;
    try { await navigator.clipboard.writeText(url); toast("Link copiado"); }
    catch { prompt("Copie o link:", url); }
    return;
  }
  if (!usuario) { toast("Entre com sua conta Google para interagir"); return entrar(); }

  if (acao === "denunciar") return abrirDenuncia(chave, item);

  if (acao === "excluir") {
    if (!confirm("Excluir este vídeo do feed?")) return;
    try { await excluirVideo(chave); item.remove(); toast("Vídeo excluído"); }
    catch (err) { toast(err.message); }
    return;
  }

  const ligado = botao.getAttribute("aria-pressed") === "true";
  const contagem = botao.querySelector(".contagem");
  botao.disabled = true;
  try {
    if (acao === "curtir") await curtirItem(chave, !ligado);
    if (acao === "republicar") await republicarItem(chave, !ligado);
    botao.setAttribute("aria-pressed", String(!ligado));
    contagem.textContent = Number(contagem.textContent) + (ligado ? -1 : 1);
    if (acao === "republicar") toast(ligado ? "Republicação desfeita" : "Republicado no seu perfil");
  } catch (err) { toast(err.message); }
  botao.disabled = false;
});

// ------------------------------------------------------------
// Publicar vídeo (criadores aprovados)
// ------------------------------------------------------------
function abrirPublicar() {
  const dialogo = document.getElementById("dialogo-publicar");
  const form = document.getElementById("form-publicar");
  const link = document.getElementById("pub-link");
  const erro = document.getElementById("pub-erro");
  const previa = document.getElementById("pub-previa");
  form.reset(); erro.hidden = true; previa.hidden = true; previa.innerHTML = "";
  dialogo.showModal();
  link.focus();

  link.oninput = () => {
    const v = videoIncorporavel(link.value);
    erro.hidden = !link.value.trim() || Boolean(v);
    erro.textContent = "Não reconheci esse link. Use um vídeo do YouTube, TikTok ou Instagram.";
    previa.hidden = !v;
    previa.innerHTML = v ? `<div class="video-criador ${v.vertical ? "vertical" : ""}"><iframe src="${esc(v.embed)}" title="Prévia do vídeo"></iframe></div>` : "";
  };
  document.getElementById("pub-cancelar").onclick = () => dialogo.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const botao = document.getElementById("pub-enviar");
    botao.disabled = true;
    try {
      await publicarVideo(link.value, document.getElementById("pub-legenda").value);
      dialogo.close();
      toast("Vídeo publicado no feed");
      // Recomeça o feed para mostrar o vídeo novo no topo
      feed.innerHTML = ""; carregados.clear(); ultimoCreatedAt = null; acabou = false;
      await carregarMais();
      feed.scrollTo({ top: 0 });
    } catch (err) {
      erro.textContent = err.message; erro.hidden = false;
    } finally {
      botao.disabled = false;
    }
  };
}

// ------------------------------------------------------------
// Denunciar
// ------------------------------------------------------------
function abrirDenuncia(chave, itemEl) {
  const dialogo = document.getElementById("dialogo-denuncia");
  const form = document.getElementById("form-denuncia");
  const motivos = document.getElementById("motivos-denuncia");
  motivos.innerHTML = `<legend class="sr-only">Motivo</legend>` + Object.entries(MOTIVOS_DENUNCIA).map(([id, nome], i) =>
    `<label class="check"><input type="radio" name="motivo" value="${id}" ${i === 0 ? "" : ""}> ${nome}</label>`).join("");
  form.reset();
  dialogo.showModal();
  document.getElementById("den-cancelar").onclick = () => dialogo.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const motivo = form.querySelector("[name=motivo]:checked")?.value;
    if (!motivo) { toast("Escolha o motivo da denúncia"); return; }
    const botao = document.getElementById("den-enviar");
    botao.disabled = true;
    try {
      await denunciar(chave, motivo, document.getElementById("den-detalhe").value);
      dialogo.close();
      toast("Denúncia enviada. Obrigado por ajudar a manter o AnimeSe seguro.");
      itemEl.querySelector('[data-acao="denunciar"]')?.setAttribute("disabled", "");
    } catch (err) {
      toast(err.message);
      if (/não existe mais/.test(err.message)) { dialogo.close(); itemEl.remove(); }
    } finally {
      botao.disabled = false;
    }
  };
}

// ------------------------------------------------------------
// Início: abre num item específico (link compartilhado) ou do topo
// ------------------------------------------------------------
const pedido = new URLSearchParams(location.search).get("item");
if (pedido && /^[co]:\d+$/.test(pedido)) {
  const item = await itemDoFeed(pedido).catch(() => null);
  if (item) {
    feed.querySelector(".feed-carregando")?.remove();
    await acrescentar([item]);
  }
}
await carregarMais();
