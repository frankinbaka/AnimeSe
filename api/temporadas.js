// ============================================================
// Todas as temporadas de um anime (função da Vercel)
// ------------------------------------------------------------
// Uso: /api/temporadas?id=<id do anime no MyAnimeList>
//
// O MyAnimeList só informa, para cada anime, os títulos ligados
// diretamente a ele (temporada anterior, seguinte, filmes e OVAs
// paralelos…). Esta função segue essas ligações a partir do anime
// aberto e devolve a franquia inteira em ordem de estreia.
// Resultado guardado 1 dia no cache da CDN.
// ============================================================

const MAL = "https://api.myanimelist.net/v2/anime/";
const CAMPOS = "id,title,alternative_titles,main_picture,start_date,media_type,num_episodes,status,mean,related_anime";
// Ligações seguidas em cadeia: temporadas, histórias paralelas
// (filmes e OVAs), a obra principal, resumos e versões completas
const LIGACOES = new Set(["prequel", "sequel", "side_story", "parent_story", "full_story", "summary"]);
// Incluídas na lista, mas sem seguir adiante (evita puxar outras franquias)
const LIGACOES_FOLHA = new Set(["alternative_version"]);
// Formatos que não entram na lista (clipes musicais, comerciais, trailers)
const FORMATOS_FORA = new Set(["music", "cm", "pv"]);
const LIMITE_ANIMES = 40; // proteção contra franquias gigantes

module.exports = async function handler(req, res) {
  const id = String(req.query.id || "");
  if (!/^\d{1,7}$/.test(id)) return res.status(400).json({ erro: "Anime inválido." });

  const clientId = process.env.MAL_CLIENT_ID;
  if (!clientId) return res.status(500).json({ erro: "A chave do MyAnimeList não está configurada." });

  const buscar = async (animeId) => {
    const resp = await fetch(`${MAL}${animeId}?fields=${CAMPOS}`, { headers: { "X-MAL-CLIENT-ID": clientId } });
    if (!resp.ok) return null;
    return resp.json();
  };

  try {
    const encontrados = new Map();
    let fila = [Number(id)];
    const vistos = new Set(fila);
    const folhas = new Set();

    // Busca em camadas: o anime aberto, depois os vizinhos, depois os vizinhos deles…
    while (fila.length && encontrados.size < LIMITE_ANIMES) {
      const camada = fila.slice(0, LIMITE_ANIMES - encontrados.size);
      fila = [];
      const resultados = await Promise.all(camada.map(buscar));
      for (const a of resultados) {
        if (!a) continue;
        encontrados.set(a.id, a);
        if (folhas.has(a.id)) continue; // não segue as ligações de uma versão alternativa
        for (const rel of a.related_anime || []) {
          const tipo = rel.relation_type;
          if ((LIGACOES.has(tipo) || LIGACOES_FOLHA.has(tipo)) && !vistos.has(rel.node.id)) {
            vistos.add(rel.node.id);
            if (LIGACOES_FOLHA.has(tipo)) folhas.add(rel.node.id);
            fila.push(rel.node.id);
          }
        }
      }
    }

    const temporadas = [...encontrados.values()]
      .filter((a) => a.id === Number(id) || !FORMATOS_FORA.has(a.media_type))
      .map((a) => ({
        id: a.id,
        titulo: a.alternative_titles?.en || a.title,
        tituloOriginal: a.title,
        imagem: a.main_picture?.medium || a.main_picture?.large || "",
        estreia: a.start_date || null,
        tipo: a.media_type,
        episodios: a.num_episodes || null,
        situacao: a.status,
        nota: a.mean ?? null,
      }))
      // Sem data de estreia (ainda não anunciada) vai para o fim
      .sort((x, y) => (x.estreia || "9999").localeCompare(y.estreia || "9999") || x.id - y.id);

    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ temporadas });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ erro: "Não foi possível buscar as temporadas agora." });
  }
};
