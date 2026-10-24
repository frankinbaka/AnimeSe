// ============================================================
// Dados de animes da API oficial do MyAnimeList
// (através da função /api/mal da Vercel, que guarda a chave)
//
// Tudo que o MAL devolve em inglês e é fixo (tipo, situação,
// gêneros) é traduzido aqui. As sinopses ainda vêm em inglês:
// a tradução automática entra numa próxima etapa.
// ============================================================

const PONTE = "/api/mal";
const CACHE_MINUTOS = 30;
const PREFIXO_CACHE = "mal:";

const CAMPOS = [
  "id", "title", "main_picture", "alternative_titles", "start_date", "end_date",
  "synopsis", "mean", "rank", "popularity", "num_list_users", "media_type",
  "status", "genres", "num_episodes", "start_season", "average_episode_duration", "studios",
].join(",");

function lerCache(chave) {
  try {
    const bruto = sessionStorage.getItem(PREFIXO_CACHE + chave);
    if (!bruto) return null;
    const { quando, dados } = JSON.parse(bruto);
    return Date.now() - quando > CACHE_MINUTOS * 60_000 ? null : dados;
  } catch {
    return null;
  }
}

function gravarCache(chave, dados) {
  try { sessionStorage.setItem(PREFIXO_CACHE + chave, JSON.stringify({ quando: Date.now(), dados })); } catch {}
}

async function requisitar(caminho, parametros = {}) {
  const busca = new URLSearchParams({ path: caminho, ...parametros });
  const chave = busca.toString();
  const emCache = lerCache(chave);
  if (emCache) return emCache;

  let resp;
  try {
    resp = await fetch(`${PONTE}?${chave}`);
  } catch {
    throw new Error("Sem conexão com o servidor. Confira sua internet e tente de novo.");
  }

  let json = null;
  try { json = await resp.json(); } catch {}

  if (!resp.ok) {
    if (json?.erro) throw new Error(json.erro);
    if (resp.status === 404) {
      throw new Error(location.hostname === "localhost" || location.hostname === "127.0.0.1"
        ? "A ponte com o MyAnimeList só roda na Vercel. Para testar no seu PC, use: npx vercel dev"
        : "Anime não encontrado.");
    }
    if (resp.status === 429) throw new Error("Muitas buscas seguidas. Aguarde alguns segundos e tente de novo.");
    throw new Error(`O MyAnimeList não respondeu (erro ${resp.status}). Tente de novo em instantes.`);
  }

  gravarCache(chave, json);
  return json;
}

// ------------------------------------------------------------
// Traduções
// ------------------------------------------------------------

const TIPOS = {
  tv: "Série", movie: "Filme", ova: "OVA", ona: "ONA", special: "Especial",
  tv_special: "Especial de TV", music: "Clipe musical", cm: "Comercial", pv: "Prévia",
  unknown: "",
};

const SITUACOES = {
  currently_airing: "Em exibição",
  finished_airing: "Finalizado",
  not_yet_aired: "Ainda não estreou",
};

