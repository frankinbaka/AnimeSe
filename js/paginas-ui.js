// ============================================================
// Peças de tela das Páginas da comunidade: cartão de publicação,
// curtir/apagar, imagem ampliada e o formulário de criar/editar página.
// ============================================================

import { esc, toast, entrar, caixaErro } from "./ui.js";
import { tempoAtras } from "./comunidade.js";
import { usuarioAtual } from "./store.js";
import { videoIncorporavel, REDES } from "./perfis.js";
import {
  curtir, republicar, apagarPublicacao, editarPublicacao, enviarImagem, pedirPagina, editarPagina, limparSlug,
  publicacoes, minhasCurtidas, minhasRepublicacoes, POR_VEZ,
} from "./paginas-dados.js";

/** Foto da página (ou a inicial do nome). */
export function avatarPagina(p, classe = "") {
  const inicial = esc((p?.name || "?").trim().charAt(0).toUpperCase());
  return p?.avatar_url
    ? `<span class="avatar-pagina ${classe}"><img src="${esc(p.avatar_url)}" alt="" loading="lazy"></span>`
    : `<span class="avatar-pagina ${classe}" aria-hidden="true">${inicial}</span>`;
}

/** Texto com quebras de linha e links clicáveis. */
function textoComLinks(texto = "") {
  return esc(texto).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (url) =>
    `<a href="${url}" target="_blank" rel="noopener nofollow ugc">${url.replace(/^https?:\/\//, "").slice(0, 60)}${url.length > 68 ? "…" : ""}</a>`);
}

