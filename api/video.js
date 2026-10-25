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
    const resp = await fetch(provedor.oembed + encodeURIComponent(url), { headers: { "User-Agent": "AnimeSe/1.0" } });
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
