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
// O resultado fica 30 dias no cache da CDN da Vercel, então cada
// sinopse é traduzida poucas vezes, não a cada visita.
// ============================================================

const MAL = "https://api.myanimelist.net/v2/anime/";

module.exports = async function handler(req, res) {
  const id = String(req.query.id || "");
  if (!/^\d{1,7}$/.test(id)) return res.status(400).json({ erro: "Anime inválido." });

  const clientId = process.env.MAL_CLIENT_ID;
  if (!clientId) return res.status(500).json({ erro: "A chave do MyAnimeList não está configurada." });

  try {
    const resp = await fetch(`${MAL}${id}?fields=synopsis`, { headers: { "X-MAL-CLIENT-ID": clientId } });
    if (!resp.ok) return res.status(resp.status === 404 ? 404 : 502).json({ erro: "Não foi possível buscar a sinopse." });
    const { synopsis } = await resp.json();

    const { texto, fonte } = separarFonte(synopsis || "");
    if (!texto) {
      res.setHeader("Cache-Control", "public, s-maxage=86400");
      return res.status(200).json({ sinopse: "", tradutor: null });
    }

    const tradutor = process.env.DEEPL_API_KEY ? "deepl" : "google";
    const traduzido = tradutor === "deepl" ? await traduzirDeepL(texto) : await traduzirGoogle(texto);
    const sinopse = fonte ? `${traduzido}\n\n(Fonte: ${fonte})` : traduzido;

    res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=604800");
    return res.status(200).json({ sinopse, tradutor });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ erro: "A tradução está indisponível no momento." });
  }
};

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
  if (!resp.ok) {
    // Se o DeepL falhar (cota esgotada, chave errada), tenta o Google
    return traduzirGoogle(texto);
  }
  const json = await resp.json();
  return json.translations?.[0]?.text || texto;
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
