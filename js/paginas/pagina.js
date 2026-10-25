// Página da comunidade: perfil, seguir, publicações e (para o dono) publicar.
import { montarLayout, esc, caixaErro, toast, entrar, formatarNumero, avatarHtml, nomeComTag } from "../ui.js";
import { usuarioAtual, lerPerfil, clienteSupabase } from "../store.js";
import { PAGINAS_ATIVAS } from "../config.js";
import { paginaPorSlug, paginasQueSigo, seguirPagina, publicar, enviarImagem, apagarImagem, STATUS_PAGINA } from "../paginas-dados.js";
import { avatarPagina, listaDePublicacoes, formularioPagina, ligarFormularioPagina } from "../paginas-ui.js";

await montarLayout();

const alvo = document.getElementById("pagina-publica");
const slug = new URLSearchParams(location.search).get("p") || "";
const eu = await usuarioAtual();
const souAdmin = eu ? (await lerPerfil().catch(() => null))?.papel === "admin" : false;

try {
  if (!PAGINAS_ATIVAS) throw new Error("As páginas estão desativadas no momento.");
  const pagina = slug ? await paginaPorSlug(slug) : null;
  if (!pagina) {
    alvo.innerHTML = `<div class="vazio" style="margin-top:32px"><h2>Página não encontrada</h2><p>O link pode estar errado ou a página foi removida.</p>
      <a class="btn btn-primario" href="paginas.html?aba=paginas">Ver páginas</a></div>`;
  } else {
    await mostrar(pagina);
  }
} catch (e) {
  alvo.innerHTML = `<div style="margin-top:32px">${caixaErro(e.message)}</div>`;
}

