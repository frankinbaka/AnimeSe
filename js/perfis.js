// ============================================================
// Perfil público: dados de um usuário, a lista dele, avaliações,
// comentários e os vídeos de criador de conteúdo.
// ============================================================

import { clienteSupabase } from "./store.js";

const db = () => {
  const c = clienteSupabase();
  if (!c) throw new Error("Os perfis precisam do Supabase configurado.");
  return c;
};

const CAMPOS_PUBLICOS =
  "id, nickname, tag, display_name, avatar_url, favorite_mal_id, favorite_title, favorite_image, bio, is_creator, youtube_url, tiktok_url, instagram_url, creator_videos, role, created_at";

/** Link para o perfil público de alguém (pelo id, que não muda quando o nick muda). */
export const linkPerfil = (autor) => (autor?.id ? `usuario.html?id=${autor.id}` : null);

/** Busca o perfil pelo id ou pelo nick. */
export async function perfilPublico({ id, nick }) {
  let q = db().from("profiles").select(CAMPOS_PUBLICOS);
  q = id ? q.eq("id", id) : q.ilike("nickname", nick);
  const { data, error } = await q.maybeSingle();
  if (error) {
    // Se o SQL da etapa 4 ainda não rodou, tenta só com os campos antigos
    if (/column .* does not exist/i.test(error.message)) {
      let q2 = db().from("profiles").select("id, nickname, tag, display_name, avatar_url, favorite_mal_id, favorite_title, favorite_image, created_at");
      q2 = id ? q2.eq("id", id) : q2.ilike("nickname", nick);
      const r = await q2.maybeSingle();
      if (r.error) throw new Error(r.error.message);
      return r.data;
    }
    throw new Error(error.message);
  }
  return data;
}

export async function listaDoUsuario(userId) {
  const { data, error } = await db()
    .from("anime_list")
    .select("mal_id, title, image_url, episodes, score, status, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data.map((r) => ({ id: r.mal_id, titulo: r.title, imagem: r.image_url, episodios: r.episodes, nota: r.score, status: r.status }));
}

export async function avaliacoesDoUsuario(userId) {
  const { data, error } = await db()
    .from("reviews")
    .select("id, mal_id, anime_title, anime_image, score, body, spoiler, created_at, review_likes(count)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data.map((r) => ({ ...r, likes: r.review_likes?.[0]?.count || 0 }));
}

/** Respostas que o usuário deixou nas avaliações de outras pessoas. */
export async function comentariosDoUsuario(userId) {
  const { data, error } = await db()
    .from("review_replies")
    .select("id, body, created_at, review:reviews(id, mal_id, anime_title, anime_image)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data;
}

export async function sugestoesDoUsuario(userId) {
  const { data, error } = await db()
    .from("recommendations")
    .select("mal_id, anime_title, anime_image, reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// ------------------------------------------------------------
// Redes sociais e vídeos
// ------------------------------------------------------------

export const REDES = {
  youtube: { nome: "YouTube", dominio: /^https:\/\/([a-z0-9-]+\.)?youtube\.com\//i, exemplo: "https://youtube.com/@seucanal" },
  tiktok: { nome: "TikTok", dominio: /^https:\/\/([a-z0-9-]+\.)?tiktok\.com\//i, exemplo: "https://tiktok.com/@seuusuario" },
  instagram: { nome: "Instagram", dominio: /^https:\/\/([a-z0-9-]+\.)?instagram\.com\//i, exemplo: "https://instagram.com/seuusuario" },
};

/** Ajusta o link da rede: põe https:// se faltar e confere o domínio. */
export function normalizarLinkRede(rede, valor) {
  let v = (valor || "").trim();
  if (!v) return { ok: true, valor: "" };
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  v = v.replace(/^http:\/\//i, "https://");
  return REDES[rede].dominio.test(v) ? { ok: true, valor: v } : { ok: false, valor: v };
}

/**
 * Reconhece um link de vídeo do YouTube, TikTok ou Instagram e devolve
 * o endereço para incorporar na página. Links curtos (vm.tiktok.com)
 * não trazem o número do vídeo, então pedimos o link completo.
 */
export function videoIncorporavel(url = "") {
  const u = String(url).trim();
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { rede: "youtube", embed: `https://www.youtube-nocookie.com/embed/${m[1]}`, vertical: /shorts\//.test(u), url: u };
  m = u.match(/tiktok\.com\/@[\w.-]+\/video\/(\d+)/) || u.match(/tiktok\.com\/(?:embed\/v2|v)\/(\d+)/);
  // Player oficial do TikTok: mostra só o vídeo, sem o cartão com legenda e botões do app
  if (m) return { rede: "tiktok", embed: `https://www.tiktok.com/player/v1/${m[1]}?description=0&music_info=0&rel=0&loop=1`, vertical: true, url: u };
  m = u.match(/instagram\.com\/(p|reel|reels|tv)\/([\w-]+)/);
  if (m) return { rede: "instagram", embed: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/embed`, vertical: m[1] !== "p", url: u };
  return null;
}

// ------------------------------------------------------------
// Pedido de acesso de criador (etapa 5)
// ------------------------------------------------------------
function erroAmigavel(error) {
  if (/function .* does not exist|schema cache/i.test(error.message)) {
    return new Error("O pedido de criador ainda não foi ativado no banco (falta rodar o SQL da etapa 5).");
  }
  return new Error(error.message);
}

/** Envia (ou reenvia) o pedido. dados: { youtube, tiktok, instagram, videos: [] } */
export async function solicitarCriador(dados) {
  const { error } = await db().rpc("solicitar_criador", { p_dados: dados });
  if (error) throw erroAmigavel(error);
}

export async function cancelarPedidoCriador() {
  const { error } = await db().rpc("cancelar_pedido_criador");
  if (error) throw erroAmigavel(error);
}

export async function sairDeCriador() {
  const { error } = await db().rpc("sair_de_criador");
  if (error) throw erroAmigavel(error);
}

// ----- Admin -----
export async function contarPedidosCriador() {
  const { data, error } = await db().rpc("pedidos_criador_pendentes");
  return error ? 0 : data || 0;
}

const CAMPOS_ADMIN =
  "id, nickname, tag, display_name, avatar_url, favorite_title, created_at, is_creator, youtube_url, tiktok_url, instagram_url, creator_videos, creator_status, creator_pending, creator_requested_at, creator_reviewed_at, creator_note";

export async function pedidosCriador() {
  const { data, error } = await db().from("profiles").select(CAMPOS_ADMIN)
    .eq("creator_status", "pending").order("creator_requested_at", { ascending: true });
  if (error) throw erroAmigavel(error);
  return data;
}

export async function criadoresAprovados() {
  const { data, error } = await db().from("profiles").select(CAMPOS_ADMIN)
    .eq("is_creator", true).order("creator_reviewed_at", { ascending: false });
  if (error) throw erroAmigavel(error);
  return data;
}

export async function avaliarCriador(usuarioId, aprovar, motivo = "") {
  const { error } = await db().rpc("avaliar_criador", { p_usuario: usuarioId, p_aprovar: aprovar, p_motivo: motivo || null });
  if (error) throw erroAmigavel(error);
}

export async function revogarCriador(usuarioId, motivo = "") {
  const { error } = await db().rpc("revogar_criador", { p_usuario: usuarioId, p_motivo: motivo || null });
  if (error) throw erroAmigavel(error);
}
