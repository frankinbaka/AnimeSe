// ============================================================
// Formato e capa de um vídeo do YouTube ou TikTok (função da Vercel)
// ------------------------------------------------------------
// Uso: /api/video?url=<link do vídeo>
// Consulta o oEmbed oficial de cada plataforma e devolve
// { largura, altura, capa } para a prévia mostrar o vídeo no
// formato em que foi publicado (deitado ou em pé).
// Resultado guardado 1 dia no cache da CDN.
// ============================================================

const PROVEDORES = [
  { teste: /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i, oembed: "https://www.youtube.com/oembed?format=json&url=" },
  { teste: /^https:\/\/(www\.|m\.|vm\.|vt\.)?tiktok\.com\//i, oembed: "https://www.tiktok.com/oembed?url=" },
];

module.exports = async function handler(req, res) {
  const url = String(req.query.url || "").slice(0, 500);
  const provedor = PROVEDORES.find((p) => p.teste.test(url));
  if (!provedor) return res.status(400).json({ erro: "Link de vídeo não suportado." });

  try {
    if (/tiktok\.com/i.test(url)) {
      const t = await formatoTikTok(url);
      if (t) {
        res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
        return res.status(200).json(t);
      }
    }
    const resp = await fetch(provedor.oembed + encodeURIComponent(url), { headers: { "User-Agent": "AnimeSe/1.0" }, signal: AbortSignal.timeout(3000) });
    if (!resp.ok) throw new Error(String(resp.status));
    const d = await resp.json();
    // TikTok informa o tamanho da capa (que segue o formato do vídeo); YouTube, o do player
    const largura = Number(d.thumbnail_width && /tiktok/i.test(url) ? d.thumbnail_width : d.width) || null;
    const altura = Number(d.thumbnail_height && /tiktok/i.test(url) ? d.thumbnail_height : d.height) || null;
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ largura, altura, capa: d.thumbnail_url || null });
  } catch {
    res.setHeader("Cache-Control", "public, s-maxage=600");
    return res.status(200).json({ largura: null, altura: null, capa: null });
  }
};

/**
 * O oEmbed do TikTok não informa o formato real (sempre 325x578).
 * Lê os dados que a própria página do vídeo traz (largura, altura e capa).
 */
async function formatoTikTok(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const id = (url.match(/video\/(\d+)/) || resp.url.match(/video\/(\d+)/) || [])[1];
    // Trecho do JSON da página a partir do vídeo pedido
    const inicio = id ? html.indexOf(`"id":"${id}"`) : -1;
    const trecho = html.slice(inicio >= 0 ? inicio : 0, (inicio >= 0 ? inicio : 0) + 20000);
    const m = trecho.match(/"video":\{[^{}]*?"height":(\d+),"width":(\d+)/) || trecho.match(/"width":(\d+),"height":(\d+)/);
    if (!m) return null;
    const [altura, largura] = /"height":\d+,"width"/.test(m[0]) ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
    const capa = (trecho.match(/"cover":"([^"]+)"/) || [])[1];
    return { largura, altura, capa: capa ? JSON.parse(`"${capa}"`) : null };
  } catch {
    return null;
  }
}
