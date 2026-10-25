// Apoiar o AnimeSe: Pix (QR Code e copia e cola), aviso de apoio e mural.
import { montarLayout, esc, toast, entrar, avatarHtml, nomeComTag, caixaErro } from "../ui.js";
import { usuarioAtual, lerPerfil, clienteSupabase } from "../store.js";
import { PIX_CONFIGURADO, pixDoSite, qrCodeSvg, avisarApoio, meusApoios, muralApoiadores } from "../apoio.js";
import { linkPerfil } from "../perfis.js";

await montarLayout();

const usuario = await usuarioAtual();
const perfil = usuario ? await lerPerfil().catch(() => null) : null;
const areaPix = document.getElementById("area-pix");
const areaAviso = document.getElementById("area-aviso");
const campoOutro = document.getElementById("campo-outro");
const inputOutro = document.getElementById("valor-outro");
let valor = 10;

const formatarReais = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ------------------------------------------------------------
// Passo 1: valor, QR Code e copia e cola
// ------------------------------------------------------------
async function desenharPix() {
  if (!PIX_CONFIGURADO) {
    areaPix.innerHTML = `<div class="aviso">O Pix ainda está sendo configurado. Volte em breve!</div>`;
    return;
  }
  const codigo = pixDoSite(valor || null);
  areaPix.innerHTML = `
    <div class="pix-caixa">
      <div class="pix-qr" id="pix-qr" aria-label="QR Code do Pix${valor ? ` de ${formatarReais(valor)}` : ""}" role="img"><span>Gerando QR Code…</span></div>
      <div class="pix-codigo">
        <p><strong>${valor ? formatarReais(valor) : "Valor livre"}</strong> para o AnimeSe</p>
        <p class="secao-descricao">Abra o app do seu banco, escolha <strong>Pix</strong> e leia o QR Code. No celular, use o <strong>Pix copia e cola</strong>:</p>
        <label class="sr-only" for="pix-copia">Código Pix copia e cola</label>
        <textarea id="pix-copia" readonly rows="3">${esc(codigo)}</textarea>
        <button type="button" class="btn btn-primario" id="btn-copiar">Copiar código Pix</button>
      </div>
    </div>`;
  document.getElementById("btn-copiar").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(codigo); toast("Código Pix copiado. Agora cole no app do banco."); }
    catch { document.getElementById("pix-copia").select(); toast("Selecione e copie o código"); }
  });
  try {
    document.getElementById("pix-qr").innerHTML = await qrCodeSvg(codigo);
  } catch {
    document.getElementById("pix-qr").innerHTML = `<span>Não foi possível gerar o QR Code. Use o copia e cola.</span>`;
  }
  const campoValor = document.getElementById("aviso-valor");
  if (campoValor && valor) campoValor.value = valor;
}

document.getElementById("valores").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll("#valores .chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
  campoOutro.hidden = chip.dataset.valor !== "";
  valor = chip.dataset.valor ? Number(chip.dataset.valor) : Number(inputOutro.value) || null;
  if (!campoOutro.hidden) inputOutro.focus();
  desenharPix();
});
let espera;
inputOutro.addEventListener("input", () => {
  clearTimeout(espera);
  espera = setTimeout(() => {
    const v = Math.round(Number(inputOutro.value));
    valor = v >= 1 && v <= 10000 ? v : null;
    desenharPix();
  }, 400);
});

