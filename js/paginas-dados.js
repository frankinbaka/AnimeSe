// ============================================================
// Páginas da comunidade: pedido, aprovação, seguir, publicações
// (texto e imagem) e curtidas. Tabelas em supabase/etapa12_paginas.sql
// ============================================================

import { clienteSupabase, usuarioAtual } from "./store.js";

const db = () => {
  const c = clienteSupabase();
  if (!c) throw new Error("As páginas precisam do Supabase configurado.");
  return c;
};

function erroAmigavel(error) {
  const msg = error?.message || "";
  if (/does not exist|schema cache/i.test(msg)) return new Error("As páginas ainda não foram ativadas no banco (falta rodar o SQL da etapa 12).");
  if (/pages_slug_key|duplicate key/i.test(msg)) return new Error("Esse @ já está em uso. Escolha outro.");
  if (/slug/i.test(msg) && /check/i.test(msg)) return new Error("O @ deve ter de 3 a 30 letras minúsculas, números, ponto ou _.");
  if (/name/i.test(msg) && /check/i.test(msg)) return new Error("O nome deve ter de 3 a 50 caracteres.");
  return new Error(msg.replace(/^.*?ERROR:\s*/, ""));
}

export const CAMPOS_PAGINA = "id, owner_id, slug, name, description, avatar_url, status, admin_note, followers_count, posts_count, created_at, reviewed_at";
const CAMPOS_POST = `id, page_id, body, image_url, likes_count, created_at,
  pagina:pages!page_posts_page_id_fkey(id, slug, name, avatar_url, owner_id)`;
export const POR_VEZ = 15;

export const limparSlug = (t = "") => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\s+/g, "_").replace(/[^a-z0-9_.]/g, "").slice(0, 30);

export const STATUS_PAGINA = {
  pending: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Recusada",
  suspended: "Suspensa",
};

// ------------------------------------------------------------
// Imagens: reduz no navegador antes de enviar (GIF vai como está,
// para não perder a animação)
// ------------------------------------------------------------
async function reduzirImagem(arquivo, ladoMax, quadrado = false) {
  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) throw new Error("Não consegui abrir essa imagem. Use JPG, PNG, WEBP ou GIF.");
  let { width: w, height: h } = bitmap;
  let sx = 0, sy = 0, sw = w, sh = h;
  if (quadrado) {
    const lado = Math.min(w, h);
    sx = (w - lado) / 2; sy = (h - lado) / 2; sw = sh = lado;
    w = h = Math.min(lado, ladoMax);
  } else {
    const escala = Math.min(1, ladoMax / Math.max(w, h));
    w = Math.round(w * escala); h = Math.round(h * escala);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  return new Promise((ok) => canvas.toBlob(ok, "image/webp", 0.85));
}

export async function enviarImagem(arquivo, { tipo = "post" } = {}) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta para enviar imagens.");
  if (!arquivo) throw new Error("Escolha uma imagem.");
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(arquivo.type)) throw new Error("Use uma imagem JPG, PNG, WEBP ou GIF.");
  const gif = arquivo.type === "image/gif" && tipo === "post";
  if (gif && arquivo.size > 5 * 1024 * 1024) throw new Error("GIFs podem ter no máximo 5 MB.");
  if (!gif && arquivo.size > 20 * 1024 * 1024) throw new Error("A imagem é grande demais (máximo 20 MB).");

  const blob = gif ? arquivo : await reduzirImagem(arquivo, tipo === "avatar" ? 400 : 1600, tipo === "avatar");
  const caminho = `${u.id}/${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${gif ? "gif" : "webp"}`;
  const { error } = await db().storage.from("paginas").upload(caminho, blob, { contentType: gif ? "image/gif" : "image/webp" });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("O envio de imagens ainda não foi ativado no banco (falta rodar o SQL da etapa 12).");
    throw new Error(error.message);
  }
  return db().storage.from("paginas").getPublicUrl(caminho).data.publicUrl;
}

/** Apaga do Storage uma imagem que foi enviada pelo site (ignora links externos). */
export async function apagarImagem(url) {
  const m = url?.match(/\/storage\/v1\/object\/public\/paginas\/(.+)$/);
  if (m) await db().storage.from("paginas").remove([decodeURIComponent(m[1])]).catch(() => {});
}

// ------------------------------------------------------------
// Páginas
// ------------------------------------------------------------
export async function pedirPagina({ slug, nome, descricao, avatar }) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta para criar uma página.");
  const { data, error } = await db().from("pages").insert({
    owner_id: u.id, slug: limparSlug(slug), name: nome.trim(), description: descricao?.trim() || null, avatar_url: avatar || null,
  }).select(CAMPOS_PAGINA).single();
  if (error) throw erroAmigavel(error);
  return data;
}

export async function editarPagina(id, { slug, nome, descricao, avatar }) {
  const campos = { name: nome.trim(), description: descricao?.trim() || null, avatar_url: avatar || null };
  if (slug) campos.slug = limparSlug(slug);
  const { data, error } = await db().from("pages").update(campos).eq("id", id).select(CAMPOS_PAGINA).single();
  if (error) throw erroAmigavel(error);
  return data;
}

