// ============================================================
// Agrupa a lista de animes por franquia: temporadas, filmes e OVAs
// do mesmo anime viram um card só, que abre com tudo o que está dentro.
//
// Cada item guarda franchise_id (o primeiro anime lançado da franquia).
// Itens antigos sem essa informação são descobertos aqui, pela função
// /api/temporadas, e (se a lista for de quem está vendo) salvos no banco.
// ============================================================

import { temporadasDoAnime } from "./mal.js";
import { clienteSupabase } from "./store.js";
import { esc, cardAnime } from "./ui.js";
import { nomeStatus } from "./store.js";

/** Id da franquia de um anime (o primeiro lançado), ou o próprio id se não der para descobrir. */
export async function franquiaDe(malId) {
  try {
    const lista = await temporadasDoAnime(malId);
    return lista[0]?.id || Number(malId);
  } catch {
    return null;
  }
}

/**
 * Preenche item.franquia nos itens que ainda não têm.
 * Se donoId for informado (a lista é de quem está vendo), salva no banco.
 */
export async function completarFranquias(itens, donoId = null) {
  const faltando = itens.filter((i) => !i.franquia);
  if (!faltando.length) return itens;
  const porId = new Map(itens.map((i) => [i.id, i]));
  const descobertos = new Map(); // franquia -> [ids]

  const fila = [...faltando];
  const trabalhador = async () => {
    while (fila.length) {
      const item = fila.shift();
      if (item.franquia) continue; // já resolvido por outro anime da mesma franquia
      let lista = null;
      try { lista = await temporadasDoAnime(item.id); } catch {}
      if (!lista?.length) { item.franquia = item.id; item.provisorio = true; continue; }
      const raiz = lista[0].id;
      for (const t of lista) {
        const outro = porId.get(t.id);
        if (outro && !outro.franquia) {
          outro.franquia = raiz;
          if (!descobertos.has(raiz)) descobertos.set(raiz, []);
          descobertos.get(raiz).push(t.id);
        }
      }
      if (!item.franquia) { item.franquia = item.id; item.provisorio = true; }
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);

  const db = clienteSupabase();
  if (donoId && db && descobertos.size) {
    await Promise.all([...descobertos].map(([raiz, ids]) =>
      db.from("anime_list").update({ franchise_id: raiz }).eq("user_id", donoId).in("mal_id", ids)
    )).catch(() => {});
  }
  return itens;
}

/** Junta itens da mesma franquia, mantendo a ordem (o mais recente primeiro). */
export function agrupar(itens) {
  const grupos = new Map();
  for (const item of itens) {
    const chave = item.franquia || item.id;
    if (!grupos.has(chave)) grupos.set(chave, { franquia: chave, itens: [] });
    grupos.get(chave).itens.push(item);
  }
  return [...grupos.values()].map((g) => {
    // Dentro do grupo, em ordem de lançamento (id do MAL acompanha bem isso)
    g.itens.sort((a, b) => a.id - b.id);
    g.capa = g.itens.find((i) => i.id === g.franquia) || g.itens[0];
    return g;
  });
}

/** "Frieren Temporada 2" -> "Frieren" (só para o título do card agrupado). */
export function tituloDaFranquia(titulo = "") {
  return titulo
    .replace(/\s*[:\-–]?\s*(\d+(ª|º|st|nd|rd|th)?\s*)?(temporada|season|parte|part|cour)\s*\d*.*$/i, "")
    .replace(/\s+(II|III|IV|V|VI)$/, "")
    .trim() || titulo;
}

/** Card de um grupo. Grupos de 1 item viram um card normal. */
export function cardGrupo(g, indice, { mostrarStatus = false } = {}) {
  if (g.itens.length === 1) return cardAnime(g.itens[0], { status: mostrarStatus ? g.itens[0].status : null });
  const a = g.capa;
  const qtd = g.itens.length;
  const statusUnico = new Set(g.itens.map((i) => i.status)).size === 1 ? a.status : null;
  return `
    <a class="card-anime card-franquia" href="anime.html?id=${a.id}" data-grupo="${indice}" aria-haspopup="dialog">
      <div class="poster">
        <img src="${esc(a.imagem)}" alt="" loading="lazy">
        <span class="qtd-franquia">${qtd} títulos</span>
        ${mostrarStatus && statusUnico ? `<span class="status-pill st-${statusUnico}">${nomeStatus(statusUnico)}</span>` : ""}
      </div>
      <h3>${esc(tituloDaFranquia(a.titulo))}</h3>
      <p class="detalhe">Temporadas e filmes juntos</p>
    </a>`;
}

/**
 * Liga os cliques dos cards agrupados dentro de `container`.
 * Abre um diálogo com os títulos da franquia que estão na lista
 * e, abaixo, o que ainda falta da franquia.
 */
export function ligarGrupos(container, obterGrupos, { mostrarStatus = false, pronome = "Você" } = {}) {
  container.addEventListener("click", (e) => {
    const card = e.target.closest(".card-franquia");
    if (!card || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    abrirGrupo(obterGrupos()[Number(card.dataset.grupo)], { mostrarStatus, pronome });
  });
}

function abrirGrupo(g, { mostrarStatus, pronome }) {
  let dialogo = document.getElementById("dialogo-franquia");
  if (!dialogo) {
    dialogo = document.createElement("dialog");
    dialogo.id = "dialogo-franquia";
    dialogo.className = "dialogo dialogo-franquia";
    document.body.append(dialogo);
    dialogo.addEventListener("click", (e) => {
      if (e.target === dialogo || e.target.closest(".fechar-dialogo")) dialogo.close();
    });
  }
  const linha = (i, naLista = true) => `
    <a class="item-franquia ${naLista ? "" : "fora-da-lista"}" href="anime.html?id=${i.id}">
      <img src="${esc(i.imagem)}" alt="" loading="lazy">
      <span>
        <strong>${esc(i.titulo)}</strong>
        <small>${esc([i.tipo, i.ano, i.episodios ? `${i.episodios} ep.` : null].filter(Boolean).join(" · "))}</small>
      </span>
      ${naLista && mostrarStatus ? `<span class="status-pill st-${i.status}">${nomeStatus(i.status)}</span>` : ""}
      ${!naLista && i.emBreve ? `<span class="em-breve">Em breve</span>` : ""}
    </a>`;

  dialogo.innerHTML = `
    <button type="button" class="fechar-dialogo" aria-label="Fechar">×</button>
    <h2>${esc(tituloDaFranquia(g.capa.titulo))}</h2>
    <p class="secao-descricao">${g.itens.length} títulos desta franquia na lista.</p>
    <div class="lista-franquia" id="franquia-na-lista">${g.itens.map((i) => linha(i)).join("")}</div>
    <div id="franquia-resto"></div>`;
  dialogo.showModal();

  // Completa com a franquia inteira: ordem certa e o que ainda falta
  temporadasDoAnime(g.franquia).then((todas) => {
    if (!dialogo.open || !todas?.length) return;
    const meus = new Map(g.itens.map((i) => [i.id, i]));
    const naLista = todas.filter((t) => meus.has(t.id)).map((t) => ({ ...t, ...meus.get(t.id), tipo: t.tipo, ano: t.ano }));
    const extras = g.itens.filter((i) => !todas.some((t) => t.id === i.id));
    const faltam = todas.filter((t) => !meus.has(t.id));
    dialogo.querySelector("#franquia-na-lista").innerHTML = [...naLista, ...extras].map((i) => linha(i)).join("");
    if (faltam.length) {
      dialogo.querySelector("#franquia-resto").innerHTML = `
        <h3 class="titulo-franquia-resto">${pronome === "Você" ? "Ainda não está na sua lista" : "Ainda não está na lista"}</h3>
        <div class="lista-franquia">${faltam.map((t) => linha(t, false)).join("")}</div>`;
    }
  }).catch(() => {});
}
