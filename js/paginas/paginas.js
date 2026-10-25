// Feed das páginas da comunidade: Seguindo, Descobrir, Páginas e Minhas páginas.
import { montarLayout, esc, caixaErro, toast, entrar, formatarNumero } from "../ui.js";
import { usuarioAtual, lerPerfil } from "../store.js";
import { PAGINAS_ATIVAS } from "../config.js";
import {
  paginasQueSigo, seguirPagina, listarPaginas, minhasPaginas, apagarPagina, STATUS_PAGINA,
} from "../paginas-dados.js";
import { avatarPagina, formularioPagina, ligarFormularioPagina, listaDePublicacoes } from "../paginas-ui.js";

await montarLayout();

const alvo = document.getElementById("conteudo-feed");
const params = new URLSearchParams(location.search);
const eu = await usuarioAtual();
const souAdmin = eu ? (await lerPerfil().catch(() => null))?.papel === "admin" : false;

if (!PAGINAS_ATIVAS) {
  alvo.innerHTML = `<div class="vazio"><h2>O feed está desativado no momento</h2><p>Volte daqui a pouco.</p></div>`;
} else {
  iniciar();
}

async function iniciar() {
  let sigo = await paginasQueSigo().catch(() => new Set());
  const abas = [
    { id: "seguindo", nome: "Seguindo" },
    { id: "descobrir", nome: "Descobrir" },
    { id: "paginas", nome: "Páginas" },
    ...(eu ? [{ id: "minhas", nome: "Minha página" }] : []),
  ];
  let ativa = params.get("aba");
  if (!abas.some((a) => a.id === ativa)) ativa = eu && sigo.size ? "seguindo" : "descobrir";

  alvo.innerHTML = `
    <div class="abas" role="tablist" id="abas-feed">
      ${abas.map((a) => `<button class="aba" role="tab" data-aba="${a.id}" aria-selected="${a.id === ativa}">${a.nome}</button>`).join("")}
    </div>
    <div id="painel-feed" role="tabpanel"></div>`;
  const painel = alvo.querySelector("#painel-feed");

  const abrir = (id) => {
    ativa = id;
    alvo.querySelectorAll(".aba").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === id)));
    history.replaceState(null, "", `paginas.html?aba=${id}`);
    render[id]();
  };
  alvo.querySelector("#abas-feed").addEventListener("click", (e) => { const b = e.target.closest(".aba"); if (b) abrir(b.dataset.aba); });

  const render = {
    seguindo() {
      if (!eu) {
        painel.innerHTML = `<div class="vazio"><h2>Entre para montar seu feed</h2><p>Siga páginas e as publicações delas aparecem aqui.</p>
          <button class="btn btn-primario" id="btn-entrar-feed">Entrar com Google</button></div>`;
        painel.querySelector("#btn-entrar-feed").addEventListener("click", entrar);
        return;
      }
      if (!sigo.size) {
        painel.innerHTML = `<div class="vazio"><h2>Você ainda não segue nenhuma página</h2><p>Encontre páginas sobre os animes que você curte.</p>
          <button class="btn btn-primario" data-ir="paginas">Ver páginas</button></div>`;
        painel.querySelector("[data-ir]").addEventListener("click", () => abrir("paginas"));
        return;
      }
      listaDePublicacoes(painel, { paginas: [...sigo], eu, souAdmin, textoVazio: "As páginas que você segue ainda não publicaram nada." });
    },
    descobrir() {
      listaDePublicacoes(painel, { eu, souAdmin });
    },
    async paginas() {
      painel.innerHTML = `
        <form class="busca-paginas" role="search">
          <label class="sr-only" for="busca-pagina">Buscar página</label>
          <input id="busca-pagina" type="search" placeholder="Buscar página por nome ou @…" autocomplete="off">
        </form>
        <div class="grade-paginas" id="grade-paginas"><p class="secao-descricao">Carregando…</p></div>`;
      const grade = painel.querySelector("#grade-paginas");
      const mostrar = async (busca = "") => {
        try {
          const lista = await listarPaginas({ busca });
          grade.innerHTML = lista.length ? lista.map((p) => cartaoPagina(p, sigo.has(p.id))).join("")
            : `<p class="vazio">${busca ? "Nenhuma página encontrada." : "Ainda não há páginas aprovadas. Que tal criar a primeira?"}</p>`;
        } catch (e) { grade.innerHTML = caixaErro(e.message); }
      };
      let timer;
      painel.querySelector("#busca-pagina").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => mostrar(e.target.value), 300); });
      painel.querySelector(".busca-paginas").addEventListener("submit", (e) => e.preventDefault());
      grade.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-seguir]");
        if (!b) return;
        e.preventDefault();
        if (!eu) { toast("Entre com sua conta para seguir páginas"); return entrar(); }
        const ligar = b.getAttribute("aria-pressed") !== "true";
        b.disabled = true;
        try {
          await seguirPagina(b.dataset.seguir, ligar);
          ligar ? sigo.add(b.dataset.seguir) : sigo.delete(b.dataset.seguir);
          b.setAttribute("aria-pressed", String(ligar));
          b.textContent = ligar ? "Seguindo" : "Seguir";
          b.classList.toggle("btn-primario", !ligar);
          b.classList.toggle("btn-contorno", ligar);
          const n = b.closest(".cartao-pagina").querySelector(".n-seguidores");
          n.textContent = formatarNumero(Math.max(0, Number(n.dataset.n) + (ligar ? 1 : -1)));
          n.dataset.n = Math.max(0, Number(n.dataset.n) + (ligar ? 1 : -1));
        } catch (err) { toast(err.message); }
        b.disabled = false;
      });
      mostrar();
    },
    async minhas() {
      painel.innerHTML = `<p class="secao-descricao">Carregando…</p>`;
      let lista;
      try { lista = await minhasPaginas(); } catch (e) { painel.innerHTML = caixaErro(e.message); return; }
      painel.innerHTML = `
        <div class="minhas-paginas">
          ${lista.map((p) => `
            <article class="minha-pagina" data-id="${p.id}">
              ${avatarPagina(p)}
              <div class="minha-pagina-info">
                <strong>${esc(p.name)}</strong> <small>@${esc(p.slug)}</small>
                <div><span class="selo selo-pagina-${p.status}">${STATUS_PAGINA[p.status]}</span>
                  ${p.status === "approved" ? `<small>${formatarNumero(p.followers_count)} seguidores · ${formatarNumero(p.posts_count)} publicações</small>` : ""}</div>
                ${p.admin_note && p.status !== "approved" ? `<p class="nota-admin">Recado do admin: ${esc(p.admin_note)}</p>` : ""}
                ${p.status === "pending" ? `<p class="dica">O admin vai analisar seu pedido. Você recebe a resposta aqui.</p>` : ""}
              </div>
              <div class="minha-pagina-acoes">
                ${p.status === "approved" ? `<a class="btn btn-primario btn-pequeno" href="pagina.html?p=${esc(p.slug)}">Abrir e publicar</a>` : ""}
                ${p.status !== "suspended" ? `<button type="button" class="btn btn-contorno btn-pequeno" data-editar="${p.id}">Editar</button>` : ""}
                <button type="button" class="btn-link-perigo" data-apagar-pagina="${p.id}">${p.status === "pending" ? "Cancelar pedido" : "Apagar"}</button>
              </div>
            </article>`).join("") || `<p class="secao-descricao">Você ainda não tem uma página. Com ela, você publica textos e imagens para quem seguir.</p>`}
        </div>
        <div id="area-form-pagina">
          ${!lista.length ? `<button type="button" class="btn btn-primario" id="btn-nova-pagina">+ Criar uma página</button>`
            : lista.some((p) => p.status === "rejected") ? `<p class="dica">Edite o pedido recusado seguindo o recado do admin e envie de novo.</p>`
            : `<p class="dica">Cada conta pode ter uma página.</p>`}
        </div>`;

      const area = painel.querySelector("#area-form-pagina");
      const abrirForm = (pagina = null) => {
        area.innerHTML = `<h2 class="titulo-bloco">${pagina ? `Editar ${esc(pagina.name)}` : "Pedir uma nova página"}</h2>${formularioPagina(pagina)}`;
        ligarFormularioPagina(area.querySelector("form"), pagina, {
          aoSalvar: () => { toast(pagina ? "Página salva" : "Pedido enviado! Aguarde a aprovação do admin."); render.minhas(); },
          aoCancelar: () => render.minhas(),
        });
        area.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      area.querySelector("#btn-nova-pagina")?.addEventListener("click", () => abrirForm());
      painel.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirForm(lista.find((p) => p.id === b.dataset.editar))));
      painel.querySelectorAll("[data-apagar-pagina]").forEach((b) => b.addEventListener("click", async () => {
        const p = lista.find((x) => x.id === b.dataset.apagarPagina);
        if (!confirm(p.status === "pending" ? "Cancelar o pedido desta página?" : `Apagar a página "${p.name}" com todas as publicações? Não dá para desfazer.`)) return;
        try { await apagarPagina(p.id); toast("Pronto"); render.minhas(); } catch (e) { toast(e.message); }
      }));
      if (params.get("criar") === "1" && !lista.length) { params.delete("criar"); abrirForm(); }
    },
  };

  abrir(ativa);
}

function cartaoPagina(p, sigo) {
  return `
    <a class="cartao-pagina" href="pagina.html?p=${esc(p.slug)}">
      ${avatarPagina(p, "grande")}
      <strong>${esc(p.name)}</strong>
      <small>@${esc(p.slug)}</small>
      ${p.description ? `<p>${esc(p.description.length > 110 ? p.description.slice(0, 110) + "…" : p.description)}</p>` : ""}
      <span class="cartao-pagina-numeros"><span class="n-seguidores" data-n="${p.followers_count}">${formatarNumero(p.followers_count)}</span> seguidores</span>
      ${eu?.id === p.owner_id ? `<span class="selo selo-voce">Sua página</span>`
        : `<button type="button" class="btn ${sigo ? "btn-contorno" : "btn-primario"} btn-pequeno" data-seguir="${p.id}" aria-pressed="${sigo}">${sigo ? "Seguindo" : "Seguir"}</button>`}
    </a>`;
}
