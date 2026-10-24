// "O que assistir?": sorteia um anime de acordo com os temas marcados.
import { montarLayout, esc, formatarNota, toast, entrar, caixaErro } from "../ui.js";
import { catalogoParaSorteio, grupoDoGenero, sinopseEmPortugues, detalhes } from "../mal.js";
import { usuarioAtual, lerLista, definirStatus } from "../store.js";
import { COMUNIDADE_ATIVA, animesSugeridos } from "../comunidade.js";

await montarLayout();

const form = document.getElementById("filtros");
const gruposEl = document.getElementById("grupos-generos");
const resultado = document.getElementById("resultado");
const contagem = document.getElementById("contagem");
const usuario = await usuarioAtual();

const selecionados = new Set();
const jaSorteados = new Set(); // evita repetir na mesma visita
let catalogo = [];
let naMinhaLista = new Set();
let sugeridosComunidade = null; // carregado só quando a opção é marcada

if (!usuario) {
  const esconder = document.getElementById("esconder-lista");
  esconder.checked = false;
  esconder.disabled = true;
  esconder.parentElement.title = "Entre com sua conta para usar esta opção";
}
if (!COMUNIDADE_ATIVA) document.getElementById("so-comunidade").parentElement.remove();

try {
  [catalogo, naMinhaLista] = await Promise.all([
    catalogoParaSorteio(),
    usuario ? lerLista().then((l) => new Set(l.map((a) => a.id))).catch(() => new Set()) : new Set(),
  ]);
  montarTemas();
  atualizarContagem();
} catch (e) {
  gruposEl.innerHTML = caixaErro(e.message);
}

// ------------------------------------------------------------
// Temas (montados a partir do catálogo, dos mais comuns para os menos)
// ------------------------------------------------------------
function montarTemas() {
  const contas = new Map();
  for (const a of catalogo) for (const g of a.generos) contas.set(g, (contas.get(g) || 0) + 1);

  const ocultos = new Set(["Hentai", "Erótico"]);
  const grupos = { genero: [], publico: [], tema: [] };
  [...contas.entries()]
    .filter(([g, n]) => !ocultos.has(g) && n >= 3)
    .sort((x, y) => y[1] - x[1])
    .forEach(([g]) => grupos[grupoDoGenero(g)].push(g));

  const bloco = (titulo, lista) => lista.length ? `
    <fieldset class="grupo-temas">
      <legend>${titulo}</legend>
      <div class="chips">
        ${lista.map((g) => `<button type="button" class="chip" aria-pressed="false" data-genero="${esc(g)}">${esc(g)}</button>`).join("")}
      </div>
    </fieldset>` : "";

  gruposEl.innerHTML = bloco("Gêneros", grupos.genero) + bloco("Temas", grupos.tema) + bloco("Público", grupos.publico);

  gruposEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const g = chip.dataset.genero;
    const ativo = chip.getAttribute("aria-pressed") === "true";
    chip.setAttribute("aria-pressed", String(!ativo));
    if (ativo) selecionados.delete(g); else selecionados.add(g);
    atualizarContagem();
  });
}

document.getElementById("limpar-filtros").addEventListener("click", () => {
  selecionados.clear();
  gruposEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
  atualizarContagem();
});
form.addEventListener("change", async (e) => {
  if (e.target.id === "so-comunidade" && e.target.checked && !sugeridosComunidade) await carregarComunidade();
  atualizarContagem();
});

// ------------------------------------------------------------
// Filtragem
// ------------------------------------------------------------
function opcoes() {
  const dados = new FormData(form);
  return {
    formato: dados.get("formato"),
    notaMinima: Number(dados.get("nota")),
    esconderLista: document.getElementById("esconder-lista")?.checked,
    soComunidade: document.getElementById("so-comunidade")?.checked,
  };
}

function candidatos() {
  const o = opcoes();
  const base = (o.soComunidade && sugeridosComunidade ? sugeridosComunidade : catalogo).filter((a) => {
    if (o.formato === "series" && !["Série", "ONA"].includes(a.tipo)) return false;
    if (o.formato === "filmes" && a.tipo !== "Filme") return false;
    if (o.notaMinima && (a.nota || 0) < o.notaMinima) return false;
    if (o.esconderLista && naMinhaLista.has(a.id)) return false;
    return true;
  });
  if (!selecionados.size) return { lista: base, modo: "todos" };

  // Primeiro tenta animes com todos os temas marcados; se não houver, com pelo menos um
  const todos = base.filter((a) => [...selecionados].every((g) => a.generos.includes(g)));
  if (todos.length) return { lista: todos, modo: "todos" };
  const algum = base.filter((a) => a.generos.some((g) => selecionados.has(g)));
  return { lista: algum, modo: "algum" };
}

