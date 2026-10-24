// ============================================================
// Peças de interface compartilhadas: cabeçalho, rodapé, cards,
// avisos e a tag do anime favorito.
// ============================================================

import { NOME_DO_SITE, AUTOR_DO_SITE } from "./config.js";
import { usuarioAtual, lerPerfil, entrarComGoogle, sair, MODO_DEMO, nomeStatus, clienteSupabase } from "./store.js";

/** Escapa texto vindo da API antes de inserir no HTML. */
export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const formatarNumero = (n) => (n == null ? "—" : n.toLocaleString("pt-BR"));
export const formatarNota = (n) => (n ? n.toFixed(2).replace(".", ",") : "—");

// ------------------------------------------------------------
// Tag do anime favorito
// ------------------------------------------------------------

/**
 * Sugere uma sigla a partir do nome do anime, usando a inicial
 * de cada palavra: "Sword Art Online" → "SAO".
 * O usuário pode editar a sugestão no perfil.
 */
export function sugerirTag(titulo = "") {
  const palavras = titulo
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (palavras.length === 1) return palavras[0].slice(0, 4).toUpperCase();
  return palavras.map((p) => p[0]).join("").slice(0, 5).toUpperCase();
}

/** Limpa a tag digitada: só letras e números, até 5 caracteres. */
export const limparTag = (t = "") => t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

/** Nome do usuário com a tag ao lado. */
export function nomeComTag(nick, tag, favorito = "", href = null) {
  const tagHtml = tag ? `<span class="tag-anime" title="Anime favorito: ${esc(favorito)}">${esc(tag)}</span>` : "";
  // Com href, o nome vira link para o perfil público da pessoa
  return href
    ? `<a class="nome-usuario link-usuario" href="${esc(href)}">${esc(nick)}${tagHtml}</a>`
    : `<span class="nome-usuario">${esc(nick)}${tagHtml}</span>`;
}

export function avatarHtml(url, nome = "?") {
  if (url) return `<img class="avatar" src="${esc(url)}" alt="" referrerpolicy="no-referrer">`;
  return `<span class="avatar" aria-hidden="true">${esc((nome || "?").trim()[0]?.toUpperCase() || "?")}</span>`;
}

// ------------------------------------------------------------
// Cards de anime
// ------------------------------------------------------------

export function cardAnime(a, { status = null, contagem = null } = {}) {
  const detalhes = [a.tipo, a.episodios ? `${a.episodios} ep.` : null].filter(Boolean).join(", ");
  return `
    <a class="card-anime" href="anime.html?id=${a.id}">
      <div class="poster">
        <img src="${esc(a.imagem)}" alt="" loading="lazy">
        ${a.nota ? `<span class="nota" aria-label="Nota ${formatarNota(a.nota)}">★ ${formatarNota(a.nota)}</span>` : ""}
        ${status ? `<span class="status-pill st-${status}">${nomeStatus(status)}</span>` : ""}
        ${contagem ? `<span class="contagem" title="${contagem} ${contagem === 1 ? "pessoa sugeriu" : "pessoas sugeriram"}">${contagem} ${contagem === 1 ? "sugestão" : "sugestões"}</span>` : ""}
      </div>
      <h3>${esc(a.titulo)}</h3>
      ${detalhes ? `<p class="detalhe">${esc(detalhes)}</p>` : ""}
    </a>`;
}

export function esqueletos(qtd = 12) {
  return Array.from({ length: qtd }, () =>
    `<div class="card-anime esqueleto" aria-hidden="true"><div class="poster"></div><div class="linha"></div></div>`
  ).join("");
}

export function caixaErro(msg) {
  return `<div class="erro-caixa" role="alert">${esc(msg)}</div>`;
}

// ------------------------------------------------------------
// Toast
// ------------------------------------------------------------
let timerToast;
export function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add("visivel");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.remove("visivel"), 2600);
}

// ------------------------------------------------------------
// Cabeçalho e rodapé
// ------------------------------------------------------------

const LINKS = [
  { href: "index.html", texto: "Início" },
  { href: "novidades.html", texto: "Novidades" },
  { href: "buscar.html", texto: "Buscar" },
  { href: "sortear.html", texto: "O que assistir?" },
  { href: "comunidade.html", texto: "Comunidade" },
  { href: "lista.html", texto: "Minha lista" },
];

