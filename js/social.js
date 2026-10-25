// ============================================================
// Social: seguir usuários e o que quem você segue fez num anime.
// Tabelas em supabase/etapa9_social.sql
// ============================================================

import { clienteSupabase, usuarioAtual } from "./store.js";

const db = () => {
  const c = clienteSupabase();
  if (!c) throw new Error("Seguir precisa do Supabase configurado.");
  return c;
};

function erroAmigavel(error) {
  if (/does not exist|schema cache/i.test(error.message)) {
    return new Error("Seguir ainda não foi ativado no banco (falta rodar o SQL da etapa 9).");
  }
  return new Error(error.message);
}

const CAMPOS_PERFIL = "id, nickname, tag, display_name, avatar_url, favorite_title, supporter_until";

export async function contagem(usuarioId) {
  const { data, error } = await db().rpc("contagem_seguidores", { p_usuario: usuarioId });
  if (error) return { seguidores: 0, seguindo: 0 };
  return data?.[0] || { seguidores: 0, seguindo: 0 };
}

export async function euSigo(usuarioId) {
  const u = await usuarioAtual();
  if (!u || u.id === usuarioId) return false;
  const { data } = await db().from("follows").select("following_id").eq("follower_id", u.id).eq("following_id", usuarioId).maybeSingle();
  return Boolean(data);
}

export async function seguir(usuarioId, ligar) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta Google para seguir pessoas.");
  if (u.id === usuarioId) throw new Error("Você não pode seguir a si mesmo.");
  const { error } = ligar
    ? await db().from("follows").insert({ follower_id: u.id, following_id: usuarioId })
    : await db().from("follows").delete().eq("follower_id", u.id).eq("following_id", usuarioId);
  if (error && error.code !== "23505") throw erroAmigavel(error);
}

/** Lista de seguidores ou de quem a pessoa segue. tipo: "seguidores" | "seguindo" */
export async function listaSocial(usuarioId, tipo) {
  const [filtro, alvo] = tipo === "seguidores" ? ["following_id", "follower_id"] : ["follower_id", "following_id"];
  const { data, error } = await db().from("follows").select(`${alvo}, created_at`).eq(filtro, usuarioId)
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw erroAmigavel(error);
  const ids = data.map((f) => f[alvo]);
  if (!ids.length) return [];
  const { data: perfis } = await db().from("profiles").select(CAMPOS_PERFIL).in("id", ids);
  const porId = new Map((perfis || []).map((p) => [p.id, p]));
  return ids.map((id) => porId.get(id)).filter(Boolean);
}

/**
 * Na página do anime: quem eu sigo já assistiu e quem avaliou.
 * Devolve { assistiram: [perfil], avaliaram: [{ perfil, nota }] }
 */
export async function amigosNoAnime(malId) {
  const u = await usuarioAtual();
  if (!u) return null;
  const { data: sigo, error } = await db().from("follows").select("following_id").eq("follower_id", u.id).limit(1000);
  if (error || !sigo?.length) return { assistiram: [], avaliaram: [], segueAlguem: false };
  const ids = sigo.map((s) => s.following_id);

  const [lista, notas] = await Promise.all([
    db().from("anime_list").select("user_id").eq("mal_id", malId).eq("status", "assistido").in("user_id", ids),
    db().from("reviews").select("user_id, score").eq("mal_id", malId).in("user_id", ids),
  ]);
  const idsEnvolvidos = [...new Set([...(lista.data || []).map((x) => x.user_id), ...(notas.data || []).map((x) => x.user_id)])];
  if (!idsEnvolvidos.length) return { assistiram: [], avaliaram: [], segueAlguem: true };

  const { data: perfis } = await db().from("profiles").select(CAMPOS_PERFIL).in("id", idsEnvolvidos);
  const porId = new Map((perfis || []).map((p) => [p.id, p]));
  return {
    assistiram: (lista.data || []).map((x) => porId.get(x.user_id)).filter(Boolean),
    avaliaram: (notas.data || []).map((x) => ({ perfil: porId.get(x.user_id), nota: x.score })).filter((x) => x.perfil),
    segueAlguem: true,
  };
}
