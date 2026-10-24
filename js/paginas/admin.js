// Painel admin: estatísticas do site e publicações (notícias, resenhas, vídeos).
import { montarLayout, esc, toast, caixaErro, entrar, formatarNumero, avatarHtml, nomeComTag } from "../ui.js";
import { usuarioAtual, clienteSupabase } from "../store.js";
import {
  souAdmin, listarPosts, lerPost, salvarPost, excluirPost, enviarCapa,
  TIPOS_POST, idYoutube, capaDoPost, formatarData, textoParaHtml,
} from "../conteudo.js";
import { buscar } from "../mal.js";

await montarLayout();

const alvo = document.getElementById("conteudo-admin");
const abasEl = document.getElementById("abas-admin");
const usuario = await usuarioAtual();

if (!usuario) {
  alvo.innerHTML = `<div class="vazio"><h2>Entre para acessar o painel</h2>
    <button class="btn btn-primario" id="btn-entrar-admin">Entrar com Google</button></div>`;
  alvo.querySelector("#btn-entrar-admin").addEventListener("click", entrar);
} else if (!(await souAdmin())) {
  alvo.innerHTML = `<div class="vazio"><h2>Área restrita</h2><p>Esta página é só para administradores do AnimeSe.</p>
    <a class="btn btn-primario" href="index.html">Voltar para o início</a></div>`;
} else {
  abasEl.hidden = false;
  abasEl.addEventListener("click", (e) => {
    const aba = e.target.closest(".aba");
    if (aba) abrirAba(aba.dataset.aba);
  });
  const inicial = new URLSearchParams(location.search).get("aba") || "estatisticas";
  abrirAba(inicial);
}

function abrirAba(nome) {
  abasEl.querySelectorAll(".aba").forEach((a) => a.setAttribute("aria-selected", String(a.dataset.aba === nome)));
  history.replaceState(null, "", `admin.html?aba=${nome}`);
  if (nome === "publicacoes") mostrarPublicacoes();
  else mostrarEstatisticas();
}

// ============================================================
// Estatísticas
// ============================================================
const NOMES_PAGINAS = {
  "/index.html": "Início", "/anime.html": "Páginas de anime", "/buscar.html": "Buscar",
  "/sortear.html": "O que assistir?", "/comunidade.html": "Comunidade", "/lista.html": "Minha lista",
  "/perfil.html": "Meu perfil", "/novidades.html": "Novidades", "/post.html": "Publicações", "/admin.html": "Painel admin",
};
const nomePagina = (p) => NOMES_PAGINAS[p] || p;