function atualizarContagem() {
  const { lista, modo } = candidatos();
  if (!catalogo.length) return;
  contagem.textContent = !lista.length
    ? "Nenhum anime combina com esses filtros. Desmarque alguns temas ou baixe a nota mínima."
    : modo === "algum"
      ? `Nenhum anime tem todos esses temas juntos. Vamos sortear entre ${lista.length} que têm pelo menos um deles.`
      : `${lista.length} ${lista.length === 1 ? "anime combina" : "animes combinam"} com sua escolha.`;
}

async function carregarComunidade() {
  contagem.textContent = "Carregando sugestões da comunidade…";
  try {
    const sugeridos = await animesSugeridos(80);
    const porId = new Map(catalogo.map((a) => [a.id, a]));
    const faltando = sugeridos.filter((s) => !porId.has(s.mal_id)).slice(0, 30);
    // Animes fora do catálogo popular: busca os detalhes um a um
    const extras = (await Promise.all(faltando.map((s) => detalhes(s.mal_id).catch(() => null)))).filter(Boolean);
    sugeridosComunidade = [...sugeridos.map((s) => porId.get(s.mal_id)).filter(Boolean), ...extras];
  } catch (e) {
    sugeridosComunidade = [];
    toast(e.message);
  }
}

// ------------------------------------------------------------
// Sorteio
// ------------------------------------------------------------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  sortear();
});

function sortear() {
  const { lista } = candidatos();
  if (!lista.length) {
    atualizarContagem();
    resultado.innerHTML = `<div class="sorteio-vazio"><span class="dado" aria-hidden="true">?</span>
      <p>${esc(contagem.textContent)}</p></div>`;
    return;
  }
  let disponiveis = lista.filter((a) => !jaSorteados.has(a.id));
  if (!disponiveis.length) { // já mostrou todos: recomeça
    lista.forEach((a) => jaSorteados.delete(a.id));
    disponiveis = lista;
  }
  const anime = disponiveis[Math.floor(Math.random() * disponiveis.length)];
  jaSorteados.add(anime.id);
  mostrar(anime);
}

function mostrar(a) {
  const info = [a.tipo, a.episodios ? `${a.episodios} ep.` : null, a.ano].filter(Boolean).join(", ");
  resultado.innerHTML = `
    <article class="sorteado">
      <a href="anime.html?id=${a.id}" class="sorteado-capa"><img src="${esc(a.imagem)}" alt="Pôster de ${esc(a.titulo)}"></a>
      <div class="sorteado-info">
        <p class="hero-chamada">O AnimeSe sorteou</p>
        <h2><a href="anime.html?id=${a.id}">${esc(a.titulo)}</a></h2>
        <p class="sorteado-meta">${a.nota ? `<strong>★ ${formatarNota(a.nota)}</strong> no MAL, ` : ""}${esc(info)}</p>
        <div class="generos">${a.generos.map((g) => `<span class="genero ${selecionados.has(g) ? "genero-marcado" : ""}">${esc(g)}</span>`).join("")}</div>
        <p class="sorteado-sinopse" id="sorteado-sinopse">Carregando sinopse…</p>
        <div class="sorteado-acoes">
          <button class="btn btn-primario" type="button" data-acao="pretendo">Quero assistir</button>
          <button class="btn btn-contorno" type="button" data-acao="assistido">Já assisti, sortear outro</button>
          <button class="btn btn-contorno" type="button" data-acao="outro">Não curti, sortear outro</button>
        </div>
        <p><a href="anime.html?id=${a.id}">Ver página completa do anime</a></p>
      </div>
    </article>`;

  const sinopse = resultado.querySelector("#sorteado-sinopse");
  sinopseEmPortugues(a.id)
    .then((t) => { if (sinopse.isConnected) sinopse.textContent = t || "Este anime ainda não tem sinopse."; })
    .catch(() => { if (sinopse.isConnected) sinopse.textContent = ""; });

  resultado.querySelectorAll("[data-acao]").forEach((b) =>
    b.addEventListener("click", () => agir(b.dataset.acao, a, b))
  );
  resultado.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function agir(acao, anime, botao) {
  if (acao === "outro") return sortear();

  if (!usuario) {
    toast("Entre com sua conta Google para salvar na sua lista");
    return entrar();
  }
  botao.disabled = true;
  try {
    await definirStatus(anime, acao); // "assistido" ou "pretendo"
    naMinhaLista.add(anime.id);
    if (acao === "assistido") {
      toast(`"${anime.titulo}" foi para a sua lista como Já assisti`);
      sortear();
    } else {
      toast(`"${anime.titulo}" foi para a sua lista como Pretendo assistir`);
      botao.textContent = "Na sua lista";
      atualizarContagem();
    }
  } catch (e) {
    toast(e.message);
    botao.disabled = false;
  }
}
