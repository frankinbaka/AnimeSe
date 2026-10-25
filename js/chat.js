// ============================================================
// Chat geral em tempo real (balão flutuante em todas as páginas).
// Só para quem tem conta. Tabela em supabase/etapa9_social.sql
// ============================================================

import { clienteSupabase } from "./store.js";
import { esc, avatarHtml, temSeloApoiador, toast } from "./ui.js";

const LIMITE_HISTORICO = 60;
const CHAVE_VISTO = "animese:chat-visto";
const CHAVE_ABERTO = "animese:chat-aberto";
const CAMPOS_AUTOR = "id, nickname, tag, display_name, avatar_url, favorite_title, supporter_until, role";

let db, eu, souAdmin;
let raiz, lista, campo, contadorNaoLidas, contadorOnline;
let carregado = false;
let naoLidas = 0;
const autores = new Map();
const mostradas = new Set();

const ler = (k, s = localStorage) => { try { return s.getItem(k); } catch { return null; } };
const gravar = (k, v, s = localStorage) => { try { s.setItem(k, v); } catch {} };
const nomeDe = (p) => p?.nickname || p?.display_name?.split(" ")[0] || "Usuário";
const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dia = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

export async function iniciarChat(usuario, perfil) {
  db = clienteSupabase();
  if (!db || !usuario) return;
  eu = usuario;
  souAdmin = perfil?.papel === "admin";
  if (perfil) autores.set(usuario.id, { id: usuario.id, nickname: perfil.nick, tag: perfil.tag, avatar_url: perfil.avatar, supporter_until: perfil.apoiadorAte, role: perfil.papel });

  montarBalao();
  await contarNaoLidas();
  ouvirTempoReal();
  if (ler(CHAVE_ABERTO, sessionStorage) === "1") abrir();
}

// ------------------------------------------------------------
// Interface
// ------------------------------------------------------------
function montarBalao() {
  document.body.insertAdjacentHTML("beforeend", `
    <div class="chat" id="chat">
      <button type="button" class="chat-botao" id="chat-botao" aria-expanded="false" aria-controls="chat-painel" aria-label="Abrir o chat geral">
        <span aria-hidden="true">💬</span>
        <span class="contador-alerta chat-nao-lidas" id="chat-nao-lidas" hidden></span>
      </button>
      <section class="chat-painel" id="chat-painel" aria-label="Chat geral" hidden>
        <header class="chat-topo">
          <div>
            <h2>Chat geral</h2>
            <span class="chat-online" id="chat-online">Conectando…</span>
          </div>
          <button type="button" class="chat-fechar" id="chat-fechar" aria-label="Fechar o chat">×</button>
        </header>
        <ol class="chat-mensagens" id="chat-mensagens" aria-live="polite"><li class="chat-aviso">Carregando mensagens…</li></ol>
        <form class="chat-form" id="chat-form">
          <label class="sr-only" for="chat-campo">Mensagem</label>
          <textarea id="chat-campo" rows="1" maxlength="500" placeholder="Escreva para todo mundo…"></textarea>
          <button type="submit" class="btn btn-primario chat-enviar" aria-label="Enviar">➤</button>
        </form>
        <p class="chat-regras">Seja gentil. Spoilers, ofensas e conteúdo adulto são removidos.</p>
      </section>
    </div>`);

  raiz = document.getElementById("chat");
  lista = document.getElementById("chat-mensagens");
  campo = document.getElementById("chat-campo");
  contadorNaoLidas = document.getElementById("chat-nao-lidas");
  contadorOnline = document.getElementById("chat-online");

  document.getElementById("chat-botao").addEventListener("click", () => (raiz.classList.contains("aberto") ? fechar() : abrir()));
  document.getElementById("chat-fechar").addEventListener("click", fechar);
  document.getElementById("chat-form").addEventListener("submit", (e) => { e.preventDefault(); enviar(); });
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
    if (e.key === "Escape") fechar();
  });
  campo.addEventListener("input", () => {
    campo.style.height = "auto";
    campo.style.height = Math.min(campo.scrollHeight, 120) + "px";
  });
  lista.addEventListener("click", async (e) => {
    const botao = e.target.closest("[data-apagar]");
    if (!botao) return;
    if (!confirm(botao.dataset.moderacao ? "Apagar a mensagem desta pessoa?" : "Apagar sua mensagem?")) return;
    const { error } = await db.from("chat_messages").delete().eq("id", Number(botao.dataset.apagar));
    if (error) toast("Não foi possível apagar agora");
    else removerMensagem(Number(botao.dataset.apagar));
  });
}

