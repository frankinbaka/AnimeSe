// ============================================================
// Sininho de notificações (no cabeçalho, para quem tem conta).
// Tabela e regras em supabase/etapa15_notificacoes.sql
// ============================================================

import { clienteSupabase } from "./store.js";
import { esc, avatarHtml, temSeloApoiador } from "./ui.js";
import { tempoAtras } from "./comunidade.js";
import { traduzirTitulo } from "./mal.js";

const INTERVALO = 120_000; // confere novidades a cada 2 minutos (com a aba visível)
const ICONE_SINO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>`;

let db, botao, contador, painel, timer;
let naoLidas = 0;

export function iniciarNotificacoes(antesDe) {
  db = clienteSupabase();
  if (!db || !antesDe) return;
  const caixa = document.createElement("div");
  caixa.className = "sino";
  caixa.innerHTML = `
    <button type="button" class="btn-sino" id="btn-sino" aria-haspopup="true" aria-expanded="false" aria-label="Notificações">
      ${ICONE_SINO}<span class="contador-alerta sino-contador" hidden></span>
    </button>
    <section class="sino-painel" id="sino-painel" aria-label="Notificações" hidden>
      <header><h2>Notificações</h2><button type="button" class="sino-ler-todas" hidden>Marcar todas como lidas</button></header>
      <ol class="sino-lista"><li class="sino-vazio">Carregando…</li></ol>
    </section>`;
  antesDe.before(caixa);
  botao = caixa.querySelector("#btn-sino");
  contador = caixa.querySelector(".sino-contador");
  painel = caixa.querySelector("#sino-painel");

  botao.addEventListener("click", (e) => { e.stopPropagation(); painel.hidden ? abrir() : fechar(); });
  painel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", fechar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
  painel.querySelector(".sino-ler-todas").addEventListener("click", () => marcarTodas());

  contar();
  timer = setInterval(() => { if (document.visibilityState === "visible") contar(); }, INTERVALO);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") contar(); });
}

async function contar() {
  const { data, error } = await db.rpc("notificacoes_nao_lidas");
  if (error) return; // SQL da etapa 15 ainda não rodado: o sininho só fica sem número
  naoLidas = data || 0;
  pintarContador();
}

function pintarContador() {
  contador.textContent = naoLidas > 99 ? "99+" : naoLidas;
  contador.hidden = !naoLidas;
  botao.setAttribute("aria-label", naoLidas ? `Notificações, ${naoLidas} novas` : "Notificações");
  painel.querySelector(".sino-ler-todas").hidden = !naoLidas;
}

async function abrir() {
  painel.hidden = false;
  botao.setAttribute("aria-expanded", "true");
  const lista = painel.querySelector(".sino-lista");
  const { data, error } = await db.from("notifications")
    .select("id, tipo, ref, ator_id, atores, dados, lida, updated_at")
    .order("updated_at", { ascending: false }).limit(40);
  if (error) {
    lista.innerHTML = `<li class="sino-vazio">${/does not exist|schema cache/i.test(error.message) ? "As notificações ainda não foram ativadas no banco." : "Não foi possível carregar agora."}</li>`;
    return;
  }
  if (!data.length) {
    lista.innerHTML = `<li class="sino-vazio">Nenhuma notificação por enquanto.<br><small>Avisamos aqui quando um anime da sua lista estrear, sair temporada nova ou alguém curtir sua página.</small></li>`;
    return;
  }
  const ids = [...new Set(data.map((n) => n.ator_id).filter(Boolean))];
  const atores = new Map();
  if (ids.length) {
    const { data: perfis } = await db.from("profiles").select("id, nickname, display_name, avatar_url, supporter_until").in("id", ids);
    (perfis || []).forEach((p) => atores.set(p.id, p));
  }
  lista.innerHTML = data.map((n) => itemHtml(n, atores.get(n.ator_id))).join("");
  // Abriu o sininho: tudo conta como visto (os novos continuam destacados nesta abertura)
  if (data.some((n) => !n.lida)) marcarTodas({ manterDestaque: true });
}

function fechar() {
  if (!painel || painel.hidden) return;
  painel.hidden = true;
  botao.setAttribute("aria-expanded", "false");
}

async function marcarTodas({ manterDestaque = false } = {}) {
  if (!manterDestaque) painel.querySelectorAll(".nao-lida").forEach((el) => el.classList.remove("nao-lida"));
  naoLidas = 0;
  pintarContador();
  await db.from("notifications").update({ lida: true }).eq("lida", false);
}

// ------------------------------------------------------------
// Texto de cada tipo de notificação
// ------------------------------------------------------------
const nomeDe = (p) => p?.nickname || p?.display_name?.split(" ")[0] || "Alguém";
const trecho = (d) => (d.trecho ? `“${esc(d.trecho.length > 60 ? d.trecho.slice(0, 60) + "…" : d.trecho)}”` : "com imagem");

function itemHtml(n, ator) {
  const d = n.dados || {};
  const outros = n.atores - 1;
  const quem = `<strong>${esc(nomeDe(ator))}</strong>${outros > 0 ? ` e mais ${outros} ${outros === 1 ? "pessoa" : "pessoas"}` : ""}`;
  const plural = outros > 0;
  const tituloAnime = esc(traduzirTitulo(d.titulo || ""));
  const imgAnime = d.imagem ? `<img class="sino-capa" src="${esc(d.imagem)}" alt="" loading="lazy">` : `<span class="sino-icone" aria-hidden="true">📺</span>`;
  const icone = (emoji) => `<span class="sino-icone" aria-hidden="true">${emoji}</span>`;

  const tipos = {
    curtida: [`${quem} ${plural ? "curtiram" : "curtiu"} a publicação ${trecho(d)} da sua página.`, `pagina.html?p=${esc(d.slug || "")}`, avatarHtml(ator?.avatar_url, nomeDe(ator), temSeloApoiador(ator?.supporter_until)), "♥"],
    republicacao: [`${quem} ${plural ? "republicaram" : "republicou"} a publicação ${trecho(d)} da sua página.`, `pagina.html?p=${esc(d.slug || "")}`, avatarHtml(ator?.avatar_url, nomeDe(ator), temSeloApoiador(ator?.supporter_until)), "🔁"],
    comentario: [`${quem} ${plural ? "comentaram" : "comentou"} na publicação ${trecho(d)} da sua página${d.comentario && !plural ? `: “${esc(d.comentario)}”` : "."}`, `pagina.html?p=${esc(d.slug || "")}`, avatarHtml(ator?.avatar_url, nomeDe(ator), temSeloApoiador(ator?.supporter_until)), "💬"],
    pagina_aprovada: [`Sua página <strong>${esc(d.nome || "")}</strong> foi aprovada! Já pode publicar.`, `pagina.html?p=${esc(d.slug || "")}`, icone("🎉")],
    pagina_recusada: [`O pedido da página <strong>${esc(d.nome || "")}</strong> foi recusado.${d.nota ? ` Recado do admin: ${esc(d.nota)}` : ""}`, "paginas.html?aba=minhas", icone("📝")],
    pagina_suspensa: [`Sua página <strong>${esc(d.nome || "")}</strong> foi suspensa.${d.nota ? ` Motivo: ${esc(d.nota)}` : ""}`, "paginas.html?aba=minhas", icone("⛔")],
    criador_aprovado: [`Seu pedido de <strong>criador de conteúdo</strong> foi aprovado! Seus links já aparecem no perfil.`, "perfil.html", icone("🎬")],
    criador_recusado: [`Seu pedido de criador de conteúdo foi recusado.${d.nota ? ` Recado do admin: ${esc(d.nota)}` : ""}`, "perfil.html", icone("📝")],
    apoio_confirmado: [`Seu apoio foi confirmado! Obrigado por ajudar o AnimeSe ♥ O selo de Apoiador já está no seu perfil.`, "apoiar.html", icone("💖")],
    apoio_recusado: [`Não encontramos o seu Pix.${d.motivo ? ` ${esc(d.motivo)}` : ""} Se já pagou, avise de novo.`, "apoiar.html", icone("💬")],
    anime_estreou: [`<strong>${tituloAnime}</strong> estreou! O primeiro episódio já saiu.`, `anime.html?id=${Number(n.ref)}`, imgAnime],
    nova_temporada: [`Saiu <strong>${tituloAnime}</strong>, continuação de ${d.anterior ? `<strong>${esc(traduzirTitulo(d.anterior))}</strong>` : "um anime"} que você assistiu.`, `anime.html?id=${Number(n.ref)}`, imgAnime],
  };
  const [texto, link, imagem, selo] = tipos[n.tipo] || [esc(d.texto || "Nova notificação"), "#", icone("🔔")];
  return `
    <li class="${n.lida ? "" : "nao-lida"}" data-id="${n.id}">
      <a href="${link}">
        <span class="sino-imagem">${imagem}${selo ? `<span class="sino-selo" aria-hidden="true">${selo}</span>` : ""}</span>
        <span class="sino-texto">${texto}<small>${tempoAtras(n.updated_at)}</small></span>
      </a>
    </li>`;
}