async function mostrarEstatisticas() {
  alvo.innerHTML = `<p class="secao-descricao">Carregando estatísticas…</p>`;
  const { data: e, error } = await clienteSupabase().rpc("estatisticas_admin");
  if (error) {
    alvo.innerHTML = caixaErro(/does not exist|schema cache/i.test(error.message)
      ? "As estatísticas ainda não foram ativadas no banco (falta rodar o SQL da etapa 2)."
      : error.message);
    return;
  }

  const n = formatarNumero;
  const tile = (rotulo, valor, detalhe = "") =>
    `<div class="tile"><span class="tile-rotulo">${rotulo}</span><strong class="tile-valor">${valor}</strong>${detalhe ? `<span class="tile-detalhe">${detalhe}</span>` : ""}</div>`;

  alvo.innerHTML = `
    <section class="tiles" aria-label="Resumo">
      ${tile("Usuários cadastrados", n(e.usuarios.total), `+${n(e.usuarios.dias7)} nos últimos 7 dias`)}
      ${tile("Visitas hoje", n(e.visitas.hoje))}
      ${tile("Visitas em 7 dias", n(e.visitas.dias7), `${n(e.visitas.unicos7)} ${e.visitas.unicos7 === 1 ? "visitante único" : "visitantes únicos"}`)}
      ${tile("Visitas em 30 dias", n(e.visitas.dias30), `${n(e.visitas.unicos30)} ${e.visitas.unicos30 === 1 ? "visitante único" : "visitantes únicos"}`)}
      ${tile("Avaliações", n(e.comunidade.avaliacoes), `${n(e.comunidade.respostas)} ${e.comunidade.respostas === 1 ? "resposta" : "respostas"}, ${n(e.comunidade.likes)} ${e.comunidade.likes === 1 ? "like" : "likes"}`)}
      ${tile("Sugestões da comunidade", n(e.comunidade.sugestoes))}
      ${tile("Animes nas listas", n(e.listas.total), `${n(e.listas.assistido)} já assistidos`)}
      ${tile("Publicações", n(e.publicacoes.publicadas), `${n(e.publicacoes.rascunhos)} ${e.publicacoes.rascunhos === 1 ? "rascunho" : "rascunhos"}`)}
    </section>

    <section class="painel-admin">
      <div class="painel-admin-topo">
        <h2>Visitas por dia</h2>
        <span class="secao-descricao">Últimos 30 dias. Passe o mouse nas barras para ver os números.</span>
      </div>
      ${graficoVisitas(e.por_dia)}
    </section>

    <div class="colunas-admin">
      <section class="painel-admin">
        <h2>Páginas mais vistas</h2>
        <p class="secao-descricao">Últimos 30 dias</p>
        ${tabela(["Página", "Visitas"], e.paginas.map((p) => [esc(nomePagina(p.pagina)), n(p.visitas)]), "Nenhuma visita registrada ainda.")}
      </section>
      <section class="painel-admin">
        <h2>Animes mais adicionados às listas</h2>
        <p class="secao-descricao">Somando todos os status</p>
        ${tabela(["Anime", "Listas"], e.animes_mais_adicionados.map((a) => [`<a href="anime.html?id=${a.mal_id}">${esc(a.titulo)}</a>`, n(a.total)]), "Ninguém adicionou animes ainda.")}
      </section>
      <section class="painel-admin">
        <h2>Listas por status</h2>
        ${tabela(["Status", "Animes"], [
          ["Assistindo", n(e.listas.assistindo)], ["Já assisti", n(e.listas.assistido)],
          ["Pretendo assistir", n(e.listas.pretendo)], ["Dropei", n(e.listas.dropado)],
        ])}
      </section>
      <section class="painel-admin">
        <h2>Últimos cadastros</h2>
        <p class="secao-descricao">${n(e.usuarios.com_nick)} de ${n(e.usuarios.total)} usuários já escolheram um nick</p>
        <ul class="lista-usuarios">
          ${e.ultimos_usuarios.map((u) => {
            const nome = u.nickname || u.display_name?.split(" ")[0] || "Usuário";
            return `<li>${avatarHtml(u.avatar_url, nome)}<span>${nomeComTag(nome, u.tag, "", u.id ? `usuario.html?id=${u.id}` : null)}</span><span class="data">${formatarData(u.created_at)}</span></li>`;
          }).join("") || "<li>Ninguém se cadastrou ainda.</li>"}
        </ul>
      </section>
    </div>
    <p class="nota-rodape">As visitas são contadas pelo próprio AnimeSe, sem guardar dados pessoais. A mesma pessoa abrindo a mesma página várias vezes em 30 minutos conta uma vez só.</p>`;

  ligarTooltip();
}

