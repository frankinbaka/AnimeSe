// ============================================================
// Sinopse do anime traduzida para português (função da Vercel)
// ------------------------------------------------------------
// Uso: /api/traduzir?id=<id do anime no MyAnimeList>
//
// A função busca a sinopse no próprio MyAnimeList (assim ninguém
// consegue usá-la para traduzir textos aleatórios) e traduz:
//   1. com o DeepL, se DEEPL_API_KEY estiver configurada na Vercel
//      (recomendado: tradução melhor e oficial);
//   2. senão, com o tradutor público do Google (gratuito e sem chave,
//      mas não oficial: pode ficar indisponível ou limitar acessos).
//
// Cada sinopse traduzida fica guardada para sempre no Supabase
// (tabela synopses_pt, etapa 11), então é traduzida uma única vez.
// Para gravar lá, a função precisa da variável SUPABASE_SERVICE_ROLE_KEY
// na Vercel; sem ela, só lê o que já existe e continua funcionando.
// Além disso, a resposta fica 30 dias no cache da CDN da Vercel.
// ============================================================

const MAL = "https://api.myanimelist.net/v2/anime/";
// Endereço e chave pública do Supabase (os mesmos de js/config.js)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://nfcobuqwpphswostlyks.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mY29idXF3cHBoc3dvc3RseWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MjczOTQsImV4cCI6MjEwODQwMzM5NH0.vXO-YMlzidCzSrkOJ1uy3FzteacY4pPfBpta9rIs4oo";

module.exports = async function handler(req, res) {
  const id = String(req.query.id || "");
  if (!/^\d{1,7}$/.test(id)) return res.status(400).json({ erro: "Anime inválido." });

  const clientId = process.env.MAL_CLIENT_ID;
  if (!clientId) return res.status(500).json({ erro: "A chave do MyAnimeList não está configurada." });

  try {
    // 1. Já traduzida antes? (ou corrigida pelo admin)
    const salva = await lerSalva(id);
    const podeMelhorar = salva && salva.tradutor === "google" && !salva.revisado && process.env.DEEPL_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (salva && !podeMelhorar) return responder(res, salva.texto, salva.tradutor);

    const resp = await fetch(`${MAL}${id}?fields=synopsis`, { headers: { "X-MAL-CLIENT-ID": clientId } });
    if (!resp.ok) return res.status(resp.status === 404 ? 404 : 502).json({ erro: "Não foi possível buscar a sinopse." });
    const { synopsis } = await resp.json();

    const { texto, fonte } = separarFonte(synopsis || "");
    if (!texto) {
      res.setHeader("Cache-Control", "public, s-maxage=86400");
      return res.status(200).json({ sinopse: "", tradutor: null });
    }

    // 2. Traduz (DeepL; se falhar, Google)
    let traduzido, tradutor;
    if (process.env.DEEPL_API_KEY) traduzido = await traduzirDeepL(texto);
    if (traduzido) tradutor = "deepl";
    else if (podeMelhorar) return responder(res, salva.texto, salva.tradutor); // DeepL falhou: fica a do Google
    else { traduzido = await traduzirGoogle(texto); tradutor = "google"; }
    const sinopse = fonte ? `${traduzido}\n\n(Fonte: ${fonte})` : traduzido;

    // 3. Guarda para as próximas visitas
    await salvar(id, sinopse, tradutor);
    return responder(res, sinopse, tradutor);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ erro: "A tradução está indisponível no momento." });
  }
};

function responder(res, sinopse, tradutor) {
  res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=604800");
  return res.status(200).json({ sinopse, tradutor });
}

async function lerSalva(id) {
  try {
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/synopses_pt?mal_id=eq.${id}&select=texto,tradutor,revisado`, {
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
    });
    if (!resp.ok) return null; // tabela ainda não criada: segue traduzindo
    const [linha] = await resp.json();
    return linha?.texto ? linha : null;
  } catch {
    return null;
  }
}

async function salvar(id, texto, tradutor) {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/synopses_pt?on_conflict=mal_id`, {
      method: "POST",
      headers: {
        apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ mal_id: Number(id), texto, tradutor, atualizado: new Date().toISOString() }),
    });
  } catch {}
}

/** Tira o "[Written by MAL Rewrite]" e separa o "(Source: X)" do texto. */
function separarFonte(original) {
  let texto = original.replace(/\n*\[Written by [^\]]*\]\s*$/i, "").trim();
  let fonte = null;
  const m = texto.match(/\n*\(Source:\s*([^)]+)\)\s*$/i);
  if (m) {
    fonte = m[1].trim();
    texto = texto.slice(0, m.index).trim();
  }
  return { texto, fonte };
}

async function traduzirDeepL(texto) {
  const chave = process.env.DEEPL_API_KEY;
  // Chaves do plano gratuito terminam em ":fx" e usam outro endereço
  const base = chave.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const resp = await fetch(`${base}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: [texto], source_lang: "EN", target_lang: "PT-BR" }),
  });
  // Se o DeepL falhar (cota esgotada, chave errada), devolve null e quem chamou usa o Google
  if (!resp.ok) return null;
  const json = await resp.json();
  return json.translations?.[0]?.text || null;
}

async function traduzirGoogle(texto) {
  // Traduz por parágrafos para respeitar o limite de tamanho do pedido
  const paragrafos = texto.split(/\n+/).filter((p) => p.trim());
  const traduzidos = [];
  for (const p of paragrafos) {
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=" + encodeURIComponent(p.slice(0, 4500));
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("google " + resp.status);
    const json = await resp.json();
    traduzidos.push((json[0] || []).map((parte) => parte[0]).join(""));
  }
  return traduzidos.join("\n\n");
}
