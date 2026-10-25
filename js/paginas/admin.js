// Painel admin: estatísticas do site e publicações (notícias, resenhas, vídeos).
import { montarLayout, esc, toast, caixaErro, entrar, formatarNumero, avatarHtml, nomeComTag } from "../ui.js";
import { usuarioAtual, clienteSupabase } from "../store.js";
import {
  souAdmin, listarPosts, lerPost, salvarPost, excluirPost, enviarCapa,
  TIPOS_POST, idYoutube, capaDoPost, formatarData, textoParaHtml,
} from "../conteudo.js";
import { buscar } from "../mal.js";
import {
  REDES, videoIncorporavel, contarPedidosCriador, pedidosCriador, criadoresAprovados, avaliarCriador, revogarCriador,
} from "../perfis.js";
import { contarDenunciasAbertas, denunciasParaAdmin, resolverDenuncias, MOTIVOS_DENUNCIA } from "../feed.js";
import { FEED_ATIVO, PAGINAS_ATIVAS } from "../config.js";
import { paginasParaModerar, moderarPagina, STATUS_PAGINA } from "../paginas-dados.js";
import { avatarPagina } from "../paginas-ui.js";
import { contarApoiosPendentes, apoiosParaAdmin, confirmarApoio, recusarApoio } from "../apoio.js";

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
  atualizarAlertaCriadores();
  atualizarAlertaApoios();
  if (PAGINAS_ATIVAS) atualizarAlertaPaginas();
  else abasEl.querySelector('[data-aba="paginas"]')?.remove();
  if (FEED_ATIVO) atualizarAlertaDenuncias();
  else abasEl.querySelector('[data-aba="denuncias"]')?.remove();
  const inicial = new URLSearchParams(location.search).get("aba") || "estatisticas";
  abrirAba(inicial);
}

function abrirAba(nome) {
  abasEl.querySelectorAll(".aba").forEach((a) => a.setAttribute("aria-selected", String(a.dataset.aba === nome)));
  history.replaceState(null, "", `admin.html?aba=${nome}`);
  if (nome === "publicacoes") mostrarPublicacoes();
  else if (nome === "criadores") mostrarCriadores();
  else if (nome === "apoios") mostrarApoios();
  else if (nome === "paginas" && PAGINAS_ATIVAS) mostrarPaginas();
  else if (nome === "denuncias" && FEED_ATIVO) mostrarDenuncias();
  else mostrarEstatisticas();
}

