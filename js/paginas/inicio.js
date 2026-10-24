// Página inicial: carrossel de destaques, novidades, temporada atual, top e próximos.
import { COMUNIDADE_ATIVA, animesSugeridos } from "../comunidade.js";
import { CONTEUDO_ATIVO, destaques, listarPosts, cartaoPost, capaDoPost, TIPOS_POST } from "../conteudo.js";
import { montarCarrossel } from "../carrossel.js";
import { montarLayout, cardAnime, esqueletos, caixaErro, esc, formatarNota, formatarNumero } from "../ui.js";
import { temporadaAtual, topAnimes, proximaTemporada, nomeTemporada, temporadaDeHoje, sinopseEmPortugues } from "../mal.js";

await montarLayout();

const grade = document.getElementById("grade-temporada");
const faixaTop = document.getElementById("faixa-top");
const faixaProx = document.getElementById("faixa-proximos");
grade.innerHTML = esqueletos(12);
faixaTop.innerHTML = esqueletos(8);
faixaProx.innerHTML = esqueletos(8);

// Novidades publicadas pelo admin (destaques do carrossel + últimas publicações)
const [postsDestaque, ultimosPosts] = CONTEUDO_ATIVO
  ? await Promise.all([destaques(4).catch(() => []), listarPosts({ limite: 4 }).then((r) => r.itens).catch(() => [])])
  : [[], []];
if (ultimosPosts.length) {
  document.getElementById("grade-novidades").innerHTML = ultimosPosts.map(cartaoPost).join("");
  document.getElementById("secao-novidades").hidden = false;
}

let temporada = [];
try {
  ({ itens: temporada } = await temporadaAtual());
  const { ano, estacao } = temporadaDeHoje();
  document.getElementById("titulo-temporada").textContent = `Temporada de ${nomeTemporada(estacao, ano)}`;
  grade.innerHTML = temporada.slice(0, 18).map((a) => cardAnime(a)).join("");
} catch (e) {
  grade.innerHTML = caixaErro(e.message);
}

// Carrossel: publicações em destaque primeiro, depois os 5 melhores da temporada
const destaquesTemporada = [...temporada.slice(0, 12)].sort((a, b) => (b.nota || 0) - (a.nota || 0)).slice(0, 5);
montarCarrossel(document.getElementById("carrossel"), [
  ...postsDestaque.map((p) => ({
    chamada: TIPOS_POST[p.kind].nome + (p.anime_title ? `, ${p.anime_title}` : ""),
    titulo: p.title,
    texto: p.summary || "",
    imagem: capaDoPost(p),
    fundoNitido: true,
    link: `post.html?id=${p.id}`,
    botoes: [{ href: `post.html?id=${p.id}`, texto: p.kind === "video" ? "Assistir vídeo" : "Ler agora", primario: true },
             { href: "novidades.html", texto: "Mais novidades" }],
  })),
  ...destaquesTemporada.map((a, i) => ({
    chamada: i === 0 ? "Destaque da temporada" : "Nesta temporada",
    titulo: a.titulo,
    meta: [
      a.nota ? `<span>Nota <strong>${formatarNota(a.nota)}</strong></span>` : "",
      a.episodios ? `<span><strong>${a.episodios}</strong> episódios</span>` : "",
      a.estudios.length ? `<span>Estúdio <strong>${esc(a.estudios[0])}</strong></span>` : "",
      a.membros ? `<span><strong>${formatarNumero(a.membros)}</strong> acompanhando no MAL</span>` : "",
    ].join(""),
    carregarTexto: () => sinopseEmPortugues(a.id),
    imagem: a.imagem,
    poster: a.imagem,
    link: `anime.html?id=${a.id}`,
    botoes: [{ href: `anime.html?id=${a.id}`, texto: "Ver anime", primario: true }, { href: "sortear.html", texto: "O que assistir?" }],
  })),
]);

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
