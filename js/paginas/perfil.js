// Meu perfil: nick, anime favorito e a tag que aparece ao lado do nome.
import {
  montarLayout, caixaErro, esc, toast, entrar,
  nomeComTag, avatarHtml, sugerirTag, limparTag,
} from "../ui.js";
import { usuarioAtual, lerPerfil, salvarPerfil, lerLista, enviarFotoPerfil, usarFotoGoogle } from "../store.js";
import { buscar } from "../mal.js";
import { REDES, normalizarLinkRede, videoIncorporavel, solicitarCriador, cancelarPedidoCriador, sairDeCriador } from "../perfis.js";

await montarLayout();

const alvo = document.getElementById("conteudo-perfil");
const usuario = await usuarioAtual();

if (!usuario) {
  alvo.innerHTML = `
    <div class="vazio">
      <h2>Entre para editar seu perfil</h2>
      <p>Escolha seu nick e a tag do seu anime favorito.</p>
      <button class="btn btn-primario" id="btn-entrar-perfil">Entrar com Google</button>
    </div>`;
  alvo.querySelector("#btn-entrar-perfil").addEventListener("click", entrar);
} else {
  try {
    const perfil = await lerPerfil();
    const lista = await lerLista().catch(() => []);
    montar(perfil, lista);
  } catch (e) {
    alvo.innerHTML = caixaErro(e.message);
  }
}