// ============================================================
// Estatísticas
// ============================================================
const NOMES_PAGINAS = {
  "/index.html": "Início", "/anime.html": "Páginas de anime", "/buscar.html": "Buscar",
  "/sortear.html": "O que assistir?", "/comunidade.html": "Comunidade", "/lista.html": "Minha lista",
  "/perfil.html": "Editar perfil", "/usuario.html": "Perfis públicos", "/feed.html": "Feed de vídeos", "/paginas.html": "Feed das páginas", "/pagina.html": "Páginas da comunidade", "/novidades.html": "Novidades (antiga)", "/post.html": "Publicações", "/admin.html": "Painel admin",
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
      ${tile("Visitas em 30 dias", n(e.visitas.dias30), `${n(e.visitas.unicos30)} ${e.visitas.unicos30 === 1 ? "visitante único" : "visitantes únicos"}${e.visitas.paginas30 != null ? `, ${n(e.visitas.paginas30)} páginas vistas` : ""}`)}
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
        ${tabela(["Página", "Vezes aberta"], e.paginas.map((p) => [esc(nomePagina(p.pagina)), n(p.visitas)]), "Nenhuma visita registrada ainda.")}
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
    <p class="nota-rodape">As visitas são contadas pelo próprio AnimeSe, sem guardar dados pessoais. Uma visita é cada vez que alguém entra no site: navegar entre páginas ou atualizar não conta de novo, e só conta outra visita depois de 30 minutos sem abrir nada. As suas visitas como admin não entram na conta.</p>`;

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
      <p class="secao-descricao">${itens.length} ${itens.length === 1 ? "publicação" : "publicações"}. ${FEED_ATIVO ? "Publicadas vão para o feed como posts oficiais do AnimeSe. " : ""}As marcadas com ★ aparecem no carrossel da página inicial.</p>
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

// ============================================================
// Criadores de conteúdo: pedidos para aprovar
// ============================================================
async function atualizarAlertaCriadores() {
  const n = await contarPedidosCriador();
  const el = document.getElementById("alerta-criadores");
  el.textContent = n;
  el.hidden = !n;
  el.title = `${n} ${n === 1 ? "pedido aguardando" : "pedidos aguardando"} análise`;
}

function linksCriador(d) {
  const redes = Object.keys(REDES).filter((r) => d[r]);
  return redes.length
    ? `<ul class="links-criador">${redes.map((r) => `<li><span>${REDES[r].nome}</span><a href="${esc(d[r])}" target="_blank" rel="noopener nofollow">${esc(d[r])}</a></li>`).join("")}</ul>`
    : `<p class="secao-descricao">Nenhum canal informado.</p>`;
}

function videosCriador(lista = []) {
  if (!lista.length) return `<p class="secao-descricao">Nenhum vídeo informado.</p>`;
  return `<div class="videos-pedido">${lista.map((url) => {
    const v = videoIncorporavel(url);
    return v
      ? `<div class="video-criador ${v.vertical ? "vertical" : ""}"><iframe src="${esc(v.embed)}" title="Vídeo enviado" loading="lazy" allowfullscreen></iframe>
           <a href="${esc(url)}" target="_blank" rel="noopener nofollow">Abrir no ${REDES[v.rede].nome}</a></div>`
      : `<p class="erro">Link não reconhecido: ${esc(url)}</p>`;
  }).join("")}</div>`;
}

const nomeDo = (u) => u.nickname || u.display_name?.split(" ")[0] || "Usuário";
const dataHora = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "");

async function mostrarCriadores() {
  alvo.innerHTML = `<p class="secao-descricao">Carregando pedidos…</p>`;
  let pedidos, aprovados;
  try {
    [pedidos, aprovados] = await Promise.all([pedidosCriador(), criadoresAprovados()]);
  } catch (e) {
    alvo.innerHTML = caixaErro(e.message);
    return;
  }

  alvo.innerHTML = `
    <section>
      <div class="painel-admin-topo">
        <h2>Pedidos aguardando análise</h2>
        <span class="secao-descricao">Confira os canais e os vídeos antes de aprovar. Só depois da aprovação eles aparecem no perfil público.</span>
      </div>
      ${pedidos.length ? pedidos.map((u) => {
        const jaCriador = u.is_creator;
        return `
        <article class="pedido-criador painel-admin" data-usuario="${u.id}">
          <header>
            ${avatarHtml(u.avatar_url, nomeDo(u))}
            <div>
              ${nomeComTag(nomeDo(u), u.tag, u.favorite_title, `usuario.html?id=${u.id}`)}
              <span class="secao-descricao">${jaCriador ? "Criador aprovado pedindo para mudar os links" : "Novo pedido de criador"}, enviado em ${dataHora(u.creator_requested_at)}. No AnimeSe desde ${formatarData(u.created_at)}.</span>
            </div>
          </header>
          <h3>Canais</h3>
          ${linksCriador(u.creator_pending || {})}
          ${jaCriador ? `<details><summary>Ver os links atuais (aprovados antes)</summary>${linksCriador({ youtube: u.youtube_url, tiktok: u.tiktok_url, instagram: u.instagram_url })}</details>` : ""}
          <h3>Vídeos em destaque</h3>
          ${videosCriador(u.creator_pending?.videos || [])}
          <div class="decisao">
            <label class="rotulo" for="motivo-${u.id}">Motivo da recusa <span class="opcional">(o usuário vê esse texto)</span></label>
            <textarea id="motivo-${u.id}" rows="2" maxlength="500" placeholder="Ex.: Os vídeos não são sobre anime."></textarea>
            <div class="acoes-form">
              <button class="btn btn-primario" type="button" data-decisao="aprovar">Aprovar criador</button>
              <button class="btn btn-contorno" type="button" data-decisao="recusar">Recusar pedido</button>
            </div>
          </div>
        </article>`;
      }).join("") : `<div class="vazio"><h2>Nenhum pedido pendente</h2><p>Quando alguém pedir o selo de criador, o pedido aparece aqui e no menu da sua foto.</p></div>`}
    </section>

    <section class="secao">
      <div class="painel-admin-topo"><h2>Criadores aprovados</h2><span class="secao-descricao">${aprovados.length} no total</span></div>
      ${aprovados.length ? `<ul class="lista-criadores">${aprovados.map((u) => `
        <li data-usuario="${u.id}">
          ${avatarHtml(u.avatar_url, nomeDo(u))}
          <div class="info">
            ${nomeComTag(nomeDo(u), u.tag, u.favorite_title, `usuario.html?id=${u.id}`)}
            <span class="secao-descricao">${Object.keys(REDES).filter((r) => u[`${r}_url`]).map((r) => REDES[r].nome).join(", ") || "Sem canais"}, ${(u.creator_videos || []).length} vídeos. Aprovado em ${dataHora(u.creator_reviewed_at)}</span>
          </div>
          <button class="btn-texto perigo" type="button" data-revogar>Revogar selo</button>
        </li>`).join("")}</ul>` : `<p class="secao-descricao">Nenhum criador aprovado ainda.</p>`}
    </section>`;

  alvo.querySelectorAll("[data-decisao]").forEach((b) => b.addEventListener("click", async () => {
    const cartao = b.closest(".pedido-criador");
    const id = cartao.dataset.usuario;
    const aprovar = b.dataset.decisao === "aprovar";
    const motivo = cartao.querySelector("textarea").value.trim();
    if (!aprovar && !motivo && !confirm("Recusar sem explicar o motivo? O usuário só verá que foi recusado.")) return;
    cartao.querySelectorAll("button").forEach((x) => (x.disabled = true));
    try {
      await avaliarCriador(id, aprovar, motivo);
      toast(aprovar ? "Criador aprovado: o selo e os links já estão no perfil" : "Pedido recusado");
      atualizarAlertaCriadores();
      mostrarCriadores();
    } catch (err) {
      toast(err.message);
      cartao.querySelectorAll("button").forEach((x) => (x.disabled = false));
    }
  }));

  alvo.querySelectorAll("[data-revogar]").forEach((b) => b.addEventListener("click", async () => {
    const li = b.closest("li");
    const motivo = prompt("Motivo para revogar o selo (o usuário vê esse texto). Deixe em branco para não informar.");
    if (motivo === null) return;
    try {
      await revogarCriador(li.dataset.usuario, motivo);
      toast("Selo de criador revogado");
      mostrarCriadores();
    } catch (err) { toast(err.message); }
  }));
}

// ============================================================
// Denúncias do feed
// ============================================================
async function atualizarAlertaDenuncias() {
  const n = await contarDenunciasAbertas();
  const el = document.getElementById("alerta-denuncias");
  el.textContent = n;
  el.hidden = !n;
  el.title = `${n} ${n === 1 ? "publicação denunciada" : "publicações denunciadas"} aguardando análise`;
}

const SITUACOES_DENUNCIA = {
  mantida: "Mantida por você", removida: "Removida por você", removida_auto: "Removida automaticamente (5 denúncias em 24 h)",
};

function cartaoDenuncia(g, aberto) {
  const v = g.video_url ? videoIncorporavel(g.video_url) : null;
  const nomeAutorDen = g.autor ? nomeDo(g.autor) : "Publicação oficial";
  const contagem = {};
  g.denuncias.forEach((d) => (contagem[d.motivo] = (contagem[d.motivo] || 0) + 1));
  return `
    <article class="painel-admin denuncia" data-chave="${g.chave}">
      <div class="denuncia-colunas">
        <div class="denuncia-midia">
          ${v && aberto ? `<div class="video-criador ${v.vertical ? "vertical" : ""}"><iframe src="${esc(v.embed)}" title="Vídeo denunciado" loading="lazy" allowfullscreen></iframe></div>`
            : v ? `<a href="${esc(g.video_url)}" target="_blank" rel="noopener nofollow">Abrir o vídeo no ${REDES[v.rede].nome}</a>`
            : `<a href="feed.html?item=${g.chave}">Ver no feed</a>`}
        </div>
        <div class="denuncia-info">
          <p class="denuncia-autor">Publicado por ${g.autor ? nomeComTag(nomeAutorDen, g.autor.tag, "", `usuario.html?id=${g.autor.id}`) : esc(nomeAutorDen)}</p>
          ${g.legenda ? `<p class="secao-descricao">Legenda: “${esc(g.legenda)}”</p>` : ""}
          <p><strong>${g.denuncias.length} ${g.denuncias.length === 1 ? "denúncia" : "denúncias"}:</strong>
            ${Object.entries(contagem).map(([m, n]) => `${esc(MOTIVOS_DENUNCIA[m])} (${n})`).join(", ")}</p>
          <ul class="lista-denuncias">
            ${g.denuncias.map((d) => `<li>
              <span>${esc(MOTIVOS_DENUNCIA[d.motivo])}${d.detalhe ? `: “${esc(d.detalhe)}”` : ""}</span>
              <span class="data">por ${d.denunciante ? `<a href="usuario.html?id=${d.denunciante.id}">${esc(nomeDo(d.denunciante))}</a>` : "usuário"}, ${dataHora(d.created_at)}</span>
            </li>`).join("")}
          </ul>
          ${aberto ? `
            <div class="acoes-form">
              <button class="btn btn-contorno" type="button" data-resolver="manter">Está tudo ok, manter</button>
              <button class="btn btn-perigo" type="button" data-resolver="remover">Remover publicação</button>
            </div>` : `<p class="selo ${g.situacao === "mantida" ? "selo-publicado" : "selo-rascunho"}">${SITUACOES_DENUNCIA[g.situacao] || g.situacao}</p>`}
        </div>
      </div>
    </article>`;
}

async function mostrarDenuncias() {
  alvo.innerHTML = `<p class="secao-descricao">Carregando denúncias…</p>`;
  let dados;
  try {
    dados = await denunciasParaAdmin();
  } catch (e) {
    alvo.innerHTML = caixaErro(e.message);
    return;
  }

  alvo.innerHTML = `
    <section>
      <div class="painel-admin-topo">
        <h2>Aguardando análise</h2>
        <span class="secao-descricao">Vídeos com 5 denúncias de pessoas diferentes em 24 horas saem do ar sozinhos.</span>
      </div>
      ${dados.abertas.length ? dados.abertas.map((g) => cartaoDenuncia(g, true)).join("")
        : `<div class="vazio"><h2>Nenhuma denúncia aberta</h2><p>Quando alguém denunciar uma publicação do feed, ela aparece aqui e no menu da sua foto.</p></div>`}
    </section>
    ${dados.resolvidas.length ? `
      <section class="secao">
        <div class="painel-admin-topo"><h2>Resolvidas recentemente</h2></div>
        ${dados.resolvidas.map((g) => cartaoDenuncia(g, false)).join("")}
      </section>` : ""}`;

  alvo.querySelectorAll("[data-resolver]").forEach((b) => b.addEventListener("click", async () => {
    const cartao = b.closest(".denuncia");
    const remover = b.dataset.resolver === "remover";
    if (remover && !confirm("Remover esta publicação do feed? Não dá para desfazer.")) return;
    cartao.querySelectorAll("button").forEach((x) => (x.disabled = true));
    try {
      await resolverDenuncias(cartao.dataset.chave, remover);
      toast(remover ? "Publicação removida" : "Publicação mantida e denúncias arquivadas");
      atualizarAlertaApoios();
  if (PAGINAS_ATIVAS) atualizarAlertaPaginas();
  else abasEl.querySelector('[data-aba="paginas"]')?.remove();
  if (FEED_ATIVO) atualizarAlertaDenuncias();
  else abasEl.querySelector('[data-aba="denuncias"]')?.remove();
      mostrarDenuncias();
    } catch (err) {
      toast(err.message);
      cartao.querySelectorAll("button").forEach((x) => (x.disabled = false));
    }
  }));
}

// ============================================================
// Apoios via Pix
// ============================================================
async function atualizarAlertaApoios() {
  const n = await contarApoiosPendentes();
  const el = document.getElementById("alerta-apoios");
  el.textContent = n;
  el.hidden = !n;
  el.title = `${n} ${n === 1 ? "aviso de apoio" : "avisos de apoio"} para conferir`;
}

const reais = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function mostrarApoios() {
  alvo.innerHTML = `<p class="secao-descricao">Carregando apoios…</p>`;
  let apoios;
  try { apoios = await apoiosParaAdmin(); }
  catch (e) { alvo.innerHTML = caixaErro(e.message); return; }

  const pendentes = apoios.filter((a) => a.status === "pendente");
  const resolvidos = apoios.filter((a) => a.status !== "pendente").slice(0, 40);
  const confirmados = apoios.filter((a) => a.status === "confirmado");
  const total = confirmados.reduce((s, a) => s + Number(a.valor), 0);
  const mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
  const doMes = confirmados.filter((a) => new Date(a.resolved_at || a.created_at) >= mes).reduce((s, a) => s + Number(a.valor), 0);

  const linhaUsuario = (a) => {
    const u = a.usuario;
    const nome = u ? nomeDo(u) : "Usuário";
    return `${avatarHtml(u?.avatar_url, nome)}<div>${nomeComTag(nome, u?.tag, "", u ? `usuario.html?id=${u.id}` : null)}
      <span class="secao-descricao">${dataHora(a.created_at)}</span></div>`;
  };

  alvo.innerHTML = `
    <section class="tiles" aria-label="Resumo dos apoios">
      <div class="tile"><span class="tile-rotulo">Confirmado este mês</span><strong class="tile-valor">${reais(doMes)}</strong></div>
      <div class="tile"><span class="tile-rotulo">Confirmado no total</span><strong class="tile-valor">${reais(total)}</strong><span class="tile-detalhe">${confirmados.length} ${confirmados.length === 1 ? "apoio" : "apoios"}</span></div>
      <div class="tile"><span class="tile-rotulo">Aguardando conferência</span><strong class="tile-valor">${pendentes.length}</strong></div>
    </section>

    <section>
      <div class="painel-admin-topo">
        <h2>Para conferir</h2>
        <span class="secao-descricao">Confira no app do banco se o Pix chegou antes de confirmar.</span>
      </div>
      ${pendentes.length ? pendentes.map((a) => `
        <article class="painel-admin apoio-admin" data-apoio="${a.id}">
          <header class="apoio-admin-topo">
            ${linhaUsuario(a)}
            <strong class="apoio-valor">${reais(a.valor)}</strong>
          </header>
          ${a.nome_pagador ? `<p>Nome no comprovante: <strong>${esc(a.nome_pagador)}</strong></p>` : `<p class="secao-descricao">Não informou o nome de quem pagou.</p>`}
          ${a.mensagem ? `<p class="apoio-recado">“${esc(a.mensagem)}”</p>` : ""}
          <div class="decisao">
            <label class="rotulo" for="dias-${a.id}">Duração do selo de Apoiador</label>
            <select id="dias-${a.id}" class="select-dias">
              <option value="30">30 dias</option>
              <option value="365">1 ano</option>
              <option value="">Para sempre</option>
            </select>
            <label class="rotulo" for="motivo-apoio-${a.id}">Motivo, se recusar <span class="opcional">(o usuário vê)</span></label>
            <textarea id="motivo-apoio-${a.id}" rows="2" maxlength="300" placeholder="Ex.: Não encontrei esse Pix no extrato."></textarea>
            <div class="acoes-form">
              <button class="btn btn-primario" type="button" data-decisao-apoio="confirmar">Pix recebido, dar o selo</button>
              <button class="btn btn-contorno" type="button" data-decisao-apoio="recusar">Não encontrei o Pix</button>
            </div>
          </div>
        </article>`).join("") : `<div class="vazio"><h2>Nada para conferir</h2><p>Quando alguém avisar que fez um Pix, o aviso aparece aqui e no menu da sua foto.</p></div>`}
    </section>

    ${resolvidos.length ? `
      <section class="secao">
        <div class="painel-admin-topo"><h2>Histórico</h2></div>
        ${tabela(["Apoiador", "Valor", "Situação"], resolvidos.map((a) => [
          `${esc(a.usuario ? nomeDo(a.usuario) : "Usuário")} <span class="secao-descricao">${dataHora(a.created_at)}</span>`,
          reais(a.valor),
          a.status === "confirmado" ? "Confirmado" : `Recusado${a.motivo ? `: ${esc(a.motivo)}` : ""}`,
        ]))}
      </section>` : ""}
    <p class="nota-rodape">O selo é somado: se a pessoa já é Apoiadora e apoia de novo, os dias são acrescentados ao final do selo atual.</p>`;

  alvo.querySelectorAll("[data-decisao-apoio]").forEach((b) => b.addEventListener("click", async () => {
    const cartao = b.closest(".apoio-admin");
    const id = Number(cartao.dataset.apoio);
    cartao.querySelectorAll("button").forEach((x) => (x.disabled = true));
    try {
      if (b.dataset.decisaoApoio === "confirmar") {
        const dias = cartao.querySelector(".select-dias").value;
        await confirmarApoio(id, dias ? Number(dias) : null);
        toast("Apoio confirmado: o selo de Apoiador já está no perfil");
      } else {
        await recusarApoio(id, cartao.querySelector("textarea").value);
        toast("Aviso de apoio recusado");
      }
      atualizarAlertaApoios();
      mostrarApoios();
    } catch (err) {
      toast(err.message);
      cartao.querySelectorAll("button").forEach((x) => (x.disabled = false));
    }
  }));
}


// ============================================================
// Páginas da comunidade
// ============================================================
async function atualizarAlertaPaginas() {
  const n = await clienteSupabase().rpc("paginas_pendentes").then((r) => (r.error ? 0 : r.data || 0));
  const el = document.getElementById("alerta-paginas");
  el.textContent = n;
  el.hidden = !n;
  el.title = `${n} ${n === 1 ? "página aguardando" : "páginas aguardando"} aprovação`;
}

async function mostrarPaginas() {
  alvo.innerHTML = `<p class="secao-descricao">Carregando páginas…</p>`;
  let paginas;
  try { paginas = await paginasParaModerar(); }
  catch (e) { alvo.innerHTML = caixaErro(e.message); return; }

  const pendentes = paginas.filter((p) => p.status === "pending");
  const outras = paginas.filter((p) => p.status !== "pending");
  const nomeDono = (d) => d?.nickname || d?.display_name?.split(" ")[0] || "Usuário";
  const linha = (p, pendente) => `
    <li class="pagina-moderar" data-id="${p.id}">
      ${avatarPagina(p, "grande")}
      <div class="pagina-moderar-info">
        <strong>${esc(p.name)}</strong> <small>@${esc(p.slug)}</small>
        ${!pendente ? ` <span class="selo selo-pagina-${p.status}">${STATUS_PAGINA[p.status]}</span>` : ""}
        <p class="dica">Pedida por <a href="usuario.html?id=${p.owner_id}">${esc(nomeDono(p.dono))}</a> em ${new Date(p.created_at).toLocaleDateString("pt-BR")}
          ${p.status === "approved" ? ` · ${formatarNumero(p.followers_count)} seguidores · ${formatarNumero(p.posts_count)} publicações` : ""}</p>
        ${p.description ? `<p>${esc(p.description)}</p>` : `<p class="dica">Sem descrição.</p>`}
        ${p.admin_note ? `<p class="nota-admin">Seu recado: ${esc(p.admin_note)}</p>` : ""}
      </div>
      <div class="pagina-moderar-acoes">
        ${pendente ? `
          <button type="button" class="btn btn-primario btn-pequeno" data-moderar="approved">Aprovar</button>
          <button type="button" class="btn btn-contorno btn-pequeno" data-moderar="rejected">Recusar</button>`
        : p.status === "approved" ? `
          <a class="btn btn-contorno btn-pequeno" href="pagina.html?p=${esc(p.slug)}">Abrir</a>
          <button type="button" class="btn-link-perigo" data-moderar="suspended">Suspender</button>`
        : `<button type="button" class="btn btn-contorno btn-pequeno" data-moderar="approved">${p.status === "suspended" ? "Reativar" : "Aprovar mesmo assim"}</button>`}
      </div>
    </li>`;

  alvo.innerHTML = `
    <div class="painel-admin">
      <h2>Pedidos de página ${pendentes.length ? `<span class="contador-alerta">${pendentes.length}</span>` : ""}</h2>
      <p class="secao-descricao">Ao aprovar, a página aparece para todos e o dono já pode publicar. Ao recusar, deixe um recado dizendo o que ajustar.</p>
      ${pendentes.length ? `<ul class="lista-paginas-moderar">${pendentes.map((p) => linha(p, true)).join("")}</ul>` : `<p class="vazio">Nenhum pedido esperando.</p>`}
    </div>
    <div class="painel-admin">
      <h2>Todas as páginas</h2>
      ${outras.length ? `<ul class="lista-paginas-moderar">${outras.map((p) => linha(p, false)).join("")}</ul>` : `<p class="vazio">Nenhuma página ainda.</p>`}
    </div>`;

  alvo.querySelectorAll("[data-moderar]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.closest("[data-id]").dataset.id;
    const status = b.dataset.moderar;
    let nota = "";
    if (status === "rejected") {
      nota = prompt("Recado para o dono da página (o que ajustar para aprovar):", "");
      if (nota === null) return;
    }
    if (status === "suspended") {
      nota = prompt("Motivo da suspensão (o dono vai ver):", "");
      if (nota === null) return;
    }
    b.disabled = true;
    try {
      await moderarPagina(id, status, nota);
      toast({ approved: "Página aprovada", rejected: "Pedido recusado", suspended: "Página suspensa" }[status]);
      atualizarAlertaPaginas();
      mostrarPaginas();
    } catch (e) { toast(e.message); b.disabled = false; }
  }));
}
