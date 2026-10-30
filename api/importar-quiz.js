// ============================================================
// Importa perguntas de anime do Open Trivia DB (função da Vercel)
// ------------------------------------------------------------
// Só o admin. Cada chamada importa um lote de até 50 perguntas da
// categoria "Japanese Anime & Manga", traduz com o DeepL e salva no
// quiz como DESATIVADAS (para revisão). Perguntas repetidas são ignoradas.
//   GET /api/importar-quiz            → primeiro lote (devolve um token)
//   GET /api/importar-quiz?token=...  → próximos lotes
// O Open Trivia DB pede 5 segundos entre chamadas.
// Fonte: https://opentdb.com (licença CC BY-SA 4.0)
// ============================================================

const crypto = require("crypto");
const SUPABASE_URL = process.env.SUPABASE_URL || "https://nfcobuqwpphswostlyks.supabase.co";
const CATEGORIA = 31; // Entertainment: Japanese Anime & Manga
const DIFICULDADE = { easy: "facil", medium: "media", hard: "dificil" };

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave || !process.env.DEEPL_API_KEY) return res.status(500).json({ erro: "Faltam SUPABASE_SERVICE_ROLE_KEY ou DEEPL_API_KEY na Vercel." });
  if (!(await souAdmin(req, chave))) return res.status(401).json({ erro: "Só o admin pode importar perguntas." });

  try {
    let token = String(req.query.token || "");
    if (!token) {
      const t = await fetch("https://opentdb.com/api_token.php?command=request").then((r) => r.json());
      token = t.token;
    }
    const lote = await fetch(`https://opentdb.com/api.php?amount=50&category=${CATEGORIA}&encode=url3986&token=${encodeURIComponent(token)}`).then((r) => r.json());
    if (lote.response_code === 5) return res.status(429).json({ erro: "Muitas chamadas seguidas. Espere 5 segundos.", token });
    if (lote.response_code === 4 || (lote.response_code === 1 && !lote.results?.length)) return res.status(200).json({ token, recebidas: 0, importadas: 0, fim: true });
    if (lote.response_code !== 0) return res.status(502).json({ erro: `Open Trivia DB respondeu código ${lote.response_code}.`, token });

    const dec = (s) => decodeURIComponent(s);
    const itens = lote.results.map((r) => ({
      tipo: r.type,
      dificuldade: DIFICULDADE[r.difficulty] || "media",
      pergunta: dec(r.question),
      certa: dec(r.correct_answer),
      erradas: r.incorrect_answers.map(dec),
    }));

    // Junta todos os textos que precisam de tradução (V/F não precisa traduzir as alternativas)
    const textos = [];
    for (const it of itens) {
      textos.push(it.pergunta);
      if (it.tipo === "multiple") textos.push(it.certa, ...it.erradas);
    }
    const traduzidos = await traduzir(textos);
    let i = 0;
    const linhas = itens.map((it) => {
      const pergunta = traduzidos[i++];
      let alternativas, correta;
      if (it.tipo === "boolean") {
        alternativas = ["Verdadeiro", "Falso"];
        correta = it.certa === "True" ? 0 : 1;
      } else {
        const certa = traduzidos[i++];
        const erradas = it.erradas.map(() => traduzidos[i++]);
        alternativas = embaralhar([certa, ...erradas]);
        correta = alternativas.indexOf(certa);
      }
      return {
        enunciado: pergunta.slice(0, 600),
        alternativas: alternativas.map((a) => String(a).slice(0, 150)),
        correta,
        dificuldade: it.dificuldade,
        ativa: false,
        origem: "opentdb",
        origem_ref: "opentdb:" + crypto.createHash("sha1").update(it.pergunta + "|" + it.certa).digest("hex"),
        original: { pergunta: it.pergunta, certa: it.certa, erradas: it.erradas },
        criada_por: null,
      };
    }).filter((l) => l.correta >= 0 && new Set(l.alternativas.map((a) => a.toLowerCase())).size === l.alternativas.length);

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/quiz_questions?on_conflict=origem_ref`, {
      method: "POST",
      headers: {
        apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify(linhas),
    });
    if (!resp.ok) return res.status(502).json({ erro: "Falha ao salvar: " + (await resp.text()).slice(0, 300), token });
    const salvas = await resp.json();
    return res.status(200).json({ token, recebidas: itens.length, importadas: salvas.length, fim: itens.length < 50 });
  } catch (e) {
    return res.status(502).json({ erro: "Falha na importação.", detalhe: String(e).slice(0, 200) });
  }
};

/** DeepL aceita até 50 textos por pedido. */
async function traduzir(textos) {
  const chave = process.env.DEEPL_API_KEY;
  const base = chave.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const saida = [];
  for (let i = 0; i < textos.length; i += 50) {
    const parte = textos.slice(i, i + 50);
    const r = await fetch(`${base}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: parte, source_lang: "EN", target_lang: "PT-BR" }),
    });
    if (!r.ok) throw new Error("DeepL " + r.status);
    const j = await r.json();
    saida.push(...j.translations.map((t) => t.text));
  }
  return saida;
}

function embaralhar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function souAdmin(req, chaveServico) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: { apikey: req.headers.apikey || chaveServico, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    return r.ok && (await r.json()) === true;
  } catch {
    return false;
  }
}
