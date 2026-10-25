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

/** Cliente do Supabase para os outros módulos (null no modo demo). */
export const clienteSupabase = () => supabase;

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
    .select("*")
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
    bio: data?.bio || "",
    criador: Boolean(data?.is_creator),
    youtube: data?.youtube_url || "",
    tiktok: data?.tiktok_url || "",
    instagram: data?.instagram_url || "",
    videos: Array.isArray(data?.creator_videos) ? data.creator_videos : [],
    // Pedido de criador (etapa 5): none | pending | approved | rejected
    criadorStatus: data?.creator_status || (data?.is_creator ? "approved" : "none"),
    criadorPendente: data?.creator_pending || null,
    criadorPedidoEm: data?.creator_requested_at || null,
    criadorMotivo: data?.creator_note || "",
    // Apoio (etapa 8)
    apoiadorAte: data?.supporter_until || null,
    apoiadorPublico: data?.supporter_public !== false,
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
    // "Sobre mim" (os links de criador vão por pedido ao admin, em perfis.js)
    ...("bio" in perfil && { bio: perfil.bio?.trim() || null }),
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
    .select("*")
    .eq("user_id", u.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return data.map((r) => ({
    id: r.mal_id, titulo: r.title, imagem: r.image_url, episodios: r.episodes,
    nota: r.score, status: r.status, atualizado: r.updated_at, franquia: r.franchise_id || null,
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

  // Franquia (etapa 10): agrupa temporadas e filmes no mesmo card da lista
  let franquia = anime.franquia || null;
  if (!franquia) {
    const { franquiaDe } = await import("./franquias.js");
    franquia = await Promise.race([franquiaDe(anime.id), new Promise((ok) => setTimeout(() => ok(null), 4000))]);
  }
  const linha = {
    user_id: u.id, mal_id: anime.id, title: anime.titulo, image_url: anime.imagem,
    episodes: anime.episodios, score: anime.nota, status, updated_at: item.atualizado,
  };
  let { error } = await supabase.from("anime_list").upsert(
    franquia ? { ...linha, franchise_id: franquia } : linha, { onConflict: "user_id,mal_id" });
  // Banco sem a coluna ainda (SQL da etapa 10 não rodado): salva sem ela
  if (error && /franchise_id/.test(error.message)) {
    ({ error } = await supabase.from("anime_list").upsert(linha, { onConflict: "user_id,mal_id" }));
  }
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

// ------------------------------------------------------------
// Foto de perfil (etapa 7)
// ------------------------------------------------------------

/** Corta a imagem em quadrado (centro) e reduz para 320x320 em WEBP. */
async function prepararFoto(arquivo) {
  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) throw new Error("Não consegui abrir essa imagem. Use JPG, PNG ou WEBP.");
  const lado = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 320;
  canvas.getContext("2d").drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, 320, 320);
  return new Promise((ok) => canvas.toBlob(ok, "image/webp", 0.88));
}

/** Envia uma nova foto de perfil e devolve o endereço dela. */
export async function enviarFotoPerfil(arquivo) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta para trocar a foto.");
  if (!arquivo) throw new Error("Escolha uma imagem.");
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(arquivo.type)) throw new Error("Use uma imagem JPG, PNG ou WEBP.");
  if (arquivo.size > 15 * 1024 * 1024) throw new Error("A imagem é grande demais (máximo 15 MB).");
  if (MODO_DEMO) throw new Error("A troca de foto precisa do Supabase configurado.");

  const blob = await prepararFoto(arquivo);
  const pasta = u.id;
  const caminho = `${pasta}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from("avatares").upload(caminho, blob, { contentType: "image/webp" });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("A troca de foto ainda não foi ativada no banco (falta rodar o SQL da etapa 7).");
    throw new Error(error.message);
  }
  const url = supabase.storage.from("avatares").getPublicUrl(caminho).data.publicUrl;

  const { error: erroPerfil } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", u.id);
  if (erroPerfil) throw new Error(erroPerfil.message);

  // Apaga as fotos antigas para não ocupar espaço
  const { data: antigos } = await supabase.storage.from("avatares").list(pasta);
  const remover = (antigos || []).map((f) => `${pasta}/${f.name}`).filter((c) => c !== caminho);
  if (remover.length) await supabase.storage.from("avatares").remove(remover);
  return url;
}

/** Volta a usar a foto da conta Google. */
export async function usarFotoGoogle() {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta para trocar a foto.");
  const { error } = await supabase.from("profiles").update({ avatar_url: u.avatar }).eq("id", u.id);
  if (error) throw new Error(error.message);
  const { data: antigos } = await supabase.storage.from("avatares").list(u.id);
  if (antigos?.length) await supabase.storage.from("avatares").remove(antigos.map((f) => `${u.id}/${f.name}`));
  return u.avatar;
}