function tabela(colunas, linhas, vazio = "Sem dados.") {
  if (!linhas.length) return `<p class="secao-descricao">${vazio}</p>`;
  return `<table class="tabela-admin">
    <thead><tr>${colunas.map((c, i) => `<th ${i ? 'class="num"' : ""}>${c}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td ${i ? 'class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

/** Gráfico de colunas das visitas diárias (uma série, sem legenda). */
function graficoVisitas(dias) {
  const L = 760, A = 220, M = { t: 12, r: 8, b: 26, l: 36 };
  const max = Math.max(4, ...dias.map((d) => d.visitas));
  const passo = Math.pow(10, Math.floor(Math.log10(max)));
  const topo = Math.ceil(max / passo) * passo;
  const larg = (L - M.l - M.r) / dias.length;
  const y = (v) => M.t + (A - M.t - M.b) * (1 - v / topo);
  const marcas = [0, topo / 2, topo];
  const fmtDia = (iso) => { const [, m, d] = String(iso).split("-"); return `${Number(d)}/${Number(m)}`; };

  const barras = dias.map((d, i) => {
    const x = M.l + i * larg;
    const alt = A - M.b - y(d.visitas);
    const texto = `${fmtDia(d.dia)}: ${d.visitas} ${d.visitas === 1 ? "visita" : "visitas"}, ${d.visitantes} ${d.visitantes === 1 ? "visitante" : "visitantes"}`;
    return `<g class="barra" tabindex="0" data-info="${esc(texto)}">
      <rect class="alvo" x="${x}" y="${M.t}" width="${larg}" height="${A - M.t - M.b}"/>
      ${d.visitas ? `<path class="coluna" d="M${x + 2},${A - M.b} v${-(alt - 3)} q0,-3 3,-3 h${larg - 10} q3,0 3,3 v${alt - 3} z"/>` : ""}
      ${i % 5 === 0 || i === dias.length - 1 ? `<text class="eixo" x="${x + larg / 2}" y="${A - 8}" text-anchor="middle">${fmtDia(d.dia)}</text>` : ""}
    </g>`;
  }).join("");

  const total = dias.reduce((s, d) => s + d.visitas, 0);
  return `
    <div class="grafico" role="img" aria-label="Visitas por dia nos últimos 30 dias: ${total} no total">
      <svg viewBox="0 0 ${L} ${A}" preserveAspectRatio="none">
        ${marcas.map((m) => `<line class="grade-linha" x1="${M.l}" x2="${L - M.r}" y1="${y(m)}" y2="${y(m)}"/>
          <text class="eixo" x="${M.l - 6}" y="${y(m) + 4}" text-anchor="end">${formatarNumero(m)}</text>`).join("")}
        ${barras}
      </svg>
      <div class="dica" hidden></div>
    </div>
    <details class="ver-tabela"><summary>Ver como tabela</summary>
      ${tabela(["Dia", "Visitas", "Visitantes"], dias.slice().reverse().map((d) => [fmtDia(d.dia), d.visitas, d.visitantes]))}
    </details>`;
}

function ligarTooltip() {
  const grafico = alvo.querySelector(".grafico");
  if (!grafico) return;
  const dica = grafico.querySelector(".dica");
  const mostrar = (g) => {
    const caixa = g.getBoundingClientRect(), base = grafico.getBoundingClientRect();
    dica.textContent = g.dataset.info;
    dica.hidden = false;
    dica.style.left = `${Math.min(Math.max(caixa.left - base.left + caixa.width / 2, 70), base.width - 70)}px`;
    grafico.querySelectorAll(".barra").forEach((b) => b.classList.toggle("ativa", b === g));
  };
  const esconder = () => { dica.hidden = true; grafico.querySelectorAll(".barra").forEach((b) => b.classList.remove("ativa")); };
  grafico.querySelectorAll(".barra").forEach((g) => {
    g.addEventListener("mouseenter", () => mostrar(g));
    g.addEventListener("focus", () => mostrar(g));
    g.addEventListener("blur", esconder);
  });
  grafico.addEventListener("mouseleave", esconder);
}

// ============================================================
// Publicações
// ============================================================
async function mostrarPublicacoes() {
  alvo.innerHTML = `<p class="secao-descricao">Carregando publicações…</p>`;
  let itens;
  try {
    ({ itens } = await listarPosts({ rascunhos: true, limite: 100 }));
  } catch (e) {
    alvo.innerHTML = caixaErro(e.message);
    return;
  }

  alvo.innerHTML = `
    <div class="painel-admin-topo">
      <p class="secao-descricao">${itens.length} ${itens.length === 1 ? "publicação" : "publicações"}. As marcadas com ★ aparecem no carrossel da página inicial.</p>
      <button class="btn btn-primario" id="btn-nova">Nova publicação</button>
    </div>
    ${itens.length ? `
    <ul class="lista-posts-admin">
      ${itens.map((p) => `
        <li>
          ${capaDoPost(p) ? `<img src="${esc(capaDoPost(p))}" alt="" loading="lazy">` : `<span class="sem-capa"></span>`}
          <div class="info">
            <strong>${p.featured ? '<span title="No carrossel" class="estrela">★</span> ' : ""}${esc(p.title)}</strong>
            <span>${TIPOS_POST[p.kind].nome}${p.anime_title ? `, ${esc(p.anime_title)}` : ""}</span>
          </div>
          <span class="selo ${p.published ? "selo-publicado" : "selo-rascunho"}">${p.published ? `Publicado em ${formatarData(p.published_at)}` : "Rascunho"}</span>
          <div class="acoes">
            ${p.published ? `<a class="btn-texto" href="post.html?id=${p.id}">Ver</a>` : ""}
            <button class="btn btn-contorno" data-editar="${p.id}">Editar</button>
          </div>
        </li>`).join("")}
    </ul>` : `<div class="vazio"><h2>Nenhuma publicação ainda</h2><p>Escreva a primeira notícia, resenha ou poste um vídeo seu.</p></div>`}`;

  alvo.querySelector("#btn-nova").addEventListener("click", () => editor(null));
  alvo.querySelectorAll("[data-editar]").forEach((b) =>
    b.addEventListener("click", async () => editor(await lerPost(Number(b.dataset.editar))))
  );
}

function editor(post) {
  const p = post || { kind: "noticia", published: false, featured: false };
  alvo.innerHTML = `
    <form class="editor" id="editor" novalidate>
      <div class="painel-admin-topo">
        <h2>${post ? "Editar publicação" : "Nova publicação"}</h2>
        <button type="button" class="btn-texto" id="btn-voltar">Voltar para a lista</button>
      </div>

      <div class="editor-colunas">
        <div class="editor-principal">
          <fieldset class="filtro-linha">
            <legend>Tipo</legend>
            <div class="segmentos" role="radiogroup">
              ${Object.entries(TIPOS_POST).map(([id, t]) => `<label><input type="radio" name="kind" value="${id}" ${p.kind === id ? "checked" : ""}> ${t.nome}</label>`).join("")}
            </div>
          </fieldset>

          <div class="campo">
            <label for="ed-titulo">Título</label>
            <input id="ed-titulo" maxlength="160" required value="${esc(p.title || "")}" placeholder="Ex.: Frieren ganha data de estreia da 2ª temporada">
          </div>
          <div class="campo">
            <label for="ed-resumo">Resumo <span class="opcional">(aparece nos cartões e no carrossel)</span></label>
            <textarea id="ed-resumo" maxlength="400" rows="2">${esc(p.summary || "")}</textarea>
          </div>
          <div class="campo">
            <label for="ed-texto">Texto</label>
            <textarea id="ed-texto" rows="14" maxlength="30000" placeholder="Escreva aqui. Deixe uma linha em branco entre os parágrafos.">${esc(p.body || "")}</textarea>
            <p class="ajuda">Formatação: <code>## Subtítulo</code>, <code>**negrito**</code>, <code>*itálico*</code>, <code>[texto](https://link)</code> e linhas começando com <code>- </code> viram lista.</p>
          </div>
        </div>

        <aside class="editor-lateral">
          <div class="campo">
            <span class="rotulo-campo">Capa</span>
            <div class="previa-capa" id="previa-capa"></div>
            <label class="btn btn-contorno btn-arquivo">Enviar imagem<input type="file" id="ed-arquivo" accept="image/jpeg,image/png,image/webp,image/gif"></label>
            <input id="ed-capa" placeholder="ou cole o link de uma imagem" value="${esc(p.cover_url || "")}">
            <p class="ajuda">Sem capa, um vídeo do YouTube usa a miniatura dele.</p>
          </div>
          <div class="campo">
            <label for="ed-video">Vídeo do YouTube <span class="opcional">(opcional)</span></label>
            <input id="ed-video" placeholder="https://youtube.com/watch?v=…" value="${esc(p.video_url || "")}">
            <p class="erro" id="erro-video" hidden>Não reconheci esse link do YouTube.</p>
          </div>
          <div class="campo">
            <label for="ed-anime">Anime relacionado <span class="opcional">(opcional)</span></label>
            <input id="ed-anime" type="search" autocomplete="off" placeholder="Buscar anime…">
            <ul class="sugestoes" id="ed-sugestoes"></ul>
            <div id="ed-anime-escolhido"></div>
          </div>
          <div class="campo" id="campo-nota">
            <label for="ed-nota">Nota da resenha</label>
            <select id="ed-nota">
              <option value="">Sem nota</option>
              ${Array.from({ length: 10 }, (_, i) => 10 - i).map((v) => `<option value="${v}" ${p.score === v ? "selected" : ""}>${v}</option>`).join("")}
            </select>
          </div>
          <label class="check"><input type="checkbox" id="ed-destaque" ${p.featured ? "checked" : ""}> Mostrar no carrossel da página inicial</label>
          <label class="check"><input type="checkbox" id="ed-publicado" ${p.published ? "checked" : ""}> Publicado (visível para todos)</label>
        </aside>
      </div>

      <div class="editor-acoes">
        <button class="btn btn-primario" type="submit">Salvar</button>
        <button class="btn btn-contorno" type="button" id="btn-previa">Pré-visualizar texto</button>
        ${post ? `<button class="btn-texto perigo" type="button" id="btn-excluir">Excluir publicação</button>` : ""}
      </div>
      <div class="previa-texto post-corpo" id="previa-texto" hidden></div>
    </form>`;

  const $ = (s) => alvo.querySelector(s);
  let anime = p.mal_id ? { id: p.mal_id, titulo: p.anime_title } : null;

  const atualizarCapa = () => {
    const url = $("#ed-capa").value.trim() || capaDoPost({ video_url: $("#ed-video").value });
    $("#previa-capa").innerHTML = url ? `<img src="${esc(url)}" alt="Prévia da capa">` : `<span>Sem capa</span>`;
  };
  const atualizarNota = () => { $("#campo-nota").hidden = alvo.querySelector("[name=kind]:checked").value !== "resenha"; };
  const mostrarAnime = () => {
    $("#ed-anime-escolhido").innerHTML = anime
      ? `<div class="favorito-escolhido"><strong>${esc(anime.titulo)}</strong><button type="button" class="link-remover" id="ed-tirar-anime">Tirar</button></div>` : "";
    $("#ed-tirar-anime")?.addEventListener("click", () => { anime = null; mostrarAnime(); });
  };
  atualizarCapa(); atualizarNota(); mostrarAnime();

  $("#ed-capa").addEventListener("input", atualizarCapa);
  $("#ed-video").addEventListener("input", () => {
    const v = $("#ed-video").value.trim();
    $("#erro-video").hidden = !v || Boolean(idYoutube(v));
    atualizarCapa();
  });
  alvo.querySelectorAll("[name=kind]").forEach((r) => r.addEventListener("change", atualizarNota));
  $("#btn-voltar").addEventListener("click", mostrarPublicacoes);

  $("#ed-arquivo").addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    $("#previa-capa").innerHTML = "<span>Enviando…</span>";
    try {
      $("#ed-capa").value = await enviarCapa(arquivo);
      toast("Imagem enviada");
    } catch (err) { toast(err.message); }
    atualizarCapa();
    e.target.value = "";
  });

  let timer;
  $("#ed-anime").addEventListener("input", () => {
    clearTimeout(timer);
    const q = $("#ed-anime").value.trim();
    if (q.length < 3) { $("#ed-sugestoes").innerHTML = ""; return; }
    timer = setTimeout(async () => {
      try {
        const { itens } = await buscar(q, 1, 8);
        $("#ed-sugestoes").innerHTML = itens.map((a) => `<li><button type="button" data-id="${a.id}"><img src="${esc(a.imagem)}" alt=""><span>${esc(a.titulo)}</span></button></li>`).join("");
        $("#ed-sugestoes").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
          const a = itens.find((x) => String(x.id) === b.dataset.id);
          anime = { id: a.id, titulo: a.titulo };
          $("#ed-sugestoes").innerHTML = ""; $("#ed-anime").value = "";
          mostrarAnime();
        }));
      } catch (err) { $("#ed-sugestoes").innerHTML = `<li style="padding:8px">${esc(err.message)}</li>`; }
    }, 450);
  });

  $("#btn-previa").addEventListener("click", () => {
    const previa = $("#previa-texto");
    previa.hidden = !previa.hidden;
    previa.innerHTML = textoParaHtml($("#ed-texto").value) || "<p>Nada escrito ainda.</p>";
  });

  $("#btn-excluir")?.addEventListener("click", async () => {
    if (!confirm("Excluir esta publicação? Não dá para desfazer.")) return;
    try { await excluirPost(post.id); toast("Publicação excluída"); mostrarPublicacoes(); }
    catch (err) { toast(err.message); }
  });

  $("#editor").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = $("#ed-titulo").value.trim();
    if (titulo.length < 3) { toast("Escreva um título com pelo menos 3 letras"); $("#ed-titulo").focus(); return; }
    const video = $("#ed-video").value.trim();
    if (video && !idYoutube(video)) { toast("O link do vídeo precisa ser do YouTube"); $("#ed-video").focus(); return; }
    const kind = alvo.querySelector("[name=kind]:checked").value;
    if (kind === "video" && !video) { toast("Publicações do tipo Vídeo precisam do link do YouTube"); $("#ed-video").focus(); return; }

    const botao = e.submitter || $("#editor [type=submit]");
    botao.disabled = true;
    try {
      await salvarPost({
        id: post?.id, kind, title: titulo,
        summary: $("#ed-resumo").value, body: $("#ed-texto").value,
        cover_url: $("#ed-capa").value, video_url: video,
        mal_id: anime?.id, anime_title: anime?.titulo,
        score: $("#ed-nota").value, featured: $("#ed-destaque").checked, published: $("#ed-publicado").checked,
      });
      toast($("#ed-publicado").checked ? "Publicação salva e publicada" : "Rascunho salvo");
      mostrarPublicacoes();
    } catch (err) {
      toast(err.message);
      botao.disabled = false;
    }
  });
}