const GENEROS = {
  "Action": "Ação", "Adventure": "Aventura", "Avant Garde": "Vanguarda", "Award Winning": "Premiado",
  "Boys Love": "Boys Love", "Comedy": "Comédia", "Drama": "Drama", "Fantasy": "Fantasia",
  "Girls Love": "Girls Love", "Gourmet": "Culinária", "Horror": "Terror", "Mystery": "Mistério",
  "Romance": "Romance", "Sci-Fi": "Ficção científica", "Slice of Life": "Cotidiano", "Sports": "Esportes",
  "Supernatural": "Sobrenatural", "Suspense": "Suspense", "Ecchi": "Ecchi", "Erotica": "Erótico", "Hentai": "Hentai",
  "Adult Cast": "Elenco adulto", "Anthropomorphic": "Antropomórfico", "CGDCT": "Garotas fofas fazendo coisas fofas",
  "Childcare": "Cuidado infantil", "Combat Sports": "Esportes de combate", "Crossdressing": "Crossdressing",
  "Delinquents": "Delinquentes", "Detective": "Detetive", "Educational": "Educativo", "Gag Humor": "Humor nonsense",
  "Gore": "Gore", "Harem": "Harém", "High Stakes Game": "Jogos de alto risco", "Historical": "Histórico",
  "Idols (Female)": "Idols (femininas)", "Idols (Male)": "Idols (masculinos)", "Isekai": "Isekai",
  "Iyashikei": "Iyashikei", "Love Polygon": "Triângulo amoroso", "Love Status Quo": "Romance sem avanço",
  "Magical Sex Shift": "Troca de sexo mágica", "Mahou Shoujo": "Garota mágica", "Martial Arts": "Artes marciais",
  "Mecha": "Mecha", "Medical": "Medicina", "Military": "Militar", "Music": "Música", "Mythology": "Mitologia",
  "Organized Crime": "Crime organizado", "Otaku Culture": "Cultura otaku", "Parody": "Paródia",
  "Performing Arts": "Artes cênicas", "Pets": "Animais de estimação", "Psychological": "Psicológico",
  "Racing": "Corrida", "Reincarnation": "Reencarnação", "Reverse Harem": "Harém reverso",
  "Romantic Subtext": "Subtexto romântico", "Samurai": "Samurai", "School": "Escolar", "Showbiz": "Showbiz",
  "Space": "Espaço", "Strategy Game": "Jogos de estratégia", "Super Power": "Superpoderes", "Survival": "Sobrevivência",
  "Team Sports": "Esportes em equipe", "Time Travel": "Viagem no tempo", "Urban Fantasy": "Fantasia urbana",
  "Vampire": "Vampiros", "Video Game": "Videogame", "Villainess": "Vilã", "Visual Arts": "Artes visuais",
  "Workplace": "Ambiente de trabalho", "Josei": "Josei", "Kids": "Infantil", "Seinen": "Seinen",
  "Shoujo": "Shoujo", "Shounen": "Shounen",
};

const MESES = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

function formatarData(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!mes) return String(ano);
  return dia ? `${dia} de ${MESES[mes - 1]} de ${ano}` : `${MESES[mes - 1]} de ${ano}`;
}

/** Converte o formato do MAL para o formato usado no site. */
export function normalizar(a) {
  const ingles = a.alternative_titles?.en;
  const inicio = formatarData(a.start_date);
  const fim = formatarData(a.end_date);
  const minutos = a.average_episode_duration ? Math.round(a.average_episode_duration / 60) : null;

  return {
    id: a.id,
    titulo: traduzirTitulo(ingles || a.title),
    tituloOriginal: a.title,
    tituloJapones: a.alternative_titles?.ja || null,
    imagem: a.main_picture?.large || a.main_picture?.medium || "",
    nota: a.mean ?? null,
    ranking: a.rank ?? null,
    membros: a.num_list_users ?? null,
    episodios: a.num_episodes || null,
    tipo: TIPOS[a.media_type] ?? a.media_type ?? "",
    status: SITUACOES[a.status] || "—",
    sinopse: limparSinopse(a.synopsis),
    temporada: a.start_season?.season || null,
    ano: a.start_season?.year || (a.start_date ? Number(a.start_date.slice(0, 4)) : null),
    exibicao: inicio ? (fim && fim !== inicio ? `${inicio} até ${fim}` : `desde ${inicio}`) : null,
    duracao: minutos ? `${minutos} min por episódio` : null,
    estudios: (a.studios || []).map((s) => s.name),
    generos: (a.genres || []).map((g) => GENEROS[g.name] || g.name),
    trailer: null, // a API oficial não informa trailers
    urlMal: `https://myanimelist.net/anime/${a.id}`,
  };
}