export async function apagarPagina(id) {
  const { error } = await db().from("pages").delete().eq("id", id);
  if (error) throw erroAmigavel(error);
}

export async function minhasPaginas() {
  const u = await usuarioAtual();
  if (!u) return [];
  const { data, error } = await db().from("pages").select(CAMPOS_PAGINA).eq("owner_id", u.id).order("created_at");
  if (error) throw erroAmigavel(error);
  return data;
}

export async function paginaPorSlug(slug) {
  const { data, error } = await db().from("pages").select(CAMPOS_PAGINA).eq("slug", String(slug).toLowerCase()).maybeSingle();
  if (error) throw erroAmigavel(error);
  return data;
}

/** Páginas aprovadas: busca por nome/@ ou as mais seguidas. */
export async function listarPaginas({ busca = "", limite = 60 } = {}) {
  let q = db().from("pages").select(CAMPOS_PAGINA).eq("status", "approved");
  const termo = busca.trim().replace(/[%,()]/g, "");
  if (termo) q = q.or(`name.ilike.%${termo}%,slug.ilike.%${termo}%`);
  const { data, error } = await q.order("followers_count", { ascending: false }).order("created_at", { ascending: false }).limit(limite);
  if (error) throw erroAmigavel(error);
  return data;
}

/** Páginas que um usuário administra (para o perfil público). */
export async function paginasDoUsuario(usuarioId) {
  const { data } = await db().from("pages").select(CAMPOS_PAGINA).eq("owner_id", usuarioId).eq("status", "approved").order("created_at");
  return data || [];
}

// ------------------------------------------------------------
// Seguir
// ------------------------------------------------------------
export async function paginasQueSigo() {
  const u = await usuarioAtual();
  if (!u) return new Set();
  const { data } = await db().from("page_follows").select("page_id").eq("user_id", u.id).limit(1000);
  return new Set((data || []).map((x) => x.page_id));
}

export async function seguirPagina(paginaId, ligar) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta para seguir páginas.");
  const { error } = ligar
    ? await db().from("page_follows").insert({ user_id: u.id, page_id: paginaId })
    : await db().from("page_follows").delete().eq("user_id", u.id).eq("page_id", paginaId);
  if (error && error.code !== "23505") throw erroAmigavel(error);
}

// ------------------------------------------------------------
// Publicações
// ------------------------------------------------------------
export async function publicar(paginaId, { texto, imagem }) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta para publicar.");
  if (!texto?.trim() && !imagem) throw new Error("Escreva algo ou escolha uma imagem.");
  const { data, error } = await db().from("page_posts")
    .insert({ page_id: paginaId, author_id: u.id, body: texto?.trim() || null, image_url: imagem || null })
    .select(CAMPOS_POST).single();
  if (error) throw erroAmigavel(error);
  return data;
}

export async function apagarPublicacao(post) {
  const { error } = await db().from("page_posts").delete().eq("id", post.id);
  if (error) throw erroAmigavel(error);
  if (post.image_url) await apagarImagem(post.image_url);
}

/**
 * Publicações em ordem da mais nova.
 *   { paginas: [ids] } → só dessas páginas (feed "Seguindo" ou página única)
 *   sem paginas       → de todas as páginas aprovadas ("Descobrir")
 *   antesDe           → para "carregar mais"
 */
export async function publicacoes({ paginas = null, antesDe = null, limite = POR_VEZ } = {}) {
  if (paginas && !paginas.length) return [];
  let q = db().from("page_posts").select(CAMPOS_POST);
  if (paginas) q = q.in("page_id", paginas);
  if (antesDe) q = q.lt("created_at", antesDe);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limite);
  if (error) throw erroAmigavel(error);
  return data.filter((p) => p.pagina);
}

export async function minhasCurtidas(ids) {
  const u = await usuarioAtual();
  if (!u || !ids.length) return new Set();
  const { data } = await db().from("page_post_likes").select("post_id").eq("user_id", u.id).in("post_id", ids);
  return new Set((data || []).map((x) => x.post_id));
}

export async function curtir(postId, ligar) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta para curtir.");
  const { error } = ligar
    ? await db().from("page_post_likes").insert({ user_id: u.id, post_id: postId })
    : await db().from("page_post_likes").delete().eq("user_id", u.id).eq("post_id", postId);
  if (error && error.code !== "23505") throw erroAmigavel(error);
}

// ------------------------------------------------------------
// Admin
// ------------------------------------------------------------
export async function paginasParaModerar() {
  const { data, error } = await db().from("pages")
    .select(`${CAMPOS_PAGINA}, dono:profiles!pages_owner_id_fkey(id, nickname, tag, display_name, avatar_url)`)
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw erroAmigavel(error);
  return data;
}

export async function moderarPagina(id, status, nota = "") {
  const { error } = await db().rpc("moderar_pagina", { p_pagina: id, p_status: status, p_nota: nota || null });
  if (error) throw erroAmigavel(error);
}
