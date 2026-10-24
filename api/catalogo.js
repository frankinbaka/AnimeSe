// ============================================================
// Catálogo para o sorteio "O que assistir?" (função da Vercel)
// ------------------------------------------------------------
// Uso: /api/catalogo
//
// A API do MyAnimeList não tem busca por gênero. Por isso esta
// função junta os 1.500 animes mais populares do MAL, só com os
// campos que o sorteio precisa, e o site filtra pelos temas que
// o usuário marcar. O resultado fica 1 dia no cache da CDN.
// ============================================================

const MAL = "https://api.myanimelist.net/v2/anime/ranking";
const CAMPOS = "id,title,alternative_titles,main_picture,mean,genres,media_type,num_episodes,start_season,status";
const PAGINAS = [0, 500, 1000]; // 3 páginas de 500
const FORMATOS = new Set(["tv", "ona", "movie", "ova", "tv_special", "special"]);

module.exports = async function handler(req, res) {
  const clientId = process.env.MAL_CLIENT_ID;
  if (!clientId) return res.status(500).json({ erro: "A chave do MyAnimeList não está configurada." });

  try {
    const paginas = await Promise.all(
      PAGINAS.map(async (offset) => {
        const url = `${MAL}?ranking_type=bypopularity&limit=500&offset=${offset}&fields=${CAMPOS}`;
        const resp = await fetch(url, { headers: { "X-MAL-CLIENT-ID": clientId } });
        if (!resp.ok) return [];
        const json = await resp.json();
        return json.data || [];
      })
    );

    const vistos = new Set();
    const animes = paginas
      .flat()
      .map((d) => d.node)
      .filter((a) => a && FORMATOS.has(a.media_type) && a.status !== "not_yet_aired" && !vistos.has(a.id) && vistos.add(a.id))
      .map((a) => ({
        id: a.id,
        t: a.alternative_titles?.en || a.title, // título
        i: a.main_picture?.medium || a.main_picture?.large || "", // imagem
        n: a.mean ?? null, // nota
        g: (a.genres || []).map((g) => g.name), // gêneros e temas
        f: a.media_type, // formato
        e: a.num_episodes || null, // episódios
        a: a.start_season?.year || null, // ano
      }));

    if (!animes.length) throw new Error("vazio");

    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ animes });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ erro: "Não foi possível montar a lista de animes agora. Tente de novo em instantes." });
  }
};
