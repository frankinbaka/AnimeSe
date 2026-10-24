// Página inicial: destaque da temporada, temporada atual, top e próximos.
import { COMUNIDADE_ATIVA, animesSugeridos } from "../comunidade.js";
import { montarLayout, cardAnime, esqueletos, caixaErro, esc, formatarNota, formatarNumero } from "../ui.js";
import { temporadaAtual, topAnimes, proximaTemporada, nomeTemporada, temporadaDeHoje, sinopseEmPortugues } from "../mal.js";

await montarLayout();

const grade = document.getElementById("grade-temporada");
const faixaTop = document.getElementById("faixa-top");
const faixaProx = document.getElementById("faixa-proximos");
grade.innerHTML = esqueletos(12);
faixaTop.innerHTML = esqueletos(8);
faixaProx.innerHTML = esqueletos(8);

try {
  const { itens } = await temporadaAtual();
  if (itens.length) {
    // Destaque: o mais bem avaliado entre os 10 mais populares da temporada
    const destaque = [...itens.slice(0, 10)].sort((a, b) => (b.nota || 0) - (a.nota || 0))[0];
    montarHero(destaque);
    const { ano, estacao } = temporadaDeHoje();
    document.getElementById("titulo-temporada").textContent = `Temporada de ${nomeTemporada(estacao, ano)}`;
  }
  grade.innerHTML = itens.slice(0, 18).map((a) => cardAnime(a)).join("");
} catch (e) {
  grade.innerHTML = caixaErro(e.message);
  document.getElementById("hero-conteudo").innerHTML = `<div><h1>Temporada atual</h1><p class="hero-sinopse">${esc(e.message)}</p></div>`;
}

// Sugeridos pela comunidade (carrega em paralelo, vem do nosso banco)
const faixaCom = document.getElementById("faixa-comunidade");
if (!COMUNIDADE_ATIVA) {
  document.getElementById("secao-comunidade").remove();
} else {
  faixaCom.innerHTML = esqueletos(6);
  animesSugeridos(15)
    .then((lista) => {
      faixaCom.innerHTML = lista.length
        ? lista.map((s) => cardAnime({ id: s.mal_id, titulo: s.anime_title, imagem: s.anime_image }, { contagem: s.total })).join("")
        : `<p class="vazio" style="grid-column:1/-1">Nenhuma sugestão ainda. Abra um anime que você ama e clique em <strong>Sugerir para a comunidade</strong>.</p>`;
    })
    .catch(() => document.getElementById("secao-comunidade").remove());
}

try {
  faixaTop.innerHTML = (await topAnimes(15)).map((a) => cardAnime(a)).join("");
} catch (e) {
  faixaTop.innerHTML = caixaErro(e.message);
}

try {
  faixaProx.innerHTML = (await proximaTemporada(15)).map((a) => cardAnime(a)).join("");
} catch (e) {
  faixaProx.innerHTML = caixaErro(e.message);
}

function montarHero(a) {
  document.getElementById("hero-fundo").style.backgroundImage = `url("${a.imagem}")`;
  document.getElementById("hero-conteudo").innerHTML = `
    <div>
      <p class="hero-chamada">Destaque da temporada</p>
      <h1>${esc(a.titulo)}</h1>
      <div class="hero-meta">
        ${a.nota ? `<span>Nota <strong>${formatarNota(a.nota)}</strong></span>` : ""}
        ${a.episodios ? `<span><strong>${a.episodios}</strong> episódios</span>` : ""}
        ${a.estudios.length ? `<span>Estúdio <strong>${esc(a.estudios[0])}</strong></span>` : ""}
        ${a.membros ? `<span><strong>${formatarNumero(a.membros)}</strong> acompanhando no MAL</span>` : ""}
      </div>
      <p class="hero-sinopse" id="hero-sinopse" aria-busy="true">Carregando sinopse…</p>
      <div class="hero-acoes">
        <a class="btn btn-primario" href="anime.html?id=${a.id}">Ver anime</a>
        <a class="btn btn-claro" href="buscar.html">Buscar outro</a>
      </div>
    </div>
    <img class="hero-poster" src="${esc(a.imagem)}" alt="Pôster de ${esc(a.titulo)}">`;

  const alvo = document.getElementById("hero-sinopse");
  sinopseEmPortugues(a.id)
    .then((pt) => { alvo.textContent = pt || ""; })
    .catch(() => { alvo.textContent = ""; })
    .finally(() => alvo.removeAttribute("aria-busy"));
}