// Remove a linha "[Written by MAL Rewrite]" do fim das sinopses
// Traduz os termos em inglês comuns nos títulos:
// "Black Clover Season 2" → "Black Clover Temporada 2"
const REGRAS_TITULO = [
  [/\bThe Final Season\b/gi, "Temporada Final"],
  [/\bFinal Season\b/gi, "Temporada Final"],
  [/\b(\d+)(?:st|nd|rd|th) Season\b/gi, "Temporada $1"],
  [/\bSeason (\d+)\b/gi, "Temporada $1"],
  [/\bSeason ([IVX]+)\b/g, "Temporada $1"],
  [/\b(\d+)(?:st|nd|rd|th) Cour\b/gi, "Parte $1"],
  [/\bCour (\d+)\b/gi, "Parte $1"],
  [/\bPart (\d+|[IVX]+)\b/gi, "Parte $1"],
  [/\bThe Movie\b/gi, "O Filme"],
  [/\bMovie\b/g, "Filme"],
  [/\bSpecials\b/g, "Especiais"],
  [/\bSpecial\b/g, "Especial"],
  [/\bRecap\b/g, "Recapitulação"],
  [/\bPrologue\b/g, "Prólogo"],
];

export function traduzirTitulo(titulo = "") {
  return REGRAS_TITULO.reduce((t, [regra, troca]) => t.replace(regra, troca), titulo);
}

function limparSinopse(texto) {
  return (texto || "").replace(/\n*\[Written by [^\]]*\]\s*$/i, "").trim();
}

// ------------------------------------------------------------
// Consultas
// ------------------------------------------------------------

/** Temporada atual com base na data de hoje (padrão do MAL). */
export function temporadaDeHoje(data = new Date()) {
  const estacoes = ["winter", "spring", "summer", "fall"];
  return { ano: data.getFullYear(), estacao: estacoes[Math.floor(data.getMonth() / 3)] };
}

/** Animes da temporada atual, dos mais populares para os menos. */
export async function temporadaAtual(pagina = 1, limite = 24) {
  const { ano, estacao } = temporadaDeHoje();
  const json = await requisitar(`/v2/anime/season/${ano}/${estacao}`, {
    sort: "anime_num_list_users", limit: limite, offset: (pagina - 1) * limite, fields: CAMPOS,
  });
  // A lista da temporada inclui animes que continuam de temporadas
  // anteriores. Mostramos primeiro os que estrearam nesta.
  const itens = (json.data || []).map((d) => ({ anime: normalizar(d.node), estacao: d.node.start_season }));
  const estreias = itens.filter((i) => i.estacao?.year === ano && i.estacao?.season === estacao).map((i) => i.anime);
  const continuacoes = itens.filter((i) => !(i.estacao?.year === ano && i.estacao?.season === estacao)).map((i) => i.anime);
  return { itens: removerDuplicados([...estreias, ...continuacoes]), temMais: Boolean(json.paging?.next) };
}

/** Animes mais bem avaliados de todos os tempos. */
export async function topAnimes(limite = 15) {
  const json = await requisitar("/v2/anime/ranking", { ranking_type: "all", limit: limite, fields: CAMPOS });
  return removerDuplicados((json.data || []).map((d) => normalizar(d.node)));
}

/** Próximos lançamentos mais aguardados. */
export async function proximaTemporada(limite = 15) {
  const json = await requisitar("/v2/anime/ranking", { ranking_type: "upcoming", limit: limite, fields: CAMPOS });
  return removerDuplicados((json.data || []).map((d) => normalizar(d.node)));
}

/** Busca por nome (mínimo de 3 letras, regra do MAL). */
export async function buscar(termo, pagina = 1, limite = 24) {
  const json = await requisitar("/v2/anime", {
    q: termo.trim().slice(0, 64), limit: limite, offset: (pagina - 1) * limite, fields: CAMPOS,
  });
  return { itens: removerDuplicados((json.data || []).map((d) => normalizar(d.node))), temMais: Boolean(json.paging?.next) };
}

