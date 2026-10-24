// ============================================================
// Publicações do site: notícias, resenhas e vídeos (escritas
// pelo admin), destaques do carrossel e imagens de capa.
// Tabelas criadas em supabase/etapa2_conteudo.sql
// ============================================================

import { clienteSupabase, usuarioAtual, lerPerfil, MODO_DEMO } from "./store.js";
import { esc } from "./ui.js";

export const CONTEUDO_ATIVO = !MODO_DEMO;

export const TIPOS_POST = {
  noticia: { nome: "Notícia", plural: "Notícias" },
  resenha: { nome: "Resenha", plural: "Resenhas" },
  video: { nome: "Vídeo", plural: "Vídeos" },
};

const CAMPOS = "id, kind, title, summary, cover_url, video_url, mal_id, anime_title, score, featured, published, published_at, created_at, updated_at";

const db = () => {
  const c = clienteSupabase();
  if (!c) throw new Error("As novidades precisam do Supabase configurado.");
  return c;
};

function traduzirErro(error) {
  if (!error) return null;
  if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
    return new Error("A área de novidades ainda não foi ativada no banco (falta rodar o SQL da etapa 2).");
  }
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return new Error("Só o admin pode fazer isso.");
  }
  return new Error(error.message || "Algo deu errado. Tente de novo.");
}

// ------------------------------------------------------------
// Leitura
// ------------------------------------------------------------

/** Publicações mais recentes. tipo: "noticia" | "resenha" | "video" | null (todas) */
export async function listarPosts({ tipo = null, limite = 12, pagina = 1, rascunhos = false } = {}) {
  let q = db().from("posts").select(CAMPOS, { count: "exact" });
  if (!rascunhos) q = q.eq("published", true);
  if (tipo) q = q.eq("kind", tipo);
  q = q
    .order("published_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .range((pagina - 1) * limite, pagina * limite - 1);
  const { data, error, count } = await q;
  if (error) throw traduzirErro(error);
  return { itens: data, total: count ?? data.length };
}

/** Publicações marcadas como destaque (carrossel da página inicial). */
export async function destaques(limite = 5) {
  const { data, error } = await db()
    .from("posts").select(CAMPOS)
    .eq("published", true).eq("featured", true)
    .order("published_at", { ascending: false })
    .limit(limite);
  if (error) throw traduzirErro(error);
  return data;
}

export async function lerPost(id) {
  const { data, error } = await db().from("posts").select(`${CAMPOS}, body`).eq("id", id).maybeSingle();
  if (error) throw traduzirErro(error);
  return data;
}

// ------------------------------------------------------------
// Admin
// ------------------------------------------------------------

export async function souAdmin() {
  if (MODO_DEMO) return false;
  const perfil = await lerPerfil().catch(() => null);
  return perfil?.papel === "admin";
}

export async function salvarPost(post) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta para publicar.");
  const dados = {
    kind: post.kind,
    title: post.title.trim(),
    summary: post.summary?.trim() || null,
    body: post.body?.trim() || null,
    cover_url: post.cover_url?.trim() || null,
    video_url: post.video_url?.trim() || null,
    mal_id: post.mal_id || null,
    anime_title: post.anime_title || null,
    score: post.kind === "resenha" && post.score ? Number(post.score) : null,
    featured: Boolean(post.featured),
    published: Boolean(post.published),
  };
  const consulta = post.id
    ? db().from("posts").update(dados).eq("id", post.id).select("id").single()
    : db().from("posts").insert({ ...dados, author_id: u.id }).select("id").single();
  const { data, error } = await consulta;
  if (error) throw traduzirErro(error);
  return data.id;
}

export async function excluirPost(id) {
  const { error } = await db().from("posts").delete().eq("id", id);
  if (error) throw traduzirErro(error);
}

/** Envia uma imagem de capa para o Storage e devolve o endereço público. */
export async function enviarCapa(arquivo) {
  if (!arquivo) throw new Error("Escolha uma imagem.");
  if (arquivo.size > 5 * 1024 * 1024) throw new Error("A imagem precisa ter no máximo 5 MB.");
  if (!/^image\/(jpeg|png|webp|gif)$/.test(arquivo.type)) throw new Error("Use uma imagem JPG, PNG, WEBP ou GIF.");
  const ext = arquivo.type.split("/")[1].replace("jpeg", "jpg");
  const caminho = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db().storage.from("capas").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("A pasta de capas ainda não existe (falta rodar o SQL da etapa 2).");
    throw traduzirErro(error);
  }
  return db().storage.from("capas").getPublicUrl(caminho).data.publicUrl;
}

// ------------------------------------------------------------
// Utilidades de exibição
// ------------------------------------------------------------

/** Código do vídeo no YouTube a partir de qualquer formato de link. */
export function idYoutube(url = "") {
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function capaDoPost(p) {
  if (p.cover_url) return p.cover_url;
  const yt = idYoutube(p.video_url);
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : "";
}

/**
 * Converte o texto do post em HTML seguro. Formatação aceita:
 *   ## Título de seção      **negrito**      *itálico*
 *   [texto do link](https://endereço)       - item de lista
 * Linhas em branco separam parágrafos.
 */
export function textoParaHtml(texto = "") {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  return String(texto)
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((bloco) => {
      const b = bloco.trim();
      if (!b) return "";
      if (b.startsWith("## ")) return `<h2>${inline(b.slice(3))}</h2>`;
      const linhas = b.split("\n");
      if (linhas.every((l) => /^[-•] /.test(l.trim()))) {
        return `<ul>${linhas.map((l) => `<li>${inline(l.trim().slice(2))}</li>`).join("")}</ul>`;
      }
      return `<p>${linhas.map(inline).join("<br>")}</p>`;
    })
    .join("");
}

const dataLonga = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });
export const formatarData = (iso) => (iso ? dataLonga.format(new Date(iso)) : "");

/** Cartão de publicação para as listas de novidades. */
export function cartaoPost(p) {
  const capa = capaDoPost(p);
  const ehVideo = Boolean(idYoutube(p.video_url));
  return `
    <a class="cartao-post" href="post.html?id=${p.id}">
      <div class="cartao-post-capa">
        ${capa ? `<img src="${esc(capa)}" alt="" loading="lazy">` : `<span class="sem-capa-post">${esc(TIPOS_POST[p.kind].nome)}</span>`}
        ${ehVideo ? `<span class="icone-play" aria-hidden="true">▶</span>` : ""}
        <span class="selo-tipo selo-${p.kind}">${TIPOS_POST[p.kind].nome}</span>
      </div>
      <div class="cartao-post-texto">
        <h3>${esc(p.title)}</h3>
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
        <span class="data">${formatarData(p.published_at)}${p.anime_title ? `, ${esc(p.anime_title)}` : ""}</span>
      </div>
    </a>`;
}