async function abrir() {
  raiz.classList.add("aberto");
  document.getElementById("chat-painel").hidden = false;
  document.getElementById("chat-botao").setAttribute("aria-expanded", "true");
  gravar(CHAVE_ABERTO, "1", sessionStorage);
  if (!carregado) await carregarHistorico();
  marcarComoLidas();
  rolarParaFim();
  campo.focus();
}

function fechar() {
  raiz.classList.remove("aberto");
  document.getElementById("chat-painel").hidden = true;
  document.getElementById("chat-botao").setAttribute("aria-expanded", "false");
  gravar(CHAVE_ABERTO, "0", sessionStorage);
}

// ------------------------------------------------------------
// Mensagens
// ------------------------------------------------------------
async function buscarAutores(ids) {
  const faltando = [...new Set(ids)].filter((id) => !autores.has(id));
  if (!faltando.length) return;
  const { data } = await db.from("profiles").select(CAMPOS_AUTOR).in("id", faltando);
  (data || []).forEach((p) => autores.set(p.id, p));
}

async function carregarHistorico() {
  const { data, error } = await db.from("chat_messages").select("id, user_id, body, created_at")
    .order("created_at", { ascending: false }).limit(LIMITE_HISTORICO);
  if (error) {
    lista.innerHTML = `<li class="chat-aviso">${/does not exist|schema cache/i.test(error.message)
      ? "O chat ainda não foi ativado no banco (falta rodar o SQL da etapa 9)."
      : "Não foi possível carregar o chat agora."}</li>`;
    return;
  }
  carregado = true;
  const msgs = data.reverse();
  await buscarAutores(msgs.map((m) => m.user_id));
  lista.innerHTML = msgs.length ? "" : `<li class="chat-aviso" id="chat-vazio">Ninguém falou nada ainda. Diga oi! 👋</li>`;
  msgs.forEach(adicionarMensagem);
}

function adicionarMensagem(m) {
  if (mostradas.has(m.id)) return;
  mostradas.add(m.id);
  document.getElementById("chat-vazio")?.remove();
  const autor = autores.get(m.user_id);
  const minha = m.user_id === eu.id;
  const anterior = lista.lastElementChild;
  const agrupar = anterior?.dataset.autor === m.user_id && new Date(m.created_at) - new Date(anterior.dataset.quando) < 5 * 60000;
  const mesmoDia = anterior?.dataset.quando && dia(anterior.dataset.quando) === dia(m.created_at);

  lista.insertAdjacentHTML("beforeend", `
    ${!mesmoDia && lista.children.length ? `<li class="chat-dia">${dia(m.created_at)}</li>` : ""}
    <li class="chat-msg ${minha ? "minha" : ""} ${agrupar ? "agrupada" : ""}" data-id="${m.id}" data-autor="${m.user_id}" data-quando="${m.created_at}">
      ${agrupar ? "" : `<a href="usuario.html?id=${m.user_id}" class="chat-avatar" tabindex="-1">${avatarHtml(autor?.avatar_url, nomeDe(autor), temSeloApoiador(autor?.supporter_until))}</a>`}
      <div class="chat-corpo">
        ${agrupar ? "" : `<div class="chat-autor">
          <a href="usuario.html?id=${m.user_id}">${esc(nomeDe(autor))}</a>
          ${autor?.tag ? `<span class="tag-anime">${esc(autor.tag)}</span>` : ""}
          ${autor?.role === "admin" ? `<span class="selo selo-admin">Admin</span>` : ""}
          <time datetime="${m.created_at}">${hora(m.created_at)}</time>
        </div>`}
        <p>${esc(m.body)}</p>
      </div>
      ${minha || souAdmin ? `<button type="button" class="chat-apagar" data-apagar="${m.id}" ${!minha ? 'data-moderacao="1"' : ""} aria-label="Apagar mensagem">×</button>` : ""}
    </li>`);
}

