// ============================================================
// Feed: vídeos dos criadores + publicações oficiais do admin,
// com curtidas e republicações. Tabelas em supabase/etapa6_feed.sql
// ============================================================

import { clienteSupabase, usuarioAtual } from "./store.js";
import { videoIncorporavel } from "./perfis.js";

const db = () => {
  const c = clienteSupabase();
  if (!c) throw new Error("O feed precisa do Supabase configurado.");
  return c;
};

function erroAmigavel(error) {
  if (/does not exist|schema cache/i.test(error.message)) {
    return new Error("O feed ainda não foi ativado no banco (falta rodar o SQL da etapa 6).");
  }
  if (/row-level security/i.test(error.message)) {
    return new Error("Só criadores de conteúdo aprovados podem publicar no feed.");
  }
  return new Error(error.message);
}

const CAMPOS_AUTOR = "id, nickname, tag, display_name, avatar_url, favorite_title, is_creator, role";

/** Junta os dados dos autores aos itens. */
async function comAutores(itens) {
  const ids = [...new Set(itens.map((i) => i.autor_id).filter(Boolean))];
  if (!ids.length) return itens;
  const { data } = await db().from("profiles").select(CAMPOS_AUTOR).in("id", ids);
  const porId = new Map((data || []).map((p) => [p.id, p]));
  return itens.map((i) => ({ ...i, autor: porId.get(i.autor_id) || null }));
}

/** Uma página do feed, do mais novo para o mais antigo. */
export async function paginaDoFeed({ antesDe = null, limite = 8 } = {}) {
  let q = db().from("feed_itens").select("*").order("created_at", { ascending: false }).limit(limite);
  if (antesDe) q = q.lt("created_at", antesDe);
  const { data, error } = await q;
  if (error) throw erroAmigavel(error);
  return comAutores(data);
}

export async function itemDoFeed(chave) {
  const { data, error } = await db().from("feed_itens").select("*").eq("chave", chave).maybeSingle();
  if (error) throw erroAmigavel(error);
  return data ? (await comAutores([data]))[0] : null;
}

/** Itens que o usuário curtiu e republicou, dentre os informados. */
export async function minhasInteracoes(chaves) {
  const u = await usuarioAtual();
  if (!u || !chaves.length) return { curtidas: new Set(), republicados: new Set() };
  const [l, r] = await Promise.all([
    db().from("feed_likes").select("item_key").eq("user_id", u.id).in("item_key", chaves),
    db().from("feed_reposts").select("item_key").eq("user_id", u.id).in("item_key", chaves),
  ]);
  return {
    curtidas: new Set((l.data || []).map((x) => x.item_key)),
    republicados: new Set((r.data || []).map((x) => x.item_key)),
  };
}

async function alternar(tabela, chave, ligar) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta Google para interagir.");
  const { error } = ligar
    ? await db().from(tabela).insert({ item_key: chave, user_id: u.id })
    : await db().from(tabela).delete().eq("item_key", chave).eq("user_id", u.id);
  if (error && error.code !== "23505") throw erroAmigavel(error);
}
export const curtirItem = (chave, ligar) => alternar("feed_likes", chave, ligar);
export const republicarItem = (chave, ligar) => alternar("feed_reposts", chave, ligar);

/** Criador publica um vídeo a partir do link. */
export async function publicarVideo(url, legenda) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta para publicar.");
  const v = videoIncorporavel(url);
  if (!v) throw new Error("Não reconheci esse link. Use um vídeo do YouTube, TikTok ou Instagram.");
  const { error } = await db().from("feed_videos").insert({
    user_id: u.id, video_url: v.url, rede: v.rede, legenda: legenda?.trim() || null,
  });
  if (error) throw erroAmigavel(error);
}

export async function excluirVideo(chave) {
  const id = Number(String(chave).replace("c:", ""));
  const { error } = await db().from("feed_videos").delete().eq("id", id);
  if (error) throw erroAmigavel(error);
}

// ----- Para o perfil público -----
export async function videosDoFeedDe(userId) {
  const { data, error } = await db().from("feed_itens").select("*")
    .eq("origem", "criador").eq("autor_id", userId).order("created_at", { ascending: false }).limit(50);
  if (error) return [];
  return data;
}

export async function republicadosPor(userId) {
  const { data: reps, error } = await db().from("feed_reposts").select("item_key, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  if (error || !reps.length) return [];
  const { data: itens } = await db().from("feed_itens").select("*").in("chave", reps.map((r) => r.item_key));
  const porChave = new Map((itens || []).map((i) => [i.chave, i]));
  return comAutores(reps.map((r) => porChave.get(r.item_key)).filter(Boolean));
}

// ------------------------------------------------------------
// Denúncias
// ------------------------------------------------------------
export const MOTIVOS_DENUNCIA = {
  sexual: "Conteúdo sexual ou nudez",
  violencia: "Violência ou conteúdo chocante",
  odio: "Ódio, assédio ou ofensa",
  spam: "Spam ou golpe",
  fora_do_contexto: "Não tem a ver com anime",
  outro: "Outro motivo",
};

export async function denunciar(chave, motivo, detalhe) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta Google para denunciar.");
  const { error } = await db().from("feed_reports").insert({
    item_key: chave, reporter_id: u.id, motivo, detalhe: detalhe?.trim() || null,
  });
  if (error) {
    if (error.code === "23505") throw new Error("Você já denunciou esta publicação. Obrigado!");
    throw erroAmigavel(error);
  }
}

// ----- Admin -----
export async function contarDenunciasAbertas() {
  const { data, error } = await db().rpc("denuncias_abertas");
  return error ? 0 : data || 0;
}

/** Denúncias agrupadas por item: abertas primeiro, depois as resolvidas recentes. */
export async function denunciasParaAdmin() {
  const { data, error } = await db().from("feed_reports")
    .select("id, item_key, reporter_id, motivo, detalhe, status, autor_id, video_url, legenda, created_at, resolved_at")
    .order("created_at", { ascending: false }).limit(300);
  if (error) throw erroAmigavel(error);

  const ids = [...new Set(data.flatMap((d) => [d.reporter_id, d.autor_id]).filter(Boolean))];
  const { data: perfis } = ids.length
    ? await db().from("profiles").select("id, nickname, tag, display_name, avatar_url").in("id", ids)
    : { data: [] };
  const porId = new Map((perfis || []).map((p) => [p.id, p]));

  const grupos = new Map();
  for (const d of data) {
    if (!grupos.has(d.item_key)) {
      grupos.set(d.item_key, { chave: d.item_key, autor: porId.get(d.autor_id), video_url: d.video_url, legenda: d.legenda, denuncias: [] });
    }
    grupos.get(d.item_key).denuncias.push({ ...d, denunciante: porId.get(d.reporter_id) });
  }
  const lista = [...grupos.values()].map((g) => ({
    ...g,
    aberto: g.denuncias.some((d) => d.status === "aberta"),
    situacao: g.denuncias[0].status,
  }));
  return { abertas: lista.filter((g) => g.aberto), resolvidas: lista.filter((g) => !g.aberto).slice(0, 20) };
}

export async function resolverDenuncias(chave, remover) {
  const { error } = await db().rpc("resolver_denuncias", { p_item: chave, p_remover: remover });
  if (error) throw erroAmigavel(error);
}
