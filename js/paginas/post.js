// Uma publicação: notícia, resenha ou vídeo.
import { montarLayout, caixaErro, esc } from "../ui.js";
import { CONTEUDO_ATIVO, lerPost, listarPosts, cartaoPost, idYoutube, textoParaHtml, formatarData, TIPOS_POST, souAdmin } from "../conteudo.js";
import { NOTAS } from "../comunidade.js";

await montarLayout();

const alvo = document.getElementById("post");
const id = Number(new URLSearchParams(location.search).get("id"));

if (!CONTEUDO_ATIVO) {
  alvo.innerHTML = caixaErro("As novidades precisam do Supabase configurado.");
} else if (!id) {
  alvo.innerHTML = `<div class="vazio"><h2>Publicação não informada</h2><a class="btn btn-primario" href="feed.html">Ir para o feed</a></div>`;
} else {
  try {
    const p = await lerPost(id);
    if (!p) {
      alvo.innerHTML = `<div class="vazio"><h2>Publicação não encontrada</h2><p>Ela pode ter sido removida.</p><a class="btn btn-primario" href="feed.html">Ir para o feed</a></div>`;
    } else {
      mostrar(p);
    }
  } catch (e) {
    alvo.innerHTML = `<div style="margin-top:32px">${caixaErro(e.message)}</div>`;
  }
}

async function mostrar(p) {
  document.title = `${p.title} — AnimeSe`;
  const yt = idYoutube(p.video_url);
  const admin = await souAdmin();

  alvo.innerHTML = `
    <header class="post-cabecalho">
      <p class="post-tipo"><a href="feed.html?item=o:${p.id}">${TIPOS_POST[p.kind].nome} no feed</a>${p.published ? "" : ' <span class="selo selo-rascunho">Rascunho</span>'}</p>
      <h1>${esc(p.title)}</h1>
      ${p.summary ? `<p class="post-resumo">${esc(p.summary)}</p>` : ""}
      <p class="post-meta">${formatarData(p.published_at || p.created_at)}${admin ? ` <a href="admin.html?aba=publicacoes" class="btn-texto">Editar no painel</a>` : ""}</p>
    </header>

    ${yt ? `<div class="post-video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="${esc(p.title)}" allowfullscreen loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>`
        : p.cover_url ? `<img class="post-capa" src="${esc(p.cover_url)}" alt="">` : ""}

    ${p.kind === "resenha" && p.score ? `
      <div class="post-nota"><span class="nota-grande">★ ${p.score}<small>/10</small></span><span>${NOTAS[p.score]}</span></div>` : ""}

    <div class="post-corpo">${textoParaHtml(p.body || "")}</div>

    ${p.mal_id ? `
      <aside class="post-anime">
        <h2>Anime citado</h2>
        <a class="btn btn-contorno" href="anime.html?id=${p.mal_id}">${esc(p.anime_title || "Ver anime")}</a>
      </aside>` : ""}

    <section class="secao" id="mais-posts" hidden>
      <div class="secao-topo"><h2>Mais do AnimeSe</h2><a href="feed.html">Ver o feed</a></div>
      <div class="grade-posts" id="grade-mais"></div>
    </section>`;

  const { itens } = await listarPosts({ limite: 4 }).catch(() => ({ itens: [] }));
  const outros = itens.filter((x) => x.id !== p.id).slice(0, 3);
  if (outros.length) {
    alvo.querySelector("#grade-mais").innerHTML = outros.map(cartaoPost).join("");
    alvo.querySelector("#mais-posts").hidden = false;
  }
}
