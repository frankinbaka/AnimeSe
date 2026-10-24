// ============================================================
// Cliente da API Jikan (dados do MyAnimeList)
// Docs: https://docs.api.jikan.moe
//
// Limites da API: 3 requisições/segundo e 60/minuto.
// Por isso as chamadas passam por uma fila com intervalo
// mínimo e as respostas ficam em cache no navegador.
// ============================================================

const BASE = "https://api.jikan.moe/v4";
const INTERVALO_MS = 400;          // ~2,5 req/s, abaixo do limite
const CACHE_MINUTOS = 30;
const PREFIXO_CACHE = "jikan:";

let fila = Promise.resolve();
let ultimaChamada = 0;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function lerCache(chave) {
  try {
    const bruto = sessionStorage.getItem(PREFIXO_CACHE + chave);
    if (!bruto) return null;
    const { quando, dados } = JSON.parse(bruto);
    if (Date.now() - quando > CACHE_MINUTOS * 60_000) return null;
    return dados;
  } catch {
    return null;
  }
}

function gravarCache(chave, dados) {
  try {
    sessionStorage.setItem(PREFIXO_CACHE + chave, JSON.stringify({ quando: Date.now(), dados }));
  } catch {
    // cache cheio ou indisponível: segue sem cache
  }
}

async function requisitar(caminho, tentativas = 3) {
  const emCache = lerCache(caminho);
  if (emCache) return emCache;

  // Entra na fila para respeitar o limite de requisições
  const execucao = fila.then(async () => {
    const espera = INTERVALO_MS - (Date.now() - ultimaChamada);
    if (espera > 0) await esperar(espera);
    ultimaChamada = Date.now();

    for (let i = 0; i < tentativas; i++) {
      const resp = await fetch(BASE + caminho);
      if (resp.status === 429) {           // limite atingido: espera e tenta de novo
        await esperar(1200 * (i + 1));
        continue;
      }
      if (resp.status === 404) throw new Error("Anime não encontrado.");
      if (!resp.ok) throw new Error(`O MyAnimeList não respondeu (erro ${resp.status}). Tente de novo em instantes.`);
      return resp.json();
    }
    throw new Error("Muitas buscas seguidas. Aguarde alguns segundos e tente de novo.");
  });

  fila = execucao.catch(() => {});
  const json = await execucao;
  gravarCache(caminho, json);
  return json;
}

/** Converte o formato do Jikan para o formato usado no site. */
export function normalizar(a) {
  return {
    id: a.mal_id,
    titulo: a.title_english || a.title,
    tituloOriginal: a.title,
    tituloJapones: a.title_japanese,
    imagem: a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || a.images?.jpg?.image_url,
    nota: a.score,
    ranking: a.rank,
    membros: a.members,
    episodios: a.episodes,
    tipo: a.type,
    status: a.status,
    sinopse: a.synopsis,
    temporada: a.season,
    ano: a.year,
    exibicao: a.aired?.string,
    duracao: a.duration,
    estudios: (a.studios || []).map((s) => s.name),
    generos: [...(a.genres || []), ...(a.themes || [])].map((g) => g.name),
    trailer: a.trailer?.embed_url || (a.trailer?.youtube_id ? `https://www.youtube-nocookie.com/embed/${a.trailer.youtube_id}` : null),
    urlMal: a.url,
  };
}

/** Animes da temporada atual, ordenados por popularidade. */
export async function temporadaAtual(pagina = 1) {
  const json = await requisitar(`/seasons/now?sfw=true&page=${pagina}&limit=24`);
  return { itens: removerDuplicados(json.data).map(normalizar), temMais: json.pagination?.has_next_page };
}

/** Animes mais bem avaliados de todos os tempos. */
export async function topAnimes(limite = 15) {
  const json = await requisitar(`/top/anime?sfw=true&limit=${limite}`);
  return removerDuplicados(json.data).map(normalizar);
}

/** Próximos lançamentos. */
export async function proximaTemporada(limite = 15) {
  const json = await requisitar(`/seasons/upcoming?sfw=true&limit=${limite}`);
  return removerDuplicados(json.data).map(normalizar);
}

/** Busca por nome. */
export async function buscar(termo, pagina = 1, limite = 24) {
  const q = encodeURIComponent(termo.trim());
  const json = await requisitar(`/anime?q=${q}&sfw=true&order_by=members&sort=desc&page=${pagina}&limit=${limite}`);
  return { itens: removerDuplicados(json.data).map(normalizar), temMais: json.pagination?.has_next_page };
}

/** Dados completos de um anime. */
export async function detalhes(id) {
  const json = await requisitar(`/anime/${Number(id)}/full`);
  return normalizar(json.data);
}

// A API às vezes repete o mesmo anime entre páginas
function removerDuplicados(lista = []) {
  const vistos = new Set();
  return lista.filter((a) => (vistos.has(a.mal_id) ? false : vistos.add(a.mal_id)));
}

const NOMES_TEMPORADA = { winter: "inverno", spring: "primavera", summer: "verão", fall: "outono" };
// Nomes no padrão japonês/MAL; no Brasil as estações são invertidas,
// então mostramos o mês de estreia junto para não confundir.
const MES_TEMPORADA = { winter: "janeiro", spring: "abril", summer: "julho", fall: "outubro" };

export function nomeTemporada(season, ano) {
  if (!season) return ano ? String(ano) : "";
  return `${MES_TEMPORADA[season]} de ${ano}`;
}

export function traduzirStatus(status) {
  return {
    "Currently Airing": "Em exibição",
    "Finished Airing": "Finalizado",
    "Not yet aired": "Ainda não estreou",
  }[status] || status || "—";
}

export { NOMES_TEMPORADA };
