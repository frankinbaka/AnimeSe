// ============================================================
// Apoio via Pix: código "copia e cola" (BR Code), QR Code,
// avisos de apoio e selo de Apoiador.
// Tabelas em supabase/etapa8_apoios.sql
// ============================================================

import { clienteSupabase, usuarioAtual } from "./store.js";
import { PIX_CHAVE, PIX_NOME, PIX_CIDADE } from "./config.js";

export const PIX_CONFIGURADO = Boolean(PIX_CHAVE && PIX_NOME && PIX_CIDADE);

// ------------------------------------------------------------
// BR Code (padrão do Banco Central para Pix copia e cola)
// ------------------------------------------------------------
const campo = (id, valor) => id + String(valor.length).padStart(2, "0") + valor;

/** Tira acentos e caracteres fora do padrão do Pix. */
const limpar = (texto, max) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .\-]/g, "").trim().slice(0, max);

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no fim do código. */
function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Gera o Pix copia e cola.
 * valor: número em reais (opcional; sem valor a pessoa digita no app do banco)
 */
export function codigoPix({ chave, nome, cidade, valor = null, descricao = "" }) {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", chave.trim()) +
    (descricao ? campo("02", limpar(descricao, 40)) : "");
  let codigo =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (valor ? campo("54", Number(valor).toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", limpar(nome, 25)) +
    campo("60", limpar(cidade, 15)) +
    campo("62", campo("05", "***")) +
    "6304";
  return codigo + crc16(codigo);
}

export const pixDoSite = (valor) =>
  codigoPix({ chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE, valor, descricao: "Apoio AnimeSe" });

/** Desenha o QR Code (SVG) do texto informado. */
export async function qrCodeSvg(texto) {
  const { default: QRCode } = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
  return QRCode.toString(texto, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a2240", light: "#ffffff" } });
}

// ------------------------------------------------------------
// Avisos de apoio
// ------------------------------------------------------------
const db = () => {
  const c = clienteSupabase();
  if (!c) throw new Error("O apoio precisa do Supabase configurado.");
  return c;
};

function erroAmigavel(error) {
  if (/does not exist|schema cache/i.test(error.message)) {
    return new Error("O apoio ainda não foi ativado no banco (falta rodar o SQL da etapa 8).");
  }
  return new Error(error.message);
}

export async function avisarApoio({ valor, mensagem, nomePagador }) {
  const u = await usuarioAtual();
  if (!u) throw new Error("Entre com sua conta Google para receber o selo de Apoiador.");
  const { error } = await db().from("supports").insert({
    user_id: u.id, valor: Number(valor), mensagem: mensagem?.trim() || null, nome_pagador: nomePagador?.trim() || null,
  });
  if (error) throw erroAmigavel(error);
}

export async function meusApoios() {
  const u = await usuarioAtual();
  if (!u) return [];
  const { data, error } = await db().from("supports").select("*").eq("user_id", u.id).order("created_at", { ascending: false });
  if (error) return [];
  return data;
}

export async function muralApoiadores() {
  const { data, error } = await db().rpc("mural_apoiadores");
  return error ? [] : data;
}

/** true se o perfil tem selo de Apoiador valendo. */
export const ehApoiador = (perfil) => Boolean(perfil?.supporter_until && new Date(perfil.supporter_until) > new Date());

// ----- Admin -----
export async function contarApoiosPendentes() {
  const { data, error } = await db().rpc("apoios_pendentes");
  return error ? 0 : data || 0;
}

export async function apoiosParaAdmin() {
  const { data, error } = await db().from("supports").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw erroAmigavel(error);
  const ids = [...new Set(data.map((a) => a.user_id))];
  const { data: perfis } = ids.length
    ? await db().from("profiles").select("id, nickname, tag, display_name, avatar_url, supporter_until").in("id", ids)
    : { data: [] };
  const porId = new Map((perfis || []).map((p) => [p.id, p]));
  return data.map((a) => ({ ...a, usuario: porId.get(a.user_id) }));
}

export async function confirmarApoio(id, dias) {
  const { error } = await db().rpc("confirmar_apoio", { p_apoio: id, p_dias: dias });
  if (error) throw erroAmigavel(error);
}

export async function recusarApoio(id, motivo) {
  const { error } = await db().rpc("recusar_apoio", { p_apoio: id, p_motivo: motivo || null });
  if (error) throw erroAmigavel(error);
}