function montar(perfil, lista) {
  const estado = {
    nick: perfil.nick || "",
    tag: perfil.tag || "",
    favoritoId: perfil.favoritoId || null,
    favoritoTitulo: perfil.favoritoTitulo || "",
    favoritoImagem: perfil.favoritoImagem || "",
    tagEditadaManualmente: Boolean(perfil.tag),
  };
  const avatar = perfil.avatar || usuario.avatar;
  const dadosCriador = perfil.criadorStatus === "pending" && perfil.criadorPendente
    ? perfil.criadorPendente
    : { youtube: perfil.youtube, tiktok: perfil.tiktok, instagram: perfil.instagram, videos: perfil.videos };
  const assistidos = lista.filter((a) => a.status === "assistido").length;

  alvo.innerHTML = `
    <div class="perfil-cartao" aria-live="polite">
      <div class="foto-perfil">
        <div id="foto-atual">${avatarHtml(avatar, estado.nick || usuario.nome)}</div>
        <label class="btn btn-contorno btn-arquivo btn-foto">Trocar foto
          <input type="file" id="campo-foto" accept="image/jpeg,image/png,image/webp">
        </label>
        ${usuario.avatar && avatar !== usuario.avatar ? `<button type="button" class="btn-texto" id="btn-foto-google">Usar a foto do Google</button>` : ""}
      </div>
      <div>
        <div id="previa-nome"></div>
        <p>${lista.length} ${lista.length === 1 ? "anime" : "animes"} na lista, ${assistidos} ${assistidos === 1 ? "já assistido" : "já assistidos"}</p>
        <a class="link-perfil-publico" href="usuario.html?id=${usuario.id}">Ver meu perfil público</a>
      </div>
    </div>

    <form class="formulario" id="form-perfil" novalidate>
      <div class="campo">
        <label for="campo-nick">Nick</label>
        <input id="campo-nick" maxlength="20" autocomplete="nickname" value="${esc(estado.nick)}" placeholder="Como você quer aparecer no site">
        <p class="ajuda">De 3 a 20 caracteres: letras, números, ponto, hífen ou _.</p>
        <p class="erro" id="erro-nick" hidden></p>
      </div>

      <div class="campo">
        <label for="campo-favorito">Anime favorito</label>
        <input id="campo-favorito" type="search" autocomplete="off" placeholder="Digite para buscar, ex.: Sword Art Online"
               role="combobox" aria-expanded="false" aria-controls="sugestoes-favorito">
        <ul class="sugestoes" id="sugestoes-favorito" role="listbox"></ul>
        <div id="favorito-escolhido"></div>
      </div>

      <div class="campo">
        <label for="campo-tag">Tag do favorito</label>
        <div class="campo-tag">
          <input id="campo-tag" maxlength="5" value="${esc(estado.tag)}" placeholder="SAO">
          <button type="button" class="btn btn-contorno" id="btn-sugerir-tag">Sugerir</button>
        </div>
        <p class="ajuda">Aparece ao lado do seu nick. Até 5 letras ou números. Sugerimos as iniciais do anime, mas você pode mudar (ex.: FMAB, JJK, AOT).</p>
      </div>

      <div class="campo">
        <label for="campo-bio">Sobre mim <span class="opcional">(opcional)</span></label>
        <textarea id="campo-bio" maxlength="300" rows="3" placeholder="Ex.: Fã de isekai e shounen, assistindo tudo da temporada.">${esc(perfil.bio || "")}</textarea>
      </div>


      <button class="btn btn-primario" type="submit" id="btn-salvar">Salvar perfil</button>
    </form>

    <form class="formulario formulario-criador" id="form-criador" novalidate>
      <h2>Criador de conteúdo</h2>
      <div id="status-criador"></div>
      <div id="campos-criador" hidden>
        ${Object.entries(REDES).map(([id, r]) => `
          <div class="campo">
            <label for="rede-${id}">${r.nome}</label>
            <input id="rede-${id}" type="url" inputmode="url" value="${esc(dadosCriador[id] || "")}" placeholder="${r.exemplo}">
          </div>`).join("")}
        <div class="campo">
          <label for="campo-videos">Vídeos em destaque <span class="opcional">(até 12, um link por linha)</span></label>
          <textarea id="campo-videos" rows="5" placeholder="https://youtube.com/watch?v=...\nhttps://www.tiktok.com/@voce/video/123...\nhttps://www.instagram.com/reel/...">${esc((dadosCriador.videos || []).join("\n"))}</textarea>
          <p class="ajuda">Aceita vídeos do YouTube (inclusive Shorts), TikTok e Instagram (reels e posts). No TikTok, use o link completo do vídeo, com <code>/video/</code> e números; o link curto do app não funciona.</p>
          <ul class="validacao-videos" id="validacao-videos"></ul>
        </div>
        <div class="acoes-form">
          <button class="btn btn-primario" type="submit" id="btn-solicitar"></button>
        </div>
      </div>
    </form>`;

  montarCriador();
  ligarFoto();

  const campoNick = alvo.querySelector("#campo-nick");
  const campoTag = alvo.querySelector("#campo-tag");
  const campoFav = alvo.querySelector("#campo-favorito");
  const sugestoes = alvo.querySelector("#sugestoes-favorito");
  const escolhido = alvo.querySelector("#favorito-escolhido");
  const previa = alvo.querySelector("#previa-nome");
  const erroNick = alvo.querySelector("#erro-nick");

  const atualizarPrevia = () => {
    previa.innerHTML = nomeComTag(estado.nick || usuario.nome.split(" ")[0], estado.tag, estado.favoritoTitulo);
  };

  const mostrarEscolhido = () => {
    escolhido.innerHTML = estado.favoritoId
      ? `<div class="favorito-escolhido">
           ${estado.favoritoImagem ? `<img src="${esc(estado.favoritoImagem)}" alt="">` : ""}
           <strong>${esc(estado.favoritoTitulo)}</strong>
           <button type="button" class="link-remover" id="btn-limpar-fav">Trocar</button>
         </div>`
      : "";
    escolhido.querySelector("#btn-limpar-fav")?.addEventListener("click", () => {
      Object.assign(estado, { favoritoId: null, favoritoTitulo: "", favoritoImagem: "" });
      mostrarEscolhido();
      campoFav.focus();
    });
  };

  campoNick.addEventListener("input", () => {
    estado.nick = campoNick.value.trim();
    erroNick.hidden = true;
    atualizarPrevia();
  });

  campoTag.addEventListener("input", () => {
    campoTag.value = limparTag(campoTag.value);
    estado.tag = campoTag.value;
    estado.tagEditadaManualmente = true;
    atualizarPrevia();
  });

  alvo.querySelector("#btn-sugerir-tag").addEventListener("click", () => {
    if (!estado.favoritoTitulo) { toast("Escolha primeiro o anime favorito"); campoFav.focus(); return; }
    estado.tag = sugerirTag(estado.favoritoTitulo);
    campoTag.value = estado.tag;
    atualizarPrevia();
  });

  // Busca do favorito com atraso para não estourar o limite da API
  let timer;
  campoFav.addEventListener("input", () => {
    clearTimeout(timer);
    const q = campoFav.value.trim();
    if (q.length < 3) { sugestoes.innerHTML = ""; campoFav.setAttribute("aria-expanded", "false"); return; }
    timer = setTimeout(async () => {
      try {
        const { itens } = await buscar(q, 1, 8);
        sugestoes.innerHTML = itens.map((a) => `
          <li role="option"><button type="button" data-id="${a.id}">
            <img src="${esc(a.imagem)}" alt=""><span>${esc(a.titulo)}${a.ano ? ` (${a.ano})` : ""}</span>
          </button></li>`).join("") || `<li style="padding:8px">Nenhum anime encontrado.</li>`;
        campoFav.setAttribute("aria-expanded", "true");
        sugestoes.querySelectorAll("button").forEach((b) =>
          b.addEventListener("click", () => {
            const a = itens.find((x) => String(x.id) === b.dataset.id);
            Object.assign(estado, { favoritoId: a.id, favoritoTitulo: a.titulo, favoritoImagem: a.imagem });
            if (!estado.tagEditadaManualmente || !estado.tag) {
              estado.tag = sugerirTag(a.titulo);
              campoTag.value = estado.tag;
            }
            sugestoes.innerHTML = "";
            campoFav.value = "";
            campoFav.setAttribute("aria-expanded", "false");
            mostrarEscolhido();
            atualizarPrevia();
          })
        );
      } catch (e) {
        sugestoes.innerHTML = `<li style="padding:8px">${esc(e.message)}</li>`;
      }
    }, 450);
  });

  alvo.querySelector("#form-perfil").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!/^[\p{L}\p{N}._-]{3,20}$/u.test(estado.nick)) {
      erroNick.textContent = "O nick precisa ter de 3 a 20 caracteres, sem espaços (letras, números, ponto, hífen ou _).";
      erroNick.hidden = false;
      campoNick.focus();
      return;
    }
    const botao = alvo.querySelector("#btn-salvar");
    botao.disabled = true;
    try {
      await salvarPerfil({
        bio: alvo.querySelector("#campo-bio").value,
        nick: estado.nick, tag: estado.tag,
        favoritoId: estado.favoritoId, favoritoTitulo: estado.favoritoTitulo, favoritoImagem: estado.favoritoImagem,
      });
      toast("Perfil salvo");
      // Atualiza o nome no menu do topo
      document.querySelector(".menu-usuario .nome-curto")?.replaceChildren();
      const curto = document.querySelector(".menu-usuario .nome-curto");
      if (curto) curto.innerHTML = nomeComTag(estado.nick, estado.tag, estado.favoritoTitulo);
    } catch (err) {
      toast(err.message);
    } finally {
      botao.disabled = false;
    }
  });

  mostrarEscolhido();
  atualizarPrevia();

  // ------------------------------------------------------------
  // Foto de perfil
  // ------------------------------------------------------------
  function ligarFoto() {
    const campo = alvo.querySelector("#campo-foto");
    const atual = alvo.querySelector("#foto-atual");
    const trocarNoMenu = (url) => {
      const img = document.querySelector("#btn-menu-usuario .avatar");
      if (img?.tagName === "IMG") img.src = url;
      else img?.replaceWith(Object.assign(document.createElement("img"), { className: "avatar", src: url, alt: "" }));
    };
    campo.addEventListener("change", async () => {
      const arquivo = campo.files[0];
      if (!arquivo) return;
      atual.classList.add("enviando");
      try {
        const url = await enviarFotoPerfil(arquivo);
        atual.innerHTML = avatarHtml(url, estado.nick || usuario.nome);
        trocarNoMenu(url);
        toast("Foto de perfil atualizada");
      } catch (e) { toast(e.message); }
      atual.classList.remove("enviando");
      campo.value = "";
    });
    alvo.querySelector("#btn-foto-google")?.addEventListener("click", async (e) => {
      try {
        const url = await usarFotoGoogle();
        atual.innerHTML = avatarHtml(url, estado.nick || usuario.nome);
        trocarNoMenu(url);
        e.target.remove();
        toast("Voltou para a foto do Google");
      } catch (err) { toast(err.message); }
    });
  }

  // ------------------------------------------------------------
  // Criador de conteúdo: pedido ao admin
  // ------------------------------------------------------------
  function montarCriador() {
    const status = perfil.criadorStatus;
    const statusEl = alvo.querySelector("#status-criador");
    const campos = alvo.querySelector("#campos-criador");
    const botao = alvo.querySelector("#btn-solicitar");
    const dataPedido = perfil.criadorPedidoEm ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(new Date(perfil.criadorPedidoEm)) : "";

    const avisos = [];
    if (perfil.criador) {
      avisos.push(`<div class="aviso-criador aprovado"><strong>Você é criador de conteúdo verificado.</strong>
        Seus canais e vídeos aparecem na aba Vídeos do seu perfil público. Mudanças nos links passam por uma nova análise; os atuais continuam no ar até lá.</div>`);
    }
    if (status === "pending") {
      avisos.push(`<div class="aviso-criador pendente"><strong>Pedido enviado${dataPedido ? ` em ${dataPedido}` : ""}, aguardando análise do admin.</strong>
        Você pode ajustar os links abaixo e reenviar, ou <button type="button" class="btn-texto" id="btn-cancelar-pedido">cancelar o pedido</button>.</div>`);
    }
    if (status === "rejected") {
      avisos.push(`<div class="aviso-criador recusado"><strong>Seu último pedido foi recusado.</strong>
        ${perfil.criadorMotivo ? `Motivo: “${esc(perfil.criadorMotivo)}”.` : ""} Você pode corrigir e enviar de novo.</div>`);
    }
    if (status === "none" || (status === "rejected" && !perfil.criador)) {
      avisos.push(`<p class="secao-descricao">Você faz vídeos sobre anime no YouTube, TikTok ou Instagram? Peça o selo de criador. A equipe do AnimeSe confere seus links e, depois de aprovado, eles aparecem no seu perfil público.</p>
        <button type="button" class="btn btn-contorno" id="btn-quero-criador">Quero ser criador de conteúdo</button>`);
    }
    statusEl.innerHTML = avisos.join("");

    botao.textContent = perfil.criador ? "Enviar alterações para aprovação" : status === "pending" ? "Atualizar pedido" : "Solicitar acesso de criador";
    campos.hidden = !(perfil.criador || status === "pending");
    if (perfil.criador) {
      botao.insertAdjacentHTML("afterend", `<button type="button" class="btn-texto perigo" id="btn-sair-criador">Deixar de ser criador</button>`);
    }

    statusEl.querySelector("#btn-quero-criador")?.addEventListener("click", (e) => {
      campos.hidden = false;
      e.target.remove();
      alvo.querySelector("#rede-youtube").focus();
    });

    statusEl.querySelector("#btn-cancelar-pedido")?.addEventListener("click", async () => {
      try { await cancelarPedidoCriador(); toast("Pedido cancelado"); location.reload(); }
      catch (err) { toast(err.message); }
    });

    alvo.querySelector("#btn-sair-criador")?.addEventListener("click", async () => {
      if (!confirm("Deixar de ser criador? O selo, os links e os vídeos saem do seu perfil. Para voltar, será preciso pedir de novo.")) return;
      try { await sairDeCriador(); toast("Você deixou de ser criador"); location.reload(); }
      catch (err) { toast(err.message); }
    });

    const campoVideos = alvo.querySelector("#campo-videos");
    const conferirVideos = () => {
      const linhas = campoVideos.value.split("\n").map((l) => l.trim()).filter(Boolean);
      alvo.querySelector("#validacao-videos").innerHTML = linhas.map((l) => {
        const v = videoIncorporavel(l);
        return `<li class="${v ? "ok" : "falha"}">${v ? `✓ ${REDES[v.rede].nome}` : "✗ Link não reconhecido"}: ${esc(l.length > 60 ? l.slice(0, 57) + "…" : l)}</li>`;
      }).join("") + (linhas.length > 12 ? `<li class="falha">✗ Só os 12 primeiros vídeos serão enviados.</li>` : "");
      return linhas;
    };
    campoVideos.addEventListener("input", conferirVideos);
    conferirVideos();

    alvo.querySelector("#form-criador").addEventListener("submit", async (e) => {
      e.preventDefault();
      const dados = { videos: [] };
      for (const id of Object.keys(REDES)) {
        const campo = alvo.querySelector(`#rede-${id}`);
        const { ok, valor } = normalizarLinkRede(id, campo.value);
        if (!ok) { campo.focus(); toast(`O link do ${REDES[id].nome} parece errado.`); return; }
        campo.value = valor;
        dados[id] = valor || null;
      }
      const linhas = conferirVideos();
      const invalidos = linhas.filter((l) => !videoIncorporavel(l));
      if (invalidos.length) { campoVideos.focus(); toast("Corrija ou apague os links de vídeo marcados com ✗"); return; }
      dados.videos = linhas.slice(0, 12);
      if (!dados.youtube && !dados.tiktok && !dados.instagram && !dados.videos.length) {
        toast("Adicione pelo menos um canal ou vídeo"); return;
      }
      botao.disabled = true;
      try {
        await solicitarCriador(dados);
        toast("Pedido enviado! Você será avisado aqui quando o admin analisar.");
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        toast(err.message);
        botao.disabled = false;
      }
    });
  }
}
