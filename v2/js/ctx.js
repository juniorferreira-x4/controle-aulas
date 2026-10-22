// Estado compartilhado e utilitários de interface.
import { ehVirtual, parseVirtual, horaDoAluno, DIFICULDADES_PADRAO, ETAPAS_PADRAO, ETAPAS_CONVERSA } from "./regras.js";

// Registro de ações de clique (data-a) e de campos (data-i), preenchido pelas telas.
export const ACOES = {};
export const CAMPOS = {};
// Função de limpeza da tela atual (timers, áudio), chamada ao trocar de rota.
export const TELA = { limpar: null };

export const S = {
  store: null,      // LocalStore | FirebaseStore
  banco: null,      // banco de exercícios
  fb: null,         // Firebase (se configurado)
  usuario: null,
  semanaOffset: 0,
  filtroAlunos: "ativo",
  bib: { nivel: null, topicoId: null, dif: "medio" },
  rerender: () => {}
};

export function esc(v) {
  return (v ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function attr(v) { return esc(v); }

let toastTimer;
export function toast(msg, ms = 2400) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("mostrar");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("mostrar"), ms);
}
export function erro(e) { console.error(e); toast("Erro: " + (e && e.message ? e.message : e), 5000); }

export function navegar(hash) { if (location.hash === hash) S.rerender(); else location.hash = hash; }

// ===== Modal =====
let modalAtual = null;
export function abrirModal(html, { onAction, onInput, onClose } = {}) {
  fecharModal();
  const raiz = document.getElementById("modal-raiz");
  raiz.innerHTML = `<div class="modal-fundo" data-fundo="1">${html}</div>`;
  const fundo = raiz.firstElementChild;
  modalAtual = { onClose };
  fundo.addEventListener("click", ev => {
    if (ev.target === fundo) { fecharModal(); return; }
    const el = ev.target.closest("[data-m]");
    if (el && onAction) onAction(el.dataset.m, el, ev);
  });
  if (onInput) { fundo.addEventListener("input", ev => onInput(ev.target, ev)); fundo.addEventListener("change", ev => onInput(ev.target, ev)); }
  const foco = fundo.querySelector("[autofocus], input, select, textarea, button");
  if (foco) setTimeout(() => foco.focus(), 30);
  return fundo;
}
export function fecharModal() {
  const raiz = document.getElementById("modal-raiz");
  if (raiz) raiz.innerHTML = "";
  if (modalAtual && modalAtual.onClose) modalAtual.onClose();
  modalAtual = null;
}
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && modalAtual) fecharModal(); });

// ===== Dados auxiliares =====
export function config() {
  const c = S.store.config || {};
  return {
    etapas: c.etapas && c.etapas.length ? c.etapas : ETAPAS_PADRAO,
    etapasConversa: c.etapasConversa && c.etapasConversa.length ? c.etapasConversa : ETAPAS_CONVERSA,
    dificuldades: c.dificuldades && c.dificuldades.length ? c.dificuldades : DIFICULDADES_PADRAO,
    emailAssunto: c.emailAssunto || "Bora voltar com o inglês, {nome}?",
    emailCorpo: c.emailCorpo || "Oi, {nome}! Tudo bem?\n\nFaz um tempo desde a nossa última aula ({ultima}). Tenho alguns horários abertos e um formato de aula novo, com listening e homework personalizados.\n\nQuer marcar uma aula para retomar de onde paramos?\n\nAbraço,\nJunior\n\n(Se preferir não receber mais mensagens, é só responder \"parar\".)",
    tema: c.tema || "escuro"
  };
}

export function nomeAluno(id) { const a = S.store.aluno(id); return a ? a.nome : "(aluno removido)"; }
export function tagNivel(n) { return n ? `<span class="tag nv-${esc(n)}">${esc(n)}</span>` : `<span class="tag">nível?</span>`; }
export function tagSituacao(s) {
  const L = { ativo: "Ativo", trancado: "Trancado", inativo: "Inativo", experimental: "Experimental" };
  return `<span class="tag st-${esc(s)}">${esc(L[s] || s)}</span>`;
}

// Resolve uma chave (id real ou virtual) em um objeto de aula.
export function resolverAula(key) {
  if (!ehVirtual(key)) return S.store.aula(key) || null;
  const { alunoId, data } = parseVirtual(key);
  const existente = S.store.aulas.find(a => a.alunoId === alunoId && a.data === data && a.tipo !== "reposicao");
  if (existente) return existente;
  const al = S.store.aluno(alunoId);
  if (!al) return null;
  return { key, alunoId, data, hora: horaDoAluno(al, data), tipo: "regular", status: "agendada", virtual: true };
}

// Garante que a aula exista no banco (cria a partir do horário fixo, se for virtual).
export async function materializar(key) {
  const a = resolverAula(key);
  if (!a) throw new Error("Aula não encontrada.");
  if (a.id) return a;
  const nova = { alunoId: a.alunoId, data: a.data, hora: a.hora, tipo: "regular", status: "agendada" };
  await S.store.salvarAula(nova);
  return nova;
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast("Copiado."); return true; }
  catch {
    const ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    ta.remove(); toast(ok ? "Copiado." : "Não consegui copiar. Selecione o texto manualmente."); return ok;
  }
}

export function linkWhats(aluno, texto) {
  const num = (aluno && aluno.whatsapp || "").replace(/\D/g, "");
  if (!num) return null;
  const n = num.length <= 11 ? "55" + num : num;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

export const ICONES = {
  voltar: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`,
  prox: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>`,
  play: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>`,
  pausa: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>`,
  mais: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  fone: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 14v-2a9 9 0 0118 0v2"/><path d="M3 14h4v6H3zM17 14h4v6h-4z"/></svg>`,
  externo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h5"/></svg>`
};
