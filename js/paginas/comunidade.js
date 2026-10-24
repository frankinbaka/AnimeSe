// Comunidade: animes sugeridos pelos usuários e últimas avaliações.
import { montarLayout, cardAnime, esqueletos, caixaErro, esc, nomeComTag, avatarHtml } from "../ui.js";
import { COMUNIDADE_ATIVA, animesSugeridos, ultimasAvaliacoes, nomeAutor, tempoAtras, NOTAS } from "../comunidade.js";

await montarLayout();

const grade = document.getElementById("grade-sugeridos");
const ultimas = document.getElementById("ultimas-avaliacoes");

if (!COMUNIDADE_ATIVA) {
  grade.innerHTML = caixaErro("A comunidade precisa do Supabase configurado.");
} else {
  grade.innerHTML = esqueletos(12);

  try {
    const lista = await animesSugeridos(60);
    grade.innerHTML = lista.length
      ? lista.map((s) => cardAnime({ id: s.mal_id, titulo: s.anime_title, imagem: s.anime_image }, { contagem: s.total })).join("")
      : `<div class="vazio" style="grid-column:1/-1"><h2>Nenhuma sugestão ainda</h2>
         <p>Abra a página de um anime que você ama e clique em <strong>Sugerir para a comunidade</strong>.</p>
         <a class="btn btn-primario" href="buscar.html">Buscar anime</a></div>`;
  } catch (e) {
    grade.innerHTML = caixaErro(e.message);
  }

  try {
    const lista = await ultimasAvaliacoes(12);
    ultimas.innerHTML = lista.length
      ? lista.map((r) => `
        <article class="avaliacao avaliacao-resumo">
          <header>
            <a href="anime.html?id=${r.mal_id}" class="miniatura"><img src="${esc(r.anime_image)}" alt="" loading="lazy"></a>
            <div class="linha-autor">
              <a class="titulo-anime" href="anime.html?id=${r.mal_id}">${esc(r.anime_title)}</a>
              <span class="por">${avatarHtml(r.autor?.avatar_url, nomeAutor(r.autor))}${nomeComTag(nomeAutor(r.autor), r.autor?.tag, r.autor?.favorite_title)}</span>
              <span class="data">${tempoAtras(r.created_at)}${r.likes ? `, ♥ ${r.likes}` : ""}</span>
            </div>
            <span class="nota-grande" title="${NOTAS[r.score]}">★ ${r.score}<small>/10</small></span>
          </header>
          ${r.body ? (r.spoiler
            ? `<p class="texto-avaliacao aviso-spoiler">Comentário com spoiler. <a href="anime.html?id=${r.mal_id}#secao-avaliacoes">Ler na página do anime</a></p>`
            : `<p class="texto-avaliacao recorte">${esc(r.body)}</p>`) : ""}
        </article>`).join("")
      : `<p class="vazio">Ninguém avaliou um anime ainda.</p>`;
  } catch (e) {
    ultimas.innerHTML = caixaErro(e.message);
  }
}
