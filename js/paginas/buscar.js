// Busca de animes por nome (ou lista completa da temporada atual).
import { montarLayout, cardAnime, esqueletos, caixaErro, esc } from "../ui.js";
import { buscar, temporadaAtual } from "../jikan.js";

await montarLayout();

const params = new URLSearchParams(location.search);
const termo = (params.get("q") || "").trim();
const pagina = Math.max(1, Number(params.get("pagina")) || 1);
const verTemporada = params.get("temporada") === "atual";

const form = document.getElementById("form-busca");
const campo = document.getElementById("campo-busca");
const grade = document.getElementById("grade-resultados");
const info = document.getElementById("resultado-info");
const paginacao = document.getElementById("paginacao");

campo.value = termo;
document.getElementById("busca-topo").value = termo;

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = campo.value.trim();
  if (q.length < 3) {
    info.innerHTML = `<p>Digite pelo menos 3 letras do nome do anime.</p>`;
    return;
  }
  location.href = `buscar.html?q=${encodeURIComponent(q)}`;
});

if (verTemporada) {
  document.getElementById("titulo-busca").textContent = "Temporada atual";
  await carregar(() => temporadaAtual(pagina), "temporada=atual");
} else if (termo.length >= 3) {
  document.title = `${termo} — Buscar — AnimeSe`;
  await carregar(() => buscar(termo, pagina), `q=${encodeURIComponent(termo)}`);
} else {
  campo.focus();
  info.innerHTML = `<p>Busque pelo nome em inglês, japonês ou como você conhece. Os dados vêm do MyAnimeList.</p>`;
}

async function carregar(funcao, base) {
  grade.innerHTML = esqueletos(12);
  try {
    const { itens, temMais } = await funcao();
    if (!itens.length) {
      grade.innerHTML = "";
      info.innerHTML = `<div class="vazio"><h2>Nenhum anime encontrado</h2><p>Confira a grafia ou tente outro nome, como o título em japonês.</p></div>`;
      return;
    }
    info.innerHTML = termo ? `<p>Resultados para <strong>${esc(termo)}</strong>, página ${pagina}.</p>` : "";
    grade.innerHTML = itens.map((a) => cardAnime(a)).join("");
    paginacao.innerHTML = [
      pagina > 1 ? `<a class="btn btn-contorno" href="buscar.html?${base}&pagina=${pagina - 1}">Página anterior</a>` : "",
      temMais ? `<a class="btn btn-contorno" href="buscar.html?${base}&pagina=${pagina + 1}">Próxima página</a>` : "",
    ].join("");
  } catch (e) {
    grade.innerHTML = "";
    info.innerHTML = caixaErro(e.message);
  }
}