async function mostrar(p) {
  document.title = `${p.name} — AnimeSe`;
  const souDono = eu?.id === p.owner_id;
  const aprovada = p.status === "approved";
  const sigo = (await paginasQueSigo().catch(() => new Set())).has(p.id);
  let seguidores = p.followers_count;

  // Quem administra a página
  const { data: dono } = await clienteSupabase().from("profiles")
    .select("id, nickname, tag, display_name, avatar_url, favorite_title").eq("id", p.owner_id).maybeSingle();
  const nomeDono = dono?.nickname || dono?.display_name?.split(" ")[0] || "Usuário";

  alvo.innerHTML = `
    ${!aprovada ? `<div class="aviso" style="margin-top:24px">Esta página está <strong>${STATUS_PAGINA[p.status].toLowerCase()}</strong>. Só você${souAdmin && !souDono ? " (admin)" : ""} consegue vê-la.</div>` : ""}
    <header class="pagina-cabecalho">
      ${avatarPagina(p, "enorme")}
      <div class="pagina-identidade">
        <h1>${esc(p.name)}</h1>
        <p class="pagina-arroba">@${esc(p.slug)}</p>
        ${p.description ? `<p class="perfil-bio">${esc(p.description)}</p>` : ""}
        <p class="pagina-numeros"><strong id="n-seguidores">${formatarNumero(seguidores)}</strong> <span id="rotulo-seguidores">${seguidores === 1 ? "seguidor" : "seguidores"}</span> · <strong>${formatarNumero(p.posts_count)}</strong> publicações</p>
        ${dono ? `<p class="pagina-dono">Administrada por <a href="usuario.html?id=${dono.id}">${avatarHtml(dono.avatar_url, nomeDono)} ${nomeComTag(nomeDono, dono.tag, dono.favorite_title)}</a></p>` : ""}
        <div class="pagina-botoes">
          ${souDono ? `<button type="button" class="btn btn-contorno" id="btn-editar-pagina">Editar página</button>`
            : aprovada ? `<button type="button" class="btn ${sigo ? "btn-contorno" : "btn-primario"}" id="btn-seguir-pagina" aria-pressed="${sigo}">${sigo ? "Seguindo" : "Seguir"}</button>` : ""}
        </div>
      </div>
    </header>
    <div id="area-editar"></div>
    ${souDono && aprovada ? compositor() : ""}
    <h2 class="titulo-bloco">Publicações</h2>
    <div id="publicacoes-pagina"></div>`;

  const lista = await listaDePublicacoes(alvo.querySelector("#publicacoes-pagina"), {
    paginas: [p.id], eu, souAdmin,
    textoVazio: souDono ? "Sua página ainda não publicou nada. Escreva a primeira publicação aí em cima!" : "Esta página ainda não publicou nada.",
  });

  // Seguir
  alvo.querySelector("#btn-seguir-pagina")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (!eu) { toast("Entre com sua conta para seguir páginas"); return entrar(); }
    const ligar = b.getAttribute("aria-pressed") !== "true";
    b.disabled = true;
    try {
      await seguirPagina(p.id, ligar);
      seguidores = Math.max(0, seguidores + (ligar ? 1 : -1));
      b.setAttribute("aria-pressed", String(ligar));
      b.textContent = ligar ? "Seguindo" : "Seguir";
      b.classList.toggle("btn-primario", !ligar);
      b.classList.toggle("btn-contorno", ligar);
      alvo.querySelector("#n-seguidores").textContent = formatarNumero(seguidores);
      alvo.querySelector("#rotulo-seguidores").textContent = seguidores === 1 ? "seguidor" : "seguidores";
      toast(ligar ? `Agora você segue ${p.name}. As publicações aparecem no seu feed.` : `Você deixou de seguir ${p.name}`);
    } catch (err) { toast(err.message); }
    b.disabled = false;
  });

  // Editar
  alvo.querySelector("#btn-editar-pagina")?.addEventListener("click", () => {
    const area = alvo.querySelector("#area-editar");
    area.innerHTML = formularioPagina(p);
    ligarFormularioPagina(area.querySelector("form"), p, {
      aoSalvar: () => { toast("Página salva"); location.reload(); },
      aoCancelar: () => { area.innerHTML = ""; },
    });
    area.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Publicar
  const form = alvo.querySelector("#form-publicar");
  if (form) ligarCompositor(form, p, lista);
}

function compositor() {
  return `
    <form class="compositor" id="form-publicar">
      <label class="sr-only" for="texto-publicacao">Nova publicação</label>
      <textarea id="texto-publicacao" rows="3" maxlength="2000" placeholder="Escreva uma publicação para quem segue a página…"></textarea>
      <div class="compositor-previa" id="previa-imagem" hidden></div>
      <div class="compositor-barra">
        <label class="btn btn-contorno btn-pequeno" title="Adicionar imagem ou GIF">
          🖼️ Imagem
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="arquivo-publicacao" hidden>
        </label>
        <span class="compositor-contador" id="contador-publicacao">0/2000</span>
        <button type="submit" class="btn btn-primario">Publicar</button>
      </div>
    </form>`;
}

function ligarCompositor(form, pagina, lista) {
  const texto = form.querySelector("#texto-publicacao");
  const arquivo = form.querySelector("#arquivo-publicacao");
  const previa = form.querySelector("#previa-imagem");
  const contador = form.querySelector("#contador-publicacao");
  let escolhido = null;

  texto.addEventListener("input", () => { contador.textContent = `${texto.value.length}/2000`; });
  arquivo.addEventListener("change", () => {
    escolhido = arquivo.files[0] || null;
    if (!escolhido) return;
    previa.hidden = false;
    previa.innerHTML = `<img src="${URL.createObjectURL(escolhido)}" alt=""><button type="button" class="fechar-dialogo" aria-label="Tirar imagem">×</button>`;
    previa.querySelector("button").addEventListener("click", () => { escolhido = null; arquivo.value = ""; previa.hidden = true; previa.innerHTML = ""; });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!texto.value.trim() && !escolhido) return toast("Escreva algo ou escolha uma imagem");
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    let url = null;
    try {
      if (escolhido) { botao.textContent = "Enviando imagem…"; url = await enviarImagem(escolhido); }
      botao.textContent = "Publicando…";
      const post = await publicar(pagina.id, { texto: texto.value, imagem: url });
      lista.adicionar(post);
      texto.value = ""; contador.textContent = "0/2000";
      escolhido = null; arquivo.value = ""; previa.hidden = true; previa.innerHTML = "";
      toast("Publicado!");
    } catch (err) {
      if (url) apagarImagem(url); // não deixa imagem órfã
      toast(err.message);
    }
    botao.disabled = false;
    botao.textContent = "Publicar";
  });
}