function removerMensagem(id) {
  const el = lista.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  mostradas.delete(id);
  const proxima = el.nextElementSibling;
  const eraCabeca = !el.classList.contains("agrupada");
  el.remove();
  // A próxima mensagem do mesmo autor estava agrupada: passa a mostrar foto e nome
  if (eraCabeca && proxima?.classList.contains("agrupada")) {
    const m = { id: Number(proxima.dataset.id), user_id: proxima.dataset.autor, created_at: proxima.dataset.quando, body: proxima.querySelector("p").textContent };
    const marcador = proxima.nextElementSibling;
    proxima.remove();
    mostradas.delete(m.id);
    const fim = lista.lastElementChild;
    // reinsere no mesmo lugar
    const temp = document.createElement("ol");
    const listaReal = lista;
    lista = temp;
    adicionarMensagem(m);
    lista = listaReal;
    const novo = temp.querySelector(".chat-msg");
    novo.classList.remove("agrupada");
    if (marcador) listaReal.insertBefore(novo, marcador); else listaReal.appendChild(novo);
  }
}

const pertoDoFim = () => lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
const rolarParaFim = () => { lista.scrollTop = lista.scrollHeight; };

async function enviar() {
  const texto = campo.value.trim();
  if (!texto) return;
  campo.disabled = true;
  const { data, error } = await db.from("chat_messages").insert({ user_id: eu.id, body: texto })
    .select("id, user_id, body, created_at").single();
  campo.disabled = false;
  if (error) {
    toast(/Calma|Muitas mensagens/.test(error.message) ? error.message : "Não foi possível enviar agora");
    campo.focus();
    return;
  }
  campo.value = "";
  campo.style.height = "auto";
  adicionarMensagem(data);
  rolarParaFim();
  marcarComoLidas();
  campo.focus();
}

// ------------------------------------------------------------
// Tempo real, pessoas online e não lidas
// ------------------------------------------------------------
function ouvirTempoReal() {
  const canal = db.channel("chat-geral", { config: { presence: { key: eu.id } } });
  canal
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async ({ new: m }) => {
      if (mostradas.has(m.id)) return;
      if (!carregado) { if (m.user_id !== eu.id) somarNaoLida(); return; }
      await buscarAutores([m.user_id]);
      const estavaNoFim = pertoDoFim();
      adicionarMensagem(m);
      if (raiz.classList.contains("aberto") && estavaNoFim) { rolarParaFim(); marcarComoLidas(); }
      else if (m.user_id !== eu.id) somarNaoLida();
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, ({ old }) => {
      if (old?.id) removerMensagem(old.id);
    })
    .on("presence", { event: "sync" }, () => {
      const n = Object.keys(canal.presenceState()).length;
      contadorOnline.textContent = `${n} ${n === 1 ? "pessoa" : "pessoas"} online`;
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") await canal.track({ entrou: new Date().toISOString() });
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") contadorOnline.textContent = "Reconectando…";
    });
}

async function contarNaoLidas() {
  const visto = ler(CHAVE_VISTO);
  if (!visto) { gravar(CHAVE_VISTO, new Date().toISOString()); return; }
  const { count } = await db.from("chat_messages").select("id", { count: "exact", head: true })
    .gt("created_at", visto).neq("user_id", eu.id);
  naoLidas = count || 0;
  atualizarContador();
}

function somarNaoLida() {
  if (raiz.classList.contains("aberto") && document.visibilityState === "visible" && pertoDoFim()) { marcarComoLidas(); return; }
  naoLidas++;
  atualizarContador();
}

function marcarComoLidas() {
  naoLidas = 0;
  gravar(CHAVE_VISTO, new Date().toISOString());
  atualizarContador();
}

function atualizarContador() {
  contadorNaoLidas.textContent = naoLidas > 99 ? "99+" : naoLidas;
  contadorNaoLidas.hidden = !naoLidas;
  document.getElementById("chat-botao").setAttribute("aria-label", naoLidas ? `Abrir o chat geral, ${naoLidas} mensagens novas` : "Abrir o chat geral");
}