/** Dados completos de um anime. */
export async function detalhes(id) {
  const json = await requisitar(`/v2/anime/${Number(id)}`, { fields: CAMPOS });
  return normalizar(json);
}

function removerDuplicados(lista = []) {
  const vistos = new Set();
  return lista.filter((a) => (vistos.has(a.id) ? false : vistos.add(a.id)));
}

// O MAL usa as estações do Japão; no Brasil elas são invertidas,
// então mostramos o mês de estreia para não confundir.
const MES_TEMPORADA = { winter: "janeiro", spring: "abril", summer: "julho", fall: "outubro" };

export function nomeTemporada(season, ano) {
  if (!season) return ano ? String(ano) : "";
  return `${MES_TEMPORADA[season]} de ${ano}`;
}

/** Mantido por compatibilidade: a situação já vem traduzida em normalizar(). */
export const traduzirStatus = (status) => status || "—";

// ------------------------------------------------------------
// Sinopse em português (função /api/traduzir, com cache)
// ------------------------------------------------------------
export async function sinopseEmPortugues(id) {
  const chave = "pt:" + id;
  const emCache = lerCache(chave);
  if (emCache) return emCache;

  const resp = await fetch(`/api/traduzir?id=${Number(id)}`);
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.erro || "A tradução está indisponível no momento.");
  gravarCache(chave, json.sinopse);
  return json.sinopse;
}

// ------------------------------------------------------------
// Temporadas da mesma franquia (função /api/temporadas)
// ------------------------------------------------------------
export async function temporadasDoAnime(id) {
  const chave = "temporadas:" + id;
  const emCache = lerCache(chave);
  if (emCache) return emCache;

  const resp = await fetch(`/api/temporadas?id=${Number(id)}`);
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.erro || "Não foi possível buscar as temporadas.");

  const lista = (json.temporadas || []).map((t) => ({
    ...t,
    titulo: traduzirTitulo(t.titulo),
    tipo: TIPOS[t.tipo] ?? t.tipo ?? "",
    ano: t.estreia ? Number(t.estreia.slice(0, 4)) : null,
    emBreve: t.situacao === "not_yet_aired",
  }));
  gravarCache(chave, lista);
  return lista;
}

// ------------------------------------------------------------
// Catálogo para o sorteio "O que assistir?" (função /api/catalogo)
// ------------------------------------------------------------
export const traduzirGenero = (nome) => GENEROS[nome] || nome;

// Gêneros principais e público-alvo (o resto do MAL são "temas")
const GENEROS_PRINCIPAIS = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery", "Romance",
  "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Suspense", "Award Winning", "Avant Garde",
  "Boys Love", "Girls Love", "Gourmet", "Ecchi"];
const PUBLICOS = ["Shounen", "Shoujo", "Seinen", "Josei", "Kids"];

/** Grupo de um gênero já traduzido: "genero", "publico" ou "tema". */
export function grupoDoGenero(nomeTraduzido) {
  if (GENEROS_PRINCIPAIS.some((g) => traduzirGenero(g) === nomeTraduzido)) return "genero";
  if (PUBLICOS.some((g) => traduzirGenero(g) === nomeTraduzido)) return "publico";
  return "tema";
}

let catalogoEmMemoria = null;
export async function catalogoParaSorteio() {
  if (catalogoEmMemoria) return catalogoEmMemoria;
  const emCache = lerCache("catalogo");
  if (emCache) return (catalogoEmMemoria = emCache);

  const resp = await fetch("/api/catalogo");
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.erro || "Não foi possível carregar os animes para o sorteio.");

  catalogoEmMemoria = (json.animes || []).map((a) => ({
    id: a.id,
    titulo: traduzirTitulo(a.t),
    imagem: a.i,
    nota: a.n,
    generos: a.g.map(traduzirGenero),
    tipo: TIPOS[a.f] ?? a.f,
    formato: a.f,
    episodios: a.e,
    ano: a.a,
  }));
  gravarCache("catalogo", catalogoEmMemoria);
  return catalogoEmMemoria;
}
