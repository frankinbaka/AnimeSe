// Novidades: notícias, resenhas e vídeos publicados pelo admin.
import { montarLayout, caixaErro } from "../ui.js";
import { CONTEUDO_ATIVO, listarPosts, cartaoPost } from "../conteudo.js";

await montarLayout();

const grade = document.getElementById("grade-posts");
const paginacao = document.getElementById("paginacao");
const abas = document.getElementById("abas-novidades");
const POR_PAGINA = 12;

const params = new URLSearchParams(location.search);
let tipo = params.get("tipo") || "";
let pagina = Math.max(1, Number(params.get("pagina")) || 1);

abas.addEventListener("click", (e) => {
  const aba = e.target.closest(".aba");
  if (!aba) return;
  tipo = aba.dataset.tipo;
  pagina = 1;
  carregar();
});

async function carregar() {
  abas.querySelectorAll(".aba").forEach((a) => a.setAttribute("aria-selected", String(a.dataset.tipo === tipo)));
  history.replaceState(null, "", `novidades.html${tipo || pagina > 1 ? "?" : ""}${new URLSearchParams({ ...(tipo && { tipo }), ...(pagina > 1 && { pagina }) })}`);
  if (!CONTEUDO_ATIVO) { grade.innerHTML = caixaErro("As novidades precisam do Supabase configurado."); return; }

  grade.innerHTML = `<p class="secao-descricao">Carregando…</p>`;
  paginacao.innerHTML = "";
  try {
    const { itens, total } = await listarPosts({ tipo: tipo || null, limite: POR_PAGINA, pagina });
    grade.innerHTML = itens.length
      ? itens.map(cartaoPost).join("")
      : `<div class="vazio" style="grid-column:1/-1"><h2>Nada publicado aqui ainda</h2><p>Volte em breve para conferir as novidades.</p></div>`;
    const paginas = Math.ceil(total / POR_PAGINA);
    if (paginas > 1) {
      paginacao.innerHTML = `
        ${pagina > 1 ? `<button class="btn btn-contorno" data-pagina="${pagina - 1}">Página anterior</button>` : ""}
        <span class="secao-descricao" style="align-self:center;margin:0">Página ${pagina} de ${paginas}</span>
        ${pagina < paginas ? `<button class="btn btn-contorno" data-pagina="${pagina + 1}">Próxima página</button>` : ""}`;
      paginacao.querySelectorAll("[data-pagina]").forEach((b) => b.addEventListener("click", () => {
        pagina = Number(b.dataset.pagina);
        carregar();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }));
    }
  } catch (e) {
    grade.innerHTML = caixaErro(e.message);
  }
}

carregar();
