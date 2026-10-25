// ============================================================
// Peças de tela das Páginas da comunidade: cartão de publicação,
// curtir/apagar, imagem ampliada e o formulário de criar/editar página.
// ============================================================

import { esc, toast, entrar, caixaErro } from "./ui.js";
import { tempoAtras } from "./comunidade.js";
import { usuarioAtual } from "./store.js";
import { curtir, apagarPublicacao, enviarImagem, pedirPagina, editarPagina, limparSlug, publicacoes, minhasCurtidas, POR_VEZ } from "./paginas-dados.js";

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

export function cardPublicacao(post, { curtido = false, podeApagar = false } = {}) {
  const p = post.pagina;
  return `
    <article class="publicacao" data-post="${post.id}">
      <header class="publicacao-topo">
        <a href="pagina.html?p=${esc(p.slug)}" class="publicacao-autor">
          ${avatarPagina(p)}
          <span><strong>${esc(p.name)}</strong><small>@${esc(p.slug)} · <time datetime="${post.created_at}">${tempoAtras(post.created_at)}</time></small></span>
        </a>
        ${podeApagar ? `<button type="button" class="publicacao-apagar" data-apagar-post="${post.id}" aria-label="Apagar publicação" title="Apagar publicação">×</button>` : ""}
      </header>
      ${post.body ? `<p class="publicacao-texto">${textoComLinks(post.body)}</p>` : ""}
      ${post.image_url ? `<button type="button" class="publicacao-imagem" data-ampliar="${esc(post.image_url)}" aria-label="Ver imagem em tamanho maior"><img src="${esc(post.image_url)}" alt="" loading="lazy"></button>` : ""}
      <footer class="publicacao-acoes">
        <button type="button" class="btn-curtir" data-curtir="${post.id}" aria-pressed="${curtido}" aria-label="${curtido ? "Descurtir" : "Curtir"}">
          <span aria-hidden="true">${curtido ? "♥" : "♡"}</span> <span class="n-curtidas">${post.likes_count || 0}</span>
        </button>
      </footer>
    </article>`;
}

/**
 * Liga curtir, apagar e ampliar imagem dentro de `container`.
 * obterPost(id) devolve o objeto da publicação; aoApagar(id) é chamado depois de apagar.
 */
export function ligarPublicacoes(container, { obterPost, aoApagar = () => {} }) {
  container.addEventListener("click", async (e) => {
    const bCurtir = e.target.closest("[data-curtir]");
    const bApagar = e.target.closest("[data-apagar-post]");
    const bImagem = e.target.closest("[data-ampliar]");

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
      const curtidas = await minhasCurtidas(novos.map((p) => p.id));
      if (primeiraVez) { lista.innerHTML = novos.length ? "" : vazio(); primeiraVez = false; }
      lista.insertAdjacentHTML("beforeend", novos.map((p) => {
        posts.set(p.id, p);
        return cardPublicacao(p, { curtido: curtidas.has(p.id), podeApagar: souAdmin || p.pagina.owner_id === eu?.id });
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
      lista.insertAdjacentHTML("afterbegin", cardPublicacao(post, { podeApagar: true }));
    },
  };
}