export async function montarLayout() {
  const pagina = location.pathname.split("/").pop() || "index.html";
  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");

  header.className = "site-header";
  header.innerHTML = `
    <div class="container">
      <button class="menu-toggle" aria-label="Abrir menu" aria-expanded="false">☰</button>
      <a class="logo" href="index.html"><span class="logo-marca" aria-hidden="true">ア</span>${esc(NOME_DO_SITE)}</a>
      <nav class="nav-principal" aria-label="Principal">
        ${LINKS.map((l) => `<a href="${l.href}" ${pagina === l.href ? 'aria-current="page"' : ""}>${l.texto}</a>`).join("")}
      </nav>
      <form class="busca-rapida" action="buscar.html" role="search">
        <label class="sr-only" for="busca-topo">Buscar anime</label>
        <input id="busca-topo" name="q" type="search" placeholder="Buscar anime…" autocomplete="off">
      </form>
      <div class="menu-usuario" id="menu-usuario"></div>
    </div>`;

  const toggle = header.querySelector(".menu-toggle");
  const nav = header.querySelector(".nav-principal");
  toggle.addEventListener("click", () => {
    const aberto = nav.classList.toggle("aberto");
    toggle.setAttribute("aria-expanded", aberto);
  });

  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="container">
      <p>Dados de animes fornecidos pelo <a href="https://myanimelist.net" target="_blank" rel="noopener">MyAnimeList</a>
      através da API oficial.
      ${esc(NOME_DO_SITE)} não tem ligação oficial com o MyAnimeList.</p>
      <p class="copyright">© ${new Date().getFullYear()} ${esc(NOME_DO_SITE)}. Desenvolvido por ${esc(AUTOR_DO_SITE)}. Todos os direitos reservados.</p>
    </div>`;

  if (MODO_DEMO) {
    document.querySelector("main")?.insertAdjacentHTML(
      "afterbegin",
      `<div class="container"><div class="aviso"><strong>Modo demonstração.</strong>
       O login é simulado e seus dados ficam só neste navegador. Configure o Supabase em
       <code>js/config.js</code> para ativar o login com Google de verdade.</div></div>`
    );
  }

  await montarMenuUsuario();
  registrarVisita();
}

/**
 * Conta a visita para as estatísticas do admin. O navegador recebe um
 * código aleatório só dele (sem nome, e-mail ou IP). Falhas são ignoradas.
 */
function registrarVisita() {
  const db = clienteSupabase();
  if (!db) return;
  let visitante = null;
  try {
    visitante = localStorage.getItem("animese:visitante");
    if (!visitante) {
      visitante = crypto.randomUUID();
      localStorage.setItem("animese:visitante", visitante);
    }
  } catch {
    visitante = sessionStorage.getItem?.("animese:visitante") || crypto.randomUUID();
  }
  const pagina = location.pathname.replace(/\/$/, "/index.html") || "/index.html";
  db.rpc("registrar_visita", { p_visitor: visitante, p_path: pagina }).then(() => {}, () => {});
}

async function montarMenuUsuario() {
  const alvo = document.getElementById("menu-usuario");
  const usuario = await usuarioAtual();

  if (!usuario) {
    alvo.innerHTML = `<button class="btn btn-claro btn-google" id="btn-entrar">${iconeGoogle()}Entrar com Google</button>`;
    alvo.querySelector("#btn-entrar").addEventListener("click", entrar);
    return;
  }

  const perfil = await lerPerfil().catch(() => null);
  const nick = perfil?.nick || usuario.nome.split(" ")[0];
  const avatar = perfil?.avatar || usuario.avatar;

  alvo.innerHTML = `
    <button aria-haspopup="true" aria-expanded="false" id="btn-menu-usuario">
      ${avatarHtml(avatar, nick)}
      <span class="nome-curto">${nomeComTag(nick, perfil?.tag, perfil?.favoritoTitulo)}</span>
    </button>
    <div class="menu-dropdown" role="menu">
      <a href="usuario.html?id=${usuario.id}" role="menuitem">Meu perfil público</a>
      <a href="perfil.html" role="menuitem">Editar perfil</a>
      <a href="lista.html" role="menuitem">Minha lista</a>
      ${perfil?.papel === "admin" ? `<a href="admin.html" role="menuitem">Painel admin</a>` : ""}
      <hr>
      <button type="button" role="menuitem" id="btn-sair">Sair</button>
    </div>`;

  const botao = alvo.querySelector("#btn-menu-usuario");
  const menu = alvo.querySelector(".menu-dropdown");
  botao.addEventListener("click", (e) => {
    e.stopPropagation();
    const aberto = menu.classList.toggle("aberto");
    botao.setAttribute("aria-expanded", aberto);
  });
  document.addEventListener("click", () => { menu.classList.remove("aberto"); botao.setAttribute("aria-expanded", "false"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.classList.remove("aberto"); });
  alvo.querySelector("#btn-sair").addEventListener("click", sair);
}

export async function entrar() {
  try { await entrarComGoogle(); }
  catch (e) { toast("Não foi possível entrar: " + e.message); }
}

export function iconeGoogle() {
  return `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
}
