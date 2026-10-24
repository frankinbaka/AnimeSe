// Página de um anime: dados do MAL + status na lista do usuário.
import { montarLayout, caixaErro, esc, formatarNota, formatarNumero, toast, entrar } from "../ui.js";
import { detalhes, traduzirStatus, nomeTemporada } from "../mal.js";
import { usuarioAtual, statusNaLista, definirStatus, removerDaLista, STATUS, nomeStatus } from "../store.js";

await montarLayout();

const alvo = document.getElementById("conteudo-anime");
const id = new URLSearchParams(location.search).get("id");

if (!id || !/^\d+$/.test(id)) {
  alvo.innerHTML = `<div class="vazio"><h2>Anime não informado</h2><p><a href="buscar.html">Buscar um anime</a></p></div>`;
} else {
  try {
    const anime = await detalhes(id);
    document.title = `${anime.titulo} — AnimeSe`;
    alvo.innerHTML = montarPagina(anime);
    await montarPainelLista(anime);
  } catch (e) {
    alvo.innerHTML = `<div style="margin-top:32px">${caixaErro(e.message)}</div>`;
  }
}

function montarPagina(a) {
  const numeros = [
    ["Nota", formatarNota(a.nota)],
    ["Ranking", a.ranking ? `#${formatarNumero(a.ranking)}` : "—"],
    ["Episódios", a.episodios ?? "?"],
    ["Situação", traduzirStatus(a.status)],
    ["Estreia", nomeTemporada(a.temporada, a.ano) || "—"],
    ["No MAL", formatarNumero(a.membros)],
  ];
  return `
    <div class="anime-topo">
      <img class="poster-grande" src="${esc(a.imagem)}" alt="Pôster de ${esc(a.titulo)}">
      <div>
        <h1>${esc(a.titulo)}</h1>
        ${a.tituloOriginal !== a.titulo || a.tituloJapones
          ? `<p class="anime-titulo-alt">${esc([a.tituloOriginal !== a.titulo ? a.tituloOriginal : null, a.tituloJapones].filter(Boolean).join(" / "))}</p>`
          : ""}
        <ul class="anime-numeros">
          ${numeros.map(([r, v]) => `<li><span>${r}</span><strong>${esc(v)}</strong></li>`).join("")}
        </ul>
        ${a.generos.length ? `<div class="generos">${a.generos.map((g) => `<span class="genero">${esc(g)}</span>`).join("")}</div>` : ""}
        <div class="painel-lista" id="painel-lista"></div>
        <h2>Sinopse</h2>
        <p class="sinopse">${esc(a.sinopse || "Sinopse ainda não disponível no MyAnimeList.")}</p>
        <p class="anime-titulo-alt">
          ${[a.tipo, a.duracao, a.estudios.join(", ")].filter(Boolean).map(esc).join(", ")}
          ${a.exibicao ? `<br>Exibição: ${esc(a.exibicao)}` : ""}
        </p>
        <p><a href="${esc(a.urlMal)}" target="_blank" rel="noopener">Ver no MyAnimeList</a></p>
      </div>
    </div>
    ${a.trailer ? `<section class="secao"><h2>Trailer</h2><iframe class="trailer" src="${esc(a.trailer.replace("autoplay=1", "autoplay=0"))}" title="Trailer de ${esc(a.titulo)}" allowfullscreen loading="lazy"></iframe></section>` : ""}`;
}

async function montarPainelLista(anime) {
  const painel = document.getElementById("painel-lista");
  const usuario = await usuarioAtual();

  if (!usuario) {
    painel.innerHTML = `
      <h2>Adicionar à minha lista</h2>
      <p>Entre com sua conta Google para marcar este anime.</p>
      <button class="btn btn-primario" id="btn-entrar-lista">Entrar com Google</button>`;
    painel.querySelector("#btn-entrar-lista").addEventListener("click", entrar);
    return;
  }

  let atual = await statusNaLista(anime.id).catch(() => null);

  const render = () => {
    painel.innerHTML = `
      <h2>${atual ? `Na sua lista: ${nomeStatus(atual)}` : "Adicionar à minha lista"}</h2>
      <div class="opcoes-status" role="group" aria-label="Status do anime">
        ${STATUS.map((s) => `<button class="opcao-status st-btn-${s.id}" data-status="${s.id}" aria-pressed="${atual === s.id}">${s.nome}</button>`).join("")}
      </div>
      ${atual ? `<button class="link-remover" id="btn-remover">Remover da lista</button>` : ""}`;

    painel.querySelectorAll(".opcao-status").forEach((b) =>
      b.addEventListener("click", async () => {
        const novo = b.dataset.status;
        if (novo === atual) return;
        try {
          await definirStatus(anime, novo);
          atual = novo;
          render();
          toast(`Marcado como "${nomeStatus(novo)}"`);
        } catch (e) { toast(e.message); }
      })
    );
    painel.querySelector("#btn-remover")?.addEventListener("click", async () => {
      try {
        await removerDaLista(anime.id);
        atual = null;
        render();
        toast("Removido da sua lista");
      } catch (e) { toast(e.message); }
    });
  };
  render();
}