// ------------------------------------------------------------
// Passo 2: avisar o admin para ganhar o selo
// ------------------------------------------------------------
async function desenharAviso() {
  if (!usuario) {
    areaAviso.innerHTML = `
      <p>Para ganhar o selo de Apoiador, entre com sua conta antes de avisar. Também dá para apoiar sem conta, só pelo Pix.</p>
      <button class="btn btn-primario" id="btn-entrar-apoio">Entrar com Google</button>`;
    areaAviso.querySelector("#btn-entrar-apoio").addEventListener("click", entrar);
    return;
  }

  const apoios = await meusApoios();
  const ate = perfil?.apoiadorAte ? new Date(perfil.apoiadorAte) : null;
  const ativo = ate && ate > new Date();
  const statusApoio = { pendente: "Aguardando confirmação", confirmado: "Confirmado", recusado: "Não confirmado" };

  areaAviso.innerHTML = `
    ${ativo ? `<div class="aviso-criador aprovado"><strong>Você é Apoiador do AnimeSe. Obrigado!</strong>
      ${ate.getFullYear() > 9000 ? "Seu selo não expira." : `Seu selo vale até ${ate.toLocaleDateString("pt-BR")}.`}</div>` : ""}
    <p class="secao-descricao">Depois de pagar, avise aqui. O admin confere no banco e libera seu selo, normalmente em até 1 dia.</p>
    <form id="form-aviso" novalidate>
      <div class="campo">
        <label for="aviso-valor">Valor que você enviou (R$)</label>
        <input id="aviso-valor" type="number" min="1" max="10000" step="0.01" inputmode="decimal" value="${valor || ""}" required>
      </div>
      <div class="campo">
        <label for="aviso-nome">Nome de quem pagou <span class="opcional">(como aparece no comprovante)</span></label>
        <input id="aviso-nome" maxlength="80" autocomplete="name" placeholder="Ajuda o admin a achar o seu Pix">
      </div>
      <div class="campo">
        <label for="aviso-msg">Recado para o AnimeSe <span class="opcional">(opcional)</span></label>
        <textarea id="aviso-msg" maxlength="280" rows="2"></textarea>
      </div>
      <button class="btn btn-primario" type="submit">Já fiz o Pix</button>
    </form>
    <label class="check"><input type="checkbox" id="aparecer-mural" ${perfil?.apoiadorPublico !== false ? "checked" : ""}> Mostrar meu nome no mural de apoiadores</label>
    ${apoios.length ? `
      <h3 class="titulo-bloco">Seus apoios</h3>
      <ul class="lista-apoios">
        ${apoios.map((a) => `<li>
          <span>${formatarReais(a.valor)} em ${new Date(a.created_at).toLocaleDateString("pt-BR")}</span>
          <span class="selo ${a.status === "confirmado" ? "selo-publicado" : a.status === "pendente" ? "selo-rascunho" : "selo-recusado"}">${statusApoio[a.status]}</span>
          ${a.status === "recusado" && a.motivo ? `<small>${esc(a.motivo)}</small>` : ""}
        </li>`).join("")}
      </ul>` : ""}`;

  areaAviso.querySelector("#form-aviso").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Number(areaAviso.querySelector("#aviso-valor").value);
    if (!(v >= 1 && v <= 10000)) { toast("Informe o valor que você enviou"); return; }
    const botao = e.target.querySelector("button");
    botao.disabled = true;
    try {
      await avisarApoio({ valor: v, nomePagador: areaAviso.querySelector("#aviso-nome").value, mensagem: areaAviso.querySelector("#aviso-msg").value });
      toast("Aviso enviado! Seu selo aparece assim que o admin confirmar.");
      desenharAviso();
    } catch (err) {
      toast(err.message);
      botao.disabled = false;
    }
  });

  areaAviso.querySelector("#aparecer-mural").addEventListener("change", async (e) => {
    const { error } = await clienteSupabase().from("profiles").update({ supporter_public: e.target.checked }).eq("id", usuario.id);
    toast(error ? "Não foi possível salvar agora" : e.target.checked ? "Seu nome vai aparecer no mural" : "Seu nome não vai aparecer no mural");
    if (!error) desenharMural();
  });
}

// ------------------------------------------------------------
// Mural
// ------------------------------------------------------------
async function desenharMural() {
  const mural = document.getElementById("mural");
  const lista = await muralApoiadores().catch(() => []);
  mural.innerHTML = lista.length
    ? `<ul class="mural-apoiadores">${lista.map((p) => {
        const nome = p.nickname || p.display_name?.split(" ")[0] || "Apoiador";
        return `<li><a href="${linkPerfil(p)}">${avatarHtml(p.avatar_url, nome, true)}<span>${esc(nome)}</span></a></li>`;
      }).join("")}</ul>`
    : `<p class="secao-descricao">Seja a primeira pessoa a apoiar o AnimeSe!</p>`;
}

desenharPix();
desenharAviso().catch((e) => (areaAviso.innerHTML = caixaErro(e.message)));
desenharMural();
