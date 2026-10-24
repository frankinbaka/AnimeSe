// ============================================================
// Ponte para a API oficial do MyAnimeList (função da Vercel)
// ------------------------------------------------------------
// A API do MAL exige uma chave (Client ID) e não aceita chamadas
// direto do navegador. Esta função recebe o pedido do site, chama
// o MAL com a chave guardada na Vercel e devolve o resultado.
//
// Configure na Vercel: Settings > Environment Variables
//   MAL_CLIENT_ID = <seu Client ID de myanimelist.net/apiconfig>
//
// Exemplo de uso pelo site:
//   /api/mal?path=/v2/anime/season/2026/fall&limit=24&fields=...
// ============================================================

const BASE = "https://api.myanimelist.net";

// Só estes caminhos podem ser consultados (evita usar a função para outra coisa)
const CAMINHOS_PERMITIDOS = [
  /^\/v2\/anime$/,                                          // busca
  /^\/v2\/anime\/\d{1,7}$/,                                  // detalhes
  /^\/v2\/anime\/season\/\d{4}\/(winter|spring|summer|fall)$/, // temporada
  /^\/v2\/anime\/ranking$/,                                  // rankings
];

// Só estes parâmetros são repassados ao MAL
const PARAMETROS_PERMITIDOS = ["q", "limit", "offset", "fields", "sort", "ranking_type", "nsfw"];

module.exports = async function handler(req, res) {
  const clientId = process.env.MAL_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({
      erro: "A chave do MyAnimeList ainda não foi configurada. Adicione MAL_CLIENT_ID nas variáveis de ambiente da Vercel e faça um novo deploy.",
    });
  }

  const caminho = String(req.query.path || "");
  if (!CAMINHOS_PERMITIDOS.some((r) => r.test(caminho))) {
    return res.status(400).json({ erro: "Consulta não permitida." });
  }

  const url = new URL(BASE + caminho);
  for (const p of PARAMETROS_PERMITIDOS) {
    if (req.query[p] != null) url.searchParams.set(p, String(req.query[p]).slice(0, 600));
  }

  try {
    const resp = await fetch(url, { headers: { "X-MAL-CLIENT-ID": clientId } });
    const corpo = await resp.text();

    if (resp.ok) {
      // Cache na CDN da Vercel: 1 hora fresco, até 1 dia servindo a versão anterior
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(resp.status).send(corpo);
  } catch (e) {
    return res.status(502).json({ erro: "Não foi possível falar com o MyAnimeList agora. Tente de novo em instantes." });
  }
};
