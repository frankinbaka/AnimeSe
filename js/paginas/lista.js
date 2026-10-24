// Minha lista: animes do usuário separados por status.
import { montarLayout, cardAnime, caixaErro, entrar } from "../ui.js";
import { usuarioAtual, lerLista, STATUS } from "../store.js";

await montarLayout();

const alvo = document.getElementById("conteudo-lista");
const usuario = await usuarioAtual();

if (!usuario) {
  alvo.innerHTML = `
    <div class="vazio">
      <h2>Entre para ver sua lista</h2>
      <p>Com sua conta Google você marca o que está assistindo, o que já viu, o que pretende ver e o que dropou.</p>
      <button class="btn btn-primario" id="btn-entrar-lista">Entrar com Google</button>
    </div>`;
  alvo.querySelector("#btn-entrar-lista").addEventListener("click", entrar);
} else {
  try {
    const lista = await lerLista();
    if (!lista.length) {
      alvo.innerHTML = `
        <div class="vazio">
          <h2>Sua lista está vazia</h2>
          <p>Busque um anime e escolha um status na página dele.</p>
          <a class="btn btn-primario" href="buscar.html">Buscar anime</a>
        </div>`;
    } else {
      montarAbas(lista);
    }
  } catch (e) {
    alvo.innerHTML = caixaErro(e.message);
  }
}

function montarAbas(lista) {
  const abas = [{ id: "todos", nome: "Todos" }, ...STATUS];
  const contar = (id) => (id === "todos" ? lista.length : lista.filter((a) => a.status === id).length);
  let ativa = new URLSearchParams(location.search).get("status") || "todos";

  alvo.innerHTML = `
    <div class="abas" role="tablist">
      ${abas.map((a) => `<button class="aba" role="tab" data-aba="${a.id}" aria-selected="${a.id === ativa}">${a.nome}<span class="contador">${contar(a.id)}</span></button>`).join("")}
    </div>
    <div class="grade" id="grade-lista" role="tabpanel"></div>`;

  const grade = alvo.querySelector("#grade-lista");
  const mostrar = () => {
    const itens = ativa === "todos" ? lista : lista.filter((a) => a.status === ativa);
    grade.innerHTML = itens.length
      ? itens.map((a) => cardAnime(a, { status: a.status })).join("")
      : `<p class="vazio" style="grid-column:1/-1">Nenhum anime com esse status ainda.</p>`;
  };

  alvo.querySelectorAll(".aba").forEach((b) =>
    b.addEventListener("click", () => {
      ativa = b.dataset.aba;
      alvo.querySelectorAll(".aba").forEach((x) => x.setAttribute("aria-selected", x === b));
      history.replaceState(null, "", ativa === "todos" ? "lista.html" : `lista.html?status=${ativa}`);
      mostrar();
    })
  );
  mostrar();
}
