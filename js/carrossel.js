// ============================================================
// Carrossel com parallax da página inicial.
// Cada slide: { chamada, titulo, meta, texto, carregarTexto, imagem,
//               poster, link, botoes: [{ href, texto, primario }] }
// ============================================================
import { esc } from "./ui.js";

const INTERVALO_MS = 7000;
const semMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function montarCarrossel(raiz, slides) {
  if (!slides.length) { raiz.hidden = true; return; }
  let atual = 0;
  let timer = null;

  raiz.innerHTML = `
    <div class="slides">
      ${slides.map((s, i) => `
        <div class="slide ${i === 0 ? "ativo" : ""}" role="group" aria-roledescription="slide"
             aria-label="${i + 1} de ${slides.length}" ${i === 0 ? "" : 'aria-hidden="true"'}>
          <div class="hero-fundo ${s.fundoNitido ? "fundo-nitido" : ""}" style="background-image:url('${esc(s.imagem)}')"></div>
          <div class="container slide-conteudo">
            <div>
              <p class="hero-chamada">${esc(s.chamada)}</p>
              <h2 class="slide-titulo"><a href="${esc(s.link)}" tabindex="${i === 0 ? 0 : -1}">${esc(s.titulo)}</a></h2>
              ${s.meta ? `<div class="hero-meta">${s.meta}</div>` : ""}
              <p class="hero-sinopse" data-texto="${i}">${esc(s.texto || "")}</p>
              <div class="hero-acoes">
                ${s.botoes.map((b) => `<a class="btn ${b.primario ? "btn-primario" : "btn-claro"}" href="${esc(b.href)}" tabindex="${i === 0 ? 0 : -1}">${esc(b.texto)}</a>`).join("")}
              </div>
            </div>
            ${s.poster ? `<img class="hero-poster" src="${esc(s.poster)}" alt="" loading="${i === 0 ? "eager" : "lazy"}">` : ""}
          </div>
        </div>`).join("")}
    </div>
    ${slides.length > 1 ? `
      <button class="seta seta-anterior" type="button" aria-label="Destaque anterior">‹</button>
      <button class="seta seta-proxima" type="button" aria-label="Próximo destaque">›</button>
      <div class="pontos" role="tablist" aria-label="Escolher destaque">
        ${slides.map((s, i) => `<button type="button" role="tab" aria-label="${esc(s.titulo)}" aria-selected="${i === 0}" data-ir="${i}"></button>`).join("")}
      </div>
      <div class="progresso" aria-hidden="true"><span></span></div>` : ""}`;

  const elSlides = [...raiz.querySelectorAll(".slide")];
  const pontos = [...raiz.querySelectorAll(".pontos button")];
  const carregados = new Set();

  const carregarTexto = (i) => {
    const s = slides[i];
    if (!s.carregarTexto || carregados.has(i)) return;
    carregados.add(i);
    const p = raiz.querySelector(`[data-texto="${i}"]`);
    if (!s.texto) p.textContent = "Carregando sinopse…";
    s.carregarTexto().then((t) => { if (t) p.textContent = t; }).catch(() => { if (!s.texto) p.textContent = ""; });
  };

  const ir = (i) => {
    atual = (i + slides.length) % slides.length;
    elSlides.forEach((el, j) => {
      const ativo = j === atual;
      el.classList.toggle("ativo", ativo);
      el.toggleAttribute("aria-hidden", !ativo);
      el.querySelectorAll("a").forEach((a) => (a.tabIndex = ativo ? 0 : -1));
    });
    pontos.forEach((p, j) => p.setAttribute("aria-selected", String(j === atual)));
    carregarTexto(atual);
    reiniciar();
  };

  const reiniciar = () => {
    clearTimeout(timer);
    raiz.classList.remove("rodando");
    if (semMovimento || slides.length < 2 || raiz.matches(":hover, :focus-within")) return;
    void raiz.offsetWidth; // reinicia a animação da barra de progresso
    raiz.classList.add("rodando");
    timer = setTimeout(() => ir(atual + 1), INTERVALO_MS);
  };

  raiz.querySelector(".seta-anterior")?.addEventListener("click", () => ir(atual - 1));
  raiz.querySelector(".seta-proxima")?.addEventListener("click", () => ir(atual + 1));
  pontos.forEach((p) => p.addEventListener("click", () => ir(Number(p.dataset.ir))));

  // Pausa enquanto o mouse ou o foco do teclado estão no carrossel
  raiz.addEventListener("mouseenter", () => { clearTimeout(timer); raiz.classList.remove("rodando"); });
  raiz.addEventListener("mouseleave", reiniciar);
  raiz.addEventListener("focusin", () => { clearTimeout(timer); raiz.classList.remove("rodando"); });
  raiz.addEventListener("focusout", (e) => { if (!raiz.contains(e.relatedTarget)) reiniciar(); });
  raiz.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") ir(atual - 1);
    if (e.key === "ArrowRight") ir(atual + 1);
  });

  // Arrastar no celular
  let inicioX = null;
  raiz.addEventListener("touchstart", (e) => { inicioX = e.touches[0].clientX; }, { passive: true });
  raiz.addEventListener("touchend", (e) => {
    if (inicioX == null) return;
    const dx = e.changedTouches[0].clientX - inicioX;
    if (Math.abs(dx) > 50) ir(atual + (dx < 0 ? 1 : -1));
    inicioX = null;
  });

  // Parallax: o fundo desce mais devagar que a página
  if (!semMovimento) {
    let pendente = false;
    const atualizar = () => {
      pendente = false;
      const y = Math.min(window.scrollY, raiz.offsetHeight);
      raiz.style.setProperty("--parallax", `${y * 0.4}px`);
    };
    window.addEventListener("scroll", () => {
      if (!pendente) { pendente = true; requestAnimationFrame(atualizar); }
    }, { passive: true });
  }

  carregarTexto(0);
  reiniciar();
}
