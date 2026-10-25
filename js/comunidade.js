// ============================================================
// Comunidade: avaliações (nota 1–10 + comentário), respostas,
// likes e animes sugeridos pelos usuários.
// Tabelas criadas em supabase/etapa3_comunidade.sql
// ============================================================

import { clienteSupabase, usuarioAtual, MODO_DEMO } from "./store.js";

const db = () => {
  const c = clienteSupabase();
  if (!c) throw new Error("A comunidade precisa do Supabase configurado.");
  return c;
};

export const COMUNIDADE_ATIVA = !MODO_DEMO;

// Campos públicos do autor (nick, tag, foto)
// O nome da ligação (!tabela_user_id_fkey) é necessário porque avaliações e
// perfis também se ligam pela tabela de likes.
const CAMPOS_AUTOR = "id, nickname, tag, display_name, avatar_url, favorite_title, supporter_until";
const autorDe = (tabela) => `autor:profiles!${tabela}_user_id_fkey(${CAMPOS_AUTOR})`;

export const NOTAS = {
  10: "Obra-prima", 9: "Excelente", 8: "Muito bom", 7: "Bom", 6: "Razoável",
  5: "Mediano", 4: "Ruim", 3: "Muito ruim", 2: "Horrível", 1: "Péssimo",
};

/** Nome para exibir: nick, ou o primeiro nome do Google. */
export function nomeAutor(autor) {
  return autor?.nickname || autor?.display_name?.split(" ")[0] || "Usuário";
}

function traduzirErro(error) {
  if (!error) return null;
  if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
    return new Error("A área da comunidade ainda não foi ativada no banco (falta rodar o SQL da etapa 3).");
  }
  if (error.code === "23505") return new Error("Você já fez isso neste anime.");
  if (error.code === "42501") return new Error("Você não tem permissão para fazer isso.");
  return new Error(error.message || "Algo deu errado. Tente de novo.");
}

async function exigirLogin() {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta Google para participar.");
  return u;
}

// ------------------------------------------------------------
// Avaliações
// ------------------------------------------------------------

/** Nota média dos usuários do site e quantidade de avaliações. */
export async function estatisticas(malId) {
  const { data, error } = await db().from("review_stats").select("average, total").eq("mal_id", malId).maybeSingle();
  if (error) throw traduzirErro(error);
  return { media: data ? Number(data.average) : null, total: data?.total || 0 };
}

/** Avaliações de um anime, com autor, respostas e total de likes. */
export async function avaliacoesDoAnime(malId) {
  const { data, error } = await db()
    .from("reviews")
    .select(`id, user_id, score, body, spoiler, created_at, updated_at, ${autorDe("reviews")},
             review_likes(count),
             review_replies(id, user_id, body, created_at, ${autorDe("review_replies")})`)
    .eq("mal_id", malId)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "review_replies", ascending: true })
    .limit(100);
  if (error) throw traduzirErro(error);
  return data.map((r) => ({ ...r, likes: r.review_likes?.[0]?.count || 0, respostas: r.review_replies || [] }));
}

/** Últimas avaliações do site inteiro (página da comunidade). */
export async function ultimasAvaliacoes(limite = 12) {
  const { data, error } = await db()
    .from("reviews")
    .select(`id, mal_id, anime_title, anime_image, score, body, spoiler, created_at, ${autorDe("reviews")}, review_likes(count)`)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw traduzirErro(error);
  return data.map((r) => ({ ...r, likes: r.review_likes?.[0]?.count || 0 }));
}

export async function salvarAvaliacao(anime, { nota, texto, spoiler }) {
  const u = await exigirLogin();
  const { error } = await db().from("reviews").upsert(
    {
      user_id: u.id, mal_id: anime.id, anime_title: anime.titulo, anime_image: anime.imagem,
      score: nota, body: texto?.trim() || null, spoiler: Boolean(spoiler), updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,mal_id" }
  );
  if (error) throw traduzirErro(error);
}

export async function excluirAvaliacao(id) {
  await exigirLogin();
  const { error } = await db().from("reviews").delete().eq("id", id);
  if (error) throw traduzirErro(error);
}

// ------------------------------------------------------------
// Likes e respostas
// ------------------------------------------------------------

/** IDs das avaliações (dentre as informadas) que o usuário curtiu. */
export async function meusLikes(ids) {
  const u = await usuarioAtual();
  if (!u || !ids.length) return new Set();
  const { data, error } = await db().from("review_likes").select("review_id").eq("user_id", u.id).in("review_id", ids);
  if (error) return new Set();
  return new Set(data.map((l) => l.review_id));
}

export async function curtir(reviewId) {
  const u = await exigirLogin();
  const { error } = await db().from("review_likes").insert({ review_id: reviewId, user_id: u.id });
  if (error && error.code !== "23505") throw traduzirErro(error);
}

export async function descurtir(reviewId) {
  const u = await exigirLogin();
  const { error } = await db().from("review_likes").delete().eq("review_id", reviewId).eq("user_id", u.id);
  if (error) throw traduzirErro(error);
}

export async function responder(reviewId, texto) {
  const u = await exigirLogin();
  const corpo = texto.trim();
  if (!corpo) throw new Error("Escreva sua resposta antes de enviar.");
  const { error } = await db().from("review_replies").insert({ review_id: reviewId, user_id: u.id, body: corpo });
  if (error) throw traduzirErro(error);
}

export async function excluirResposta(id) {
  await exigirLogin();
  const { error } = await db().from("review_replies").delete().eq("id", id);
  if (error) throw traduzirErro(error);
}

// ------------------------------------------------------------
// Sugestões da comunidade
// ------------------------------------------------------------

/** Animes mais sugeridos (mais pessoas primeiro, depois os mais recentes). */
export async function animesSugeridos(limite = 24) {
  const { data, error } = await db()
    .from("community_recommendations")
    .select("mal_id, anime_title, anime_image, total, last_at")
    .order("total", { ascending: false })
    .order("last_at", { ascending: false })
    .limit(limite);
  if (error) throw traduzirErro(error);
  return data;
}

/** Quem sugeriu um anime, com o motivo. */
export async function sugestoesDoAnime(malId) {
  const { data, error } = await db()
    .from("recommendations")
    .select(`id, user_id, reason, created_at, ${autorDe("recommendations")}`)
    .eq("mal_id", malId)
    .order("created_at", { ascending: false });
  if (error) throw traduzirErro(error);
  return data;
}

export async function sugerir(anime, motivo) {
  const u = await exigirLogin();
  const { error } = await db().from("recommendations").upsert(
    { user_id: u.id, mal_id: anime.id, anime_title: anime.titulo, anime_image: anime.imagem, reason: motivo?.trim() || null },
    { onConflict: "user_id,mal_id" }
  );
  if (error) throw traduzirErro(error);
}

export async function removerSugestao(malId) {
  const u = await exigirLogin();
  const { error } = await db().from("recommendations").delete().eq("user_id", u.id).eq("mal_id", malId);
  if (error) throw traduzirErro(error);
}

// ------------------------------------------------------------
// Datas
// ------------------------------------------------------------
const relativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function tempoAtras(iso) {
  const seg = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const passos = [[60, "second"], [60, "minute"], [24, "hour"], [30, "day"], [12, "month"], [Infinity, "year"]];
  let valor = seg;
  for (const [limite, unidade] of passos) {
    if (Math.abs(valor) < limite) return relativo.format(valor, unidade);
    valor = Math.round(valor / limite);
  }
  return "";
}