export function cardPublicacao(post, { curtido = false, republicado = false, podeApagar = false, podeEditar = false, rotulo = "" } = {}) {
  const p = post.pagina;
  // O link do vídeo some do texto: fica só a prévia com play
  const video = previaVideo(post.body);
  const texto = video.link ? post.body.replace(video.link, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : post.body;
  return `
    <article class="publicacao" data-post="${post.id}">
      ${rotulo ? `<p class="publicacao-rotulo"><span aria-hidden="true">🔁</span> ${rotulo}</p>` : ""}
      <header class="publicacao-topo">
        <a href="pagina.html?p=${esc(p.slug)}" class="publicacao-autor">
          ${avatarPagina(p)}
          <span><strong>${esc(p.name)}</strong><small>@${esc(p.slug)} · <time datetime="${post.created_at}">${tempoAtras(post.created_at)}</time>${post.edited_at ? ` · <span title="Editada ${tempoAtras(post.edited_at)}">editada</span>` : ""}</small></span>
        </a>
        ${podeEditar || podeApagar ? `<div class="publicacao-menu">
          <button type="button" class="publicacao-mais" data-menu-post aria-label="Opções da publicação" aria-expanded="false">⋯</button>
          <div class="publicacao-opcoes" hidden>
            ${podeEditar ? `<button type="button" data-editar-post="${post.id}">✏️ Editar texto</button>` : ""}
            ${podeApagar ? `<button type="button" class="perigo" data-apagar-post="${post.id}">🗑️ Apagar publicação</button>` : ""}
          </div>
        </div>` : ""}
      </header>
      ${texto ? `<p class="publicacao-texto recolhido">${textoComLinks(texto)}</p>
        <button type="button" class="ver-mais" data-ver-mais hidden>Ver mais</button>` : ""}
      ${video.html}
      ${post.image_url ? `<button type="button" class="publicacao-imagem" data-ampliar="${esc(post.image_url)}" aria-label="Ver imagem em tamanho maior"><img src="${esc(post.image_url)}" alt="" loading="lazy"></button>` : ""}
      <footer class="publicacao-acoes">
        <button type="button" class="btn-curtir" data-curtir="${post.id}" aria-pressed="${curtido}" aria-label="${curtido ? "Descurtir" : "Curtir"}">
          <span aria-hidden="true">${curtido ? "♥" : "♡"}</span> <span class="n-curtidas">${post.likes_count || 0}</span>
        </button>
        <button type="button" class="btn-curtir btn-republicar" data-republicar="${post.id}" aria-pressed="${republicado}"
                aria-label="${republicado ? "Desfazer republicação" : "Republicar no seu perfil"}" title="${republicado ? "Desfazer republicação" : "Republicar no seu perfil"}">
          <span aria-hidden="true">🔁</span> <span class="n-republicacoes">${post.reposts_count || 0}</span>
        </button>
      </footer>
    </article>`;
}

/**
 * Liga curtir, apagar e ampliar imagem dentro de `container`.
 * obterPost(id) devolve o objeto da publicação; aoApagar(id) é chamado depois de apagar.
 */
export function ligarPublicacoes(container, { obterPost, aoApagar = () => {} }) {
  // Textos longos aparecem recolhidos, com "Ver mais"
  marcarTextosLongos(container);
  ajustarVideos(container);
  new MutationObserver(() => { marcarTextosLongos(container); ajustarVideos(container); }).observe(container, { childList: true });

  container.addEventListener("click", async (e) => {
    const bPlay = e.target.closest("[data-play]");
    if (bPlay) return tocarVideo(bPlay);
    const bMenu = e.target.closest("[data-menu-post]");
    if (bMenu) {
      const opcoes = bMenu.nextElementSibling;
      const abrir = opcoes.hidden;
      fecharMenus();
      opcoes.hidden = !abrir;
      bMenu.setAttribute("aria-expanded", String(abrir));
      return;
    }
    const bEditar = e.target.closest("[data-editar-post]");
    if (bEditar) {
      fecharMenus();
      const post = obterPost(Number(bEditar.dataset.editarPost));
      if (post) abrirEdicao(container, post, obterPost);
      return;
    }
    const bVerMais = e.target.closest("[data-ver-mais]");
    if (bVerMais) {
      const texto = bVerMais.previousElementSibling;
      const abrir = texto.classList.contains("recolhido");
      texto.classList.toggle("recolhido", !abrir);
      bVerMais.textContent = abrir ? "Ver menos" : "Ver mais";
      if (!abrir) bVerMais.closest(".publicacao")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }

    const bCurtir = e.target.closest("[data-curtir]");
    const bApagar = e.target.closest("[data-apagar-post]");
    const bImagem = e.target.closest("[data-ampliar]");
    const bRepublicar = e.target.closest("[data-republicar]");

    if (bRepublicar) {
      if (!(await usuarioAtual())) { toast("Entre com sua conta para republicar"); return entrar(); }
      const ligar = bRepublicar.getAttribute("aria-pressed") !== "true";
      const n = bRepublicar.querySelector(".n-republicacoes");
      const pintar = (on) => {
        bRepublicar.setAttribute("aria-pressed", String(on));
        const rotulo = on ? "Desfazer republicação" : "Republicar no seu perfil";
        bRepublicar.setAttribute("aria-label", rotulo);
        bRepublicar.title = rotulo;
        n.textContent = Math.max(0, Number(n.textContent) + (on ? 1 : -1));
      };
      pintar(ligar);
      bRepublicar.disabled = true;
      try {
        await republicar(Number(bRepublicar.dataset.republicar), ligar);
        toast(ligar ? "Republicado no seu perfil" : "Republicação desfeita");
      } catch (err) { pintar(!ligar); toast(err.message); }
      bRepublicar.disabled = false;
    }

    if (bCurtir) {
      if (!(await usuarioAtual())) { toast("Entre com sua conta para curtir"); return entrar(); }
      const ligar = bCurtir.getAttribute("aria-pressed") !== "true";
      const n = bCurtir.querySelector(".n-curtidas");
      // Atualiza na hora e desfaz se der erro
      const pintar = (on) => {
        bCurtir.setAttribute("aria-pressed", String(on));
        bCurtir.setAttribute("aria-label", on ? "Descurtir" : "Curtir");
        bCurtir.firstElementChild.textContent = on ? "♥" : "♡";
        n.textContent = Math.max(0, Number(n.textContent) + (on ? 1 : -1));
      };
      pintar(ligar);
      bCurtir.disabled = true;
      try { await curtir(Number(bCurtir.dataset.curtir), ligar); }
      catch (err) { pintar(!ligar); toast(err.message); }
      bCurtir.disabled = false;
    }

    if (bApagar) {
      fecharMenus();
      const post = obterPost(Number(bApagar.dataset.apagarPost));
      if (!post || !confirm("Apagar esta publicação? Não dá para desfazer.")) return;
      try {
        await apagarPublicacao(post);
        container.querySelector(`[data-post="${post.id}"]`)?.remove();
        aoApagar(post.id);
        toast("Publicação apagada");
      } catch (err) { toast(err.message); }
    }

    if (bImagem) ampliarImagem(bImagem.dataset.ampliar);
  });
}

/**
 * Primeiro link de vídeo (YouTube, TikTok ou Instagram) do texto vira uma prévia.
 * O player só carrega ao clicar em play: a página continua leve.
 */
function previaVideo(texto = "") {
  const links = (texto || "").match(/https?:\/\/[^\s<]+/g) || [];
  for (const link of links) {
    const limpo = link.replace(/[.,;:!?)\]'"]+$/, "");
    const v = videoIncorporavel(limpo);
    if (!v) continue;
    const idYoutube = v.rede === "youtube" ? v.embed.split("/embed/")[1] : null;
    const capa = idYoutube ? `<img src="https://i.ytimg.com/vi/${idYoutube}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">` : "";
    return { link: limpo, html: `
      <div class="publicacao-video ${v.vertical ? "vertical" : ""} rede-${v.rede}" ${v.rede !== "instagram" ? `data-formato="${esc(limpo)}"` : ""}>
        <button type="button" class="video-play" data-play="${esc(v.embed)}" data-rede="${v.rede}" aria-label="Assistir vídeo do ${REDES[v.rede].nome} aqui">
          ${capa}
          <span class="video-play-icone" aria-hidden="true">▶</span>
          ${capa ? "" : `<span class="video-play-rede">Vídeo do ${REDES[v.rede].nome}</span>`}
        </button>
      </div>` };
  }
  return { link: null, html: "" };
}

/**
 * Descobre o formato real do vídeo (deitado ou em pé) e a capa do TikTok,
 * para a prévia aparecer como o vídeo foi publicado.
 */
const formatos = new Map();
async function formatoDoVideo(url) {
  if (formatos.has(url)) return formatos.get(url);
  const chave = "animese:video2:" + url;
  let dados = null;
  try { dados = JSON.parse(sessionStorage.getItem(chave)); } catch {}
  const promessa = dados ? Promise.resolve(dados)
    : fetch(`/api/video?v=2&url=${encodeURIComponent(url)}`).then((r) => r.json()).catch(() => ({}))
        .then((d) => { try { sessionStorage.setItem(chave, JSON.stringify(d)); } catch {} return d; });
  formatos.set(url, promessa);
  return promessa;
}

function ajustarVideos(container) {
  container.querySelectorAll(".publicacao-video[data-formato]:not([data-ajustado])").forEach(async (caixa) => {
    caixa.dataset.ajustado = "1";
    const { largura, altura, capa } = await formatoDoVideo(caixa.dataset.formato);
    if (largura && altura) {
      caixa.classList.toggle("vertical", altura > largura);
      caixa.style.aspectRatio = `${largura} / ${altura}`;
    }
    const botao = caixa.querySelector(".video-play");
    if (capa && botao && !botao.querySelector("img")) {
      botao.insertAdjacentHTML("afterbegin", `<img src="${esc(capa)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`);
      botao.querySelector(".video-play-rede")?.remove();
    }
  });
}

function fecharMenus() {
  document.querySelectorAll(".publicacao-opcoes:not([hidden])").forEach((m) => {
    m.hidden = true;
    m.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}
document.addEventListener("click", (e) => { if (!e.target.closest(".publicacao-menu")) fecharMenus(); });

/** Troca o texto da publicação por uma caixa de edição. */
function abrirEdicao(container, post, obterPost) {
  const card = container.querySelector(`[data-post="${post.id}"]`);
  if (!card || card.querySelector(".editar-publicacao")) return;
  const form = document.createElement("form");
  form.className = "editar-publicacao";
  form.innerHTML = `
    <label class="sr-only" for="editar-${post.id}">Texto da publicação</label>
    <textarea id="editar-${post.id}" rows="5" maxlength="2000"></textarea>
    <div class="form-acoes">
      <button type="submit" class="btn btn-primario btn-pequeno">Salvar</button>
      <button type="button" class="btn btn-contorno btn-pequeno" data-cancelar>Cancelar</button>
    </div>`;
  const campo = form.querySelector("textarea");
  campo.value = post.body || "";
  card.querySelector(".publicacao-topo").after(form);
  card.querySelectorAll(".publicacao-texto, .ver-mais").forEach((el) => (el.hidden = true));
  campo.focus();
  form.querySelector("[data-cancelar]").addEventListener("click", () => {
    form.remove();
    card.querySelectorAll(".publicacao-texto").forEach((el) => (el.hidden = false));
    card.querySelectorAll(".ver-mais").forEach((el) => (el.hidden = !card.querySelector(".publicacao-texto.recolhido")));
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      const salvo = await editarPublicacao(post.id, campo.value);
      Object.assign(post, salvo);
      const curtido = card.querySelector("[data-curtir]")?.getAttribute("aria-pressed") === "true";
      const republicado = card.querySelector("[data-republicar]")?.getAttribute("aria-pressed") === "true";
      const rotulo = card.querySelector(".publicacao-rotulo")?.innerHTML.replace(/^<span[^>]*>🔁<\/span>\s*/, "") || "";
      const novo = document.createElement("div");
      novo.innerHTML = cardPublicacao(post, { curtido, republicado, podeApagar: true, podeEditar: true, rotulo });
      card.replaceWith(novo.firstElementChild);
      toast("Publicação editada");
    } catch (err) { toast(err.message); botao.disabled = false; }
  });
}

function tocarVideo(botao) {
  const { play: embed, rede } = botao.dataset;
  const extra = rede === "youtube" ? "?autoplay=1&rel=0&playsinline=1" : rede === "tiktok" ? "&autoplay=1" : "";
  const iframe = document.createElement("iframe");
  iframe.src = embed + extra;
  iframe.title = `Vídeo do ${REDES[rede]?.nome || "vídeo"}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";
  iframe.allowFullscreen = true;
  botao.replaceWith(iframe);
}

/** Mostra "Ver mais" só nos textos que passam do limite. */
function marcarTextosLongos(container) {
  requestAnimationFrame(() => {
    container.querySelectorAll(".publicacao-texto.recolhido:not([data-medido])").forEach((p) => {
      p.dataset.medido = "1";
      if (p.scrollHeight > p.clientHeight + 4) p.nextElementSibling.hidden = false;
      else p.classList.remove("recolhido");
    });
  });
}

function ampliarImagem(url) {
  let d = document.getElementById("dialogo-imagem");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "dialogo-imagem";
    d.className = "dialogo-imagem";
    d.addEventListener("click", () => d.close());
    document.body.append(d);
  }
  d.innerHTML = `<img src="${esc(url)}" alt=""><button type="button" class="fechar-dialogo" aria-label="Fechar">×</button>`;
  d.showModal();
}

// ------------------------------------------------------------
// Formulário: criar (pedido) ou editar página
// ------------------------------------------------------------
export function formularioPagina(pagina = null) {
  const editando = Boolean(pagina);
  const slugTravado = pagina?.status === "approved";
  return `
    <form class="formulario form-pagina" novalidate>
      <div class="form-pagina-foto">
        <span class="previa-avatar-pagina">${avatarPagina(pagina || { name: "?" }, "grande")}</span>
        <div>
          <label class="btn btn-contorno btn-pequeno">
            Escolher foto
            <input type="file" accept="image/jpeg,image/png,image/webp" name="foto" hidden>
          </label>
          <p class="dica">Quadrada fica melhor. Ela é reduzida automaticamente.</p>
        </div>
      </div>
      <label class="campo">
        <span>Nome da página</span>
        <input name="nome" maxlength="50" required value="${esc(pagina?.name || "")}" placeholder="Ex.: Notícias de Anime BR">
      </label>
      <label class="campo">
        <span>@ da página</span>
        <span class="campo-arroba"><span aria-hidden="true">@</span><input name="slug" maxlength="30" required value="${esc(pagina?.slug || "")}" ${slugTravado ? "readonly" : ""} placeholder="noticias_anime"></span>
        <small class="dica">${slugTravado ? "O @ não muda depois da aprovação." : "De 3 a 30 letras minúsculas, números, ponto ou _. É o endereço da página."}</small>
      </label>
      <label class="campo">
        <span>Descrição <small>(opcional)</small></span>
        <textarea name="descricao" rows="3" maxlength="500" placeholder="Sobre o que é a página?">${esc(pagina?.description || "")}</textarea>
      </label>
      ${editando ? "" : `<p class="dica">O pedido vai para o admin do AnimeSe. Depois de aprovada, a página já pode publicar e ser seguida.</p>`}
      <div class="form-acoes">
        <button type="submit" class="btn btn-primario">${editando ? (pagina.status === "rejected" ? "Salvar e enviar de novo" : "Salvar") : "Enviar pedido"}</button>
        <button type="button" class="btn btn-contorno" data-cancelar>Cancelar</button>
      </div>
    </form>`;
}

/** Liga o formulário. aoSalvar(pagina) recebe a página salva; aoCancelar() fecha. */
export function ligarFormularioPagina(form, pagina, { aoSalvar, aoCancelar }) {
  let fotoUrl = pagina?.avatar_url || null;
  let fotoArquivo = null;
  const nome = form.elements.nome;
  const slug = form.elements.slug;
  let slugMexido = Boolean(pagina);

  nome.addEventListener("input", () => { if (!slugMexido) slug.value = limparSlug(nome.value); });
  slug.addEventListener("input", () => { slugMexido = true; slug.value = limparSlug(slug.value); });
  form.elements.foto.addEventListener("change", () => {
    fotoArquivo = form.elements.foto.files[0] || null;
    if (!fotoArquivo) return;
    const url = URL.createObjectURL(fotoArquivo);
    form.querySelector(".previa-avatar-pagina").innerHTML = `<span class="avatar-pagina grande"><img src="${url}" alt=""></span>`;
  });
  form.querySelector("[data-cancelar]").addEventListener("click", aoCancelar);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const botao = form.querySelector('[type="submit"]');
    const textoBotao = botao.textContent;
    if (nome.value.trim().length < 3) return toast("O nome deve ter pelo menos 3 caracteres");
    if (!/^[a-z0-9_.]{3,30}$/.test(slug.value)) return toast("O @ deve ter de 3 a 30 letras minúsculas, números, ponto ou _");
    botao.disabled = true;
    try {
      if (fotoArquivo) { botao.textContent = "Enviando foto…"; fotoUrl = await enviarImagem(fotoArquivo, { tipo: "avatar" }); }
      botao.textContent = "Salvando…";
      const dados = { nome: nome.value, slug: slug.value, descricao: form.elements.descricao.value, avatar: fotoUrl };
      const salva = pagina ? await editarPagina(pagina.id, dados) : await pedirPagina(dados);
      aoSalvar(salva);
    } catch (err) {
      toast(err.message);
    }
    botao.disabled = false;
    botao.textContent = textoBotao;
  });
}

// ------------------------------------------------------------
// Lista de publicações (feed e página)
// ------------------------------------------------------------
/** Lista de publicações com "carregar mais", curtidas e apagar. */
export async function listaDePublicacoes(container, { paginas = null, eu = null, souAdmin = false, textoVazio = "Ainda não há publicações." }) {
  container.innerHTML = `<div class="lista-publicacoes"><p class="secao-descricao">Carregando…</p></div>
    <div class="carregar-mais"><button type="button" class="btn btn-contorno btn-mais" hidden>Carregar mais</button></div>`;
  const lista = container.querySelector(".lista-publicacoes");
  const botaoMais = container.querySelector(".btn-mais");
  const posts = new Map();
  let ultimo = null;
  let primeiraVez = true;

  ligarPublicacoes(lista, {
    obterPost: (id) => posts.get(id),
    aoApagar: (id) => { posts.delete(id); if (!lista.querySelector(".publicacao")) lista.innerHTML = vazio(); },
  });
  const vazio = () => `<p class="vazio">${textoVazio}</p>`;

  const carregar = async () => {
    botaoMais.disabled = true;
    try {
      const novos = await publicacoes({ paginas, antesDe: ultimo });
      const ids = novos.map((p) => p.id);
      const [curtidas, republicadas] = await Promise.all([minhasCurtidas(ids), minhasRepublicacoes(ids)]);
      if (primeiraVez) { lista.innerHTML = novos.length ? "" : vazio(); primeiraVez = false; }
      lista.insertAdjacentHTML("beforeend", novos.map((p) => {
        posts.set(p.id, p);
        return cardPublicacao(p, { curtido: curtidas.has(p.id), republicado: republicadas.has(p.id), podeApagar: souAdmin || p.pagina.owner_id === eu?.id, podeEditar: p.pagina.owner_id === eu?.id });
      }).join(""));
      if (novos.length) ultimo = novos[novos.length - 1].created_at;
      botaoMais.hidden = novos.length < POR_VEZ;
    } catch (e) {
      if (primeiraVez) lista.innerHTML = caixaErro(e.message); else toast(e.message);
    }
    botaoMais.disabled = false;
  };
  botaoMais.addEventListener("click", carregar);
  await carregar();
  return {
    /** Põe uma publicação recém-criada no topo. */
    adicionar(post) {
      posts.set(post.id, post);
      lista.querySelector(".vazio")?.remove();
      lista.insertAdjacentHTML("afterbegin", cardPublicacao(post, { podeApagar: true, podeEditar: true }));
    },
  };
}
