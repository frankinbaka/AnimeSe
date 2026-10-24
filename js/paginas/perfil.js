// Meu perfil: nick, anime favorito e a tag que aparece ao lado do nome.
import {
  montarLayout, caixaErro, esc, toast, entrar,
  nomeComTag, avatarHtml, sugerirTag, limparTag,
} from "../ui.js";
import { usuarioAtual, lerPerfil, salvarPerfil, lerLista } from "../store.js";
import { buscar } from "../mal.js";
import { REDES, normalizarLinkRede, videoIncorporavel } from "../perfis.js";

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
  const assistidos = lista.filter((a) => a.status === "assistido").length;

  alvo.innerHTML = `
    <div class="perfil-cartao" aria-live="polite">
      ${avatarHtml(avatar, estado.nick || usuario.nome)}
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

      <fieldset class="bloco-criador">
        <label class="check check-destaque"><input type="checkbox" id="campo-criador" ${perfil.criador ? "checked" : ""}>
          <span><strong>Sou criador de conteúdo</strong><br><span class="opcional">Mostre seus canais e vídeos numa aba própria do seu perfil.</span></span>
        </label>
        <div id="campos-criador" ${perfil.criador ? "" : "hidden"}>
          ${Object.entries(REDES).map(([id, r]) => `
            <div class="campo">
              <label for="rede-${id}">${r.nome}</label>
              <input id="rede-${id}" type="url" inputmode="url" value="${esc(perfil[id] || "")}" placeholder="${r.exemplo}">
              <p class="erro" id="erro-rede-${id}" hidden>Esse link não é do ${r.nome}.</p>
            </div>`).join("")}
          <div class="campo">
            <label for="campo-videos">Vídeos em destaque <span class="opcional">(até 12, um link por linha)</span></label>
            <textarea id="campo-videos" rows="5" placeholder="https://youtube.com/watch?v=...\nhttps://www.tiktok.com/@voce/video/123...\nhttps://www.instagram.com/reel/...">${esc((perfil.videos || []).join("\n"))}</textarea>
            <p class="ajuda">Aceita vídeos do YouTube (inclusive Shorts), TikTok e Instagram (reels e posts). No TikTok, use o link completo do vídeo, aquele com <code>/video/</code> e números; o link curto do app não funciona.</p>
            <ul class="validacao-videos" id="validacao-videos"></ul>
          </div>
        </div>
      </fieldset>

      <button class="btn btn-primario" type="submit" id="btn-salvar">Salvar perfil</button>
    </form>`;

  // Criador de conteúdo: mostra/esconde os campos e confere os links de vídeo
  const caixaCriador = alvo.querySelector("#campo-criador");
  caixaCriador.addEventListener("change", () => { alvo.querySelector("#campos-criador").hidden = !caixaCriador.checked; });
  const campoVideos = alvo.querySelector("#campo-videos");
  const conferirVideos = () => {
    const linhas = campoVideos.value.split("\n").map((l) => l.trim()).filter(Boolean);
    alvo.querySelector("#validacao-videos").innerHTML = linhas.map((l) => {
      const v = videoIncorporavel(l);
      return `<li class="${v ? "ok" : "falha"}">${v ? `✓ ${REDES[v.rede].nome}` : "✗ Link não reconhecido"}: ${esc(l.length > 60 ? l.slice(0, 57) + "…" : l)}</li>`;
    }).join("") + (linhas.length > 12 ? `<li class="falha">✗ Só os 12 primeiros vídeos serão salvos.</li>` : "");
    return linhas;
  };
  campoVideos.addEventListener("input", conferirVideos);
  conferirVideos();

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
      // Campos de criador de conteúdo
      const criador = caixaCriador.checked;
      const redes = {};
      for (const id of Object.keys(REDES)) {
        const campo = alvo.querySelector(`#rede-${id}`);
        const { ok, valor } = normalizarLinkRede(id, campo.value);
        alvo.querySelector(`#erro-rede-${id}`).hidden = ok || !criador;
        if (criador && !ok) { campo.focus(); throw new Error(`O link do ${REDES[id].nome} parece errado.`); }
        redes[id] = valor;
        campo.value = valor;
      }
      const videos = conferirVideos().filter((l) => videoIncorporavel(l)).slice(0, 12);
      if (criador && !Object.values(redes).some(Boolean) && !videos.length) {
        throw new Error("Como criador, adicione pelo menos um canal ou vídeo.");
      }

      await salvarPerfil({
        bio: alvo.querySelector("#campo-bio").value,
        criador, ...redes, videos,
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
}
