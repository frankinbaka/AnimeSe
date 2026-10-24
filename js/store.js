// ============================================================
// Login (Google) e dados do usuário: perfil e lista de animes.
//
// Com o Supabase configurado em config.js, usa o Supabase.
// Sem configuração, entra em MODO DEMO: login simulado e dados
// salvos no localStorage do navegador.
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const MODO_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const STATUS = [
  { id: "assistindo", nome: "Assistindo" },
  { id: "assistido", nome: "Já assisti" },
  { id: "pretendo", nome: "Pretendo assistir" },
  { id: "dropado", nome: "Dropei" },
];
export const nomeStatus = (id) => STATUS.find((s) => s.id === id)?.nome || id;

let supabase = null;
if (!MODO_DEMO) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ------------------------------------------------------------
// Modo demo (localStorage)
// ------------------------------------------------------------
const demo = {
  ler(chave, padrao) {
    try { return JSON.parse(localStorage.getItem("animese:" + chave)) ?? padrao; }
    catch { return padrao; }
  },
  gravar(chave, valor) {
    try { localStorage.setItem("animese:" + chave, JSON.stringify(valor)); } catch {}
  },
};
const USUARIO_DEMO = { id: "demo", email: "visitante@demo.local", nome: "Visitante", avatar: null };

// ------------------------------------------------------------
// Autenticação
// ------------------------------------------------------------

/** Usuário logado ou null. */
export async function usuarioAtual() {
  if (MODO_DEMO) return demo.ler("logado", false) ? USUARIO_DEMO : null;

  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    nome: u.user_metadata?.full_name || u.user_metadata?.name || u.email,
    avatar: u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
  };
}

export async function entrarComGoogle() {
  if (MODO_DEMO) {
    demo.gravar("logado", true);
    location.reload();
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.href },
  });
  if (error) throw error;
}

export async function sair() {
  if (MODO_DEMO) demo.gravar("logado", false);
  else await supabase.auth.signOut();
  location.href = "index.html";
}

// ------------------------------------------------------------
// Perfil
// ------------------------------------------------------------

/**
 * Perfil: { nick, tag, favoritoId, favoritoTitulo, favoritoImagem, avatar }
 */
export async function lerPerfil() {
  const u = await usuarioAtual();
  if (!u) return null;

  if (MODO_DEMO) {
    return { nick: "", tag: "", avatar: null, ...demo.ler("perfil", {}) };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("nickname, tag, favorite_mal_id, favorite_title, favorite_image, avatar_url, role")
    .eq("id", u.id)
    .maybeSingle();
  if (error) throw error;

  return {
    nick: data?.nickname || "",
    tag: data?.tag || "",
    favoritoId: data?.favorite_mal_id || null,
    favoritoTitulo: data?.favorite_title || "",
    favoritoImagem: data?.favorite_image || "",
    avatar: data?.avatar_url || u.avatar,
    papel: data?.role || "user",
  };
}

export async function salvarPerfil(perfil) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta Google para salvar o perfil.");

  if (MODO_DEMO) {
    demo.gravar("perfil", perfil);
    return;
  }

  const { error } = await supabase.from("profiles").upsert({
    id: u.id,
    nickname: perfil.nick,
    tag: perfil.tag || null,
    favorite_mal_id: perfil.favoritoId || null,
    favorite_title: perfil.favoritoTitulo || null,
    favorite_image: perfil.favoritoImagem || null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505") throw new Error("Esse nick já está em uso. Escolha outro.");
    throw error;
  }
}

// ------------------------------------------------------------
// Minha lista
// ------------------------------------------------------------

/** Lista completa do usuário: [{ id, titulo, imagem, episodios, nota, status, atualizado }] */
export async function lerLista() {
  const u = await usuarioAtual();
  if (!u) return [];

  if (MODO_DEMO) return Object.values(demo.ler("lista", {}));

  const { data, error } = await supabase
    .from("anime_list")
    .select("mal_id, title, image_url, episodes, score, status, updated_at")
    .eq("user_id", u.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return data.map((r) => ({
    id: r.mal_id, titulo: r.title, imagem: r.image_url, episodios: r.episodes,
    nota: r.score, status: r.status, atualizado: r.updated_at,
  }));
}

/** Status do anime na lista do usuário, ou null. */
export async function statusNaLista(malId) {
  const u = await usuarioAtual();
  if (!u) return null;

  if (MODO_DEMO) return demo.ler("lista", {})[malId]?.status || null;

  const { data } = await supabase
    .from("anime_list").select("status").eq("user_id", u.id).eq("mal_id", malId).maybeSingle();
  return data?.status || null;
}

export async function definirStatus(anime, status) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta Google para montar sua lista.");

  const item = {
    id: anime.id, titulo: anime.titulo, imagem: anime.imagem,
    episodios: anime.episodios, nota: anime.nota, status,
    atualizado: new Date().toISOString(),
  };

  if (MODO_DEMO) {
    const lista = demo.ler("lista", {});
    lista[anime.id] = item;
    demo.gravar("lista", lista);
    return;
  }

  const { error } = await supabase.from("anime_list").upsert(
    {
      user_id: u.id, mal_id: anime.id, title: anime.titulo, image_url: anime.imagem,
      episodes: anime.episodios, score: anime.nota, status, updated_at: item.atualizado,
    },
    { onConflict: "user_id,mal_id" }
  );
  if (error) throw error;
}

export async function removerDaLista(malId) {
  if (MODO_DEMO) {
    const lista = demo.ler("lista", {});
    delete lista[malId];
    demo.gravar("lista", lista);
    return;
  }
  const u = await usuarioAtual();
  if (!u) return;
  const { error } = await supabase.from("anime_list").delete().eq("user_id", u.id).eq("mal_id", malId);
  if (error) throw error;
}
