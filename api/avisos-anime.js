// ============================================================
// Avisos de anime (função da Vercel, roda 1 vez por dia)
// ------------------------------------------------------------
// Procura animes que estrearam nos últimos dias e cria notificações:
//   • "estreou": para quem tem o anime na lista
//   • "nova temporada": para quem assistiu a temporada anterior e
//     ainda não colocou a nova na lista
// Agendada em vercel.json (crons). O admin também pode rodar pelo painel.
// Precisa de MAL_CLIENT_ID e SUPABASE_SERVICE_ROLE_KEY na Vercel.
// ============================================================

const MAL = "https://api.myanimelist.net/v2/anime";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://nfcobuqwpphswostlyks.supabase.co";
const ESTACOES = ["winter", "spring", "summer", "fall"];
const DIAS = 3; // estreias dos últimos 3 dias (a função roda todo dia; repetidos são ignorados)
const FORMATOS = new Set(["tv", "ona", "ova", "movie", "special", "tv_special"]);

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const clientId = process.env.MAL_CLIENT_ID;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clientId || !chave) return res.status(500).json({ erro: "Faltam MAL_CLIENT_ID ou SUPABASE_SERVICE_ROLE_KEY na Vercel." });
  if (!(await autorizado(req, chave))) return res.status(401).json({ erro: "Sem permissão." });

  const mal = (caminho) => fetch(`${MAL}${caminho}`, { headers: { "X-MAL-CLIENT-ID": clientId } }).then((r) => (r.ok ? r.json() : null));
  const supa = (caminho, opcoes = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json", ...(opcoes.headers || {}) },
  });

  try {
    // 1. Animes da temporada atual e da anterior
    const hoje = new Date();
    const ano = hoje.getUTCFullYear();
    const indice = Math.floor(hoje.getUTCMonth() / 3);
    const temporadas = [[ano, ESTACOES[indice]], indice === 0 ? [ano - 1, "fall"] : [ano, ESTACOES[indice - 1]]];
    const campos = "start_date,status,media_type,alternative_titles,main_picture";
    const listas = await Promise.all(temporadas.map(([a, e]) => mal(`/season/${a}/${e}?limit=500&nsfw=false&fields=${campos}`)));

    // 2. Os que estrearam nos últimos dias
    const limite = new Date(hoje.getTime() - DIAS * 86400000).toISOString().slice(0, 10);
    const hojeTxt = hoje.toISOString().slice(0, 10);
    const vistos = new Set();
    const estreias = listas.flatMap((l) => l?.data || []).map((x) => x.node).filter((a) => {
      if (vistos.has(a.id)) return false;
      vistos.add(a.id);
      return /^\d{4}-\d{2}-\d{2}$/.test(a.start_date || "") && a.start_date >= limite && a.start_date <= hojeTxt
        && a.status !== "not_yet_aired" && FORMATOS.has(a.media_type);
    });
    if (!estreias.length) return res.status(200).json({ estreias: 0, notificacoes: 0 });

    // 3. Ignora os já avisados (estreia e nova temporada)
    const r = await supa(`anime_avisos?select=mal_id,tipo&mal_id=in.(${estreias.map((a) => a.id).join(",")})`);
    const feitos = r.ok ? await r.json() : [];
    const completos = new Set(estreias.filter((a) => feitos.filter((f) => f.mal_id === a.id).length >= 2).map((a) => a.id));
    const pendentes = estreias.filter((a) => !completos.has(a.id)).slice(0, 25);

    // 4. Para cada estreia: temporada anterior (prequel) e notificações
    let notificacoes = 0;
    const detalhes = await Promise.all(pendentes.map((a) => mal(`/${a.id}?fields=related_anime`)));
    for (let i = 0; i < pendentes.length; i++) {
      const a = pendentes[i];
      const anteriores = (detalhes[i]?.related_anime || []).filter((rel) => rel.relation_type === "prequel");
      const anime = {
        id: a.id,
        titulo: a.alternative_titles?.en || a.title,
        imagem: a.main_picture?.medium || a.main_picture?.large || null,
        tipo: a.media_type,
      };
      const resp = await supa("rpc/avisar_anime", {
        method: "POST",
        body: JSON.stringify({
          p_anime: anime,
          p_prequels: anteriores.map((rel) => rel.node.id),
          p_prequel_titulo: anteriores[0]?.node?.title || null,
        }),
      });
      if (resp.ok) notificacoes += Number(await resp.json()) || 0;
    }
    return res.status(200).json({ estreias: estreias.length, verificadas: pendentes.length, notificacoes });
  } catch (e) {
    return res.status(502).json({ erro: "Falha ao verificar estreias.", detalhe: String(e).slice(0, 200) });
  }
};

/** Libera o agendador da Vercel (CRON_SECRET) ou um admin logado. */
async function autorizado(req, chaveServico) {
  const auth = req.headers.authorization || "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (!process.env.CRON_SECRET && /vercel-cron/i.test(req.headers["user-agent"] || "")) return true;
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  try {
    const anon = req.headers.apikey || chaveServico;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    return r.ok && (await r.json()) === true;
  } catch {
    return false;
  }
}
