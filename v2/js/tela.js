// "Tela do aluno": (1) espelho da aula aberta em outra janela (BroadcastChannel) ou
// (2) página de listening independente, para o aluno abrir no aparelho dele (?t=ID_DO_TEXTO).
import * as TTS from "./tts.js";
import { carregarBanco } from "./banco.js";

const raiz = document.getElementById("tela");
const esc = v => (v ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PLAY = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>`;
const PAUSA = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>`;
try { if (localStorage.getItem("ca2_tema") === "claro") document.documentElement.dataset.tema = "claro"; } catch {}

let rate = 1, rateAplicada = null, textoAtual = null;

function player(corpo) {
  if (!TTS.suportado()) return `<p class="sub">This browser can't read the text aloud. Ask your teacher to read it.</p>`;
  if (textoAtual !== corpo) { TTS.carregar(corpo, atualizarPlayer); textoAtual = corpo; }
  if (rateAplicada !== rate) { TTS.definirVelocidade(rate); rateAplicada = rate; }
  return `<div class="player"><button class="play" id="p-btn" aria-label="Play">${TTS.estado().tocando ? PAUSA : PLAY}</button>
      <div class="flex1 pilha" style="gap:6px"><div class="progresso"><i id="p-prog" style="width:0%"></i></div><span class="mini" id="p-info">Press play to listen</span></div></div>
    <div class="linha"><button class="btn btn-sm" id="p-back">↺ Previous sentence</button>
      <div class="seg" role="group" aria-label="Speed">${[0.75, 0.85, 1, 1.15].map(r => `<button class="btn-sm" data-rate="${r}" aria-pressed="${r === rate}">${r}×</button>`).join("")}</div>
      <button class="btn btn-sm" id="p-restart">Start again</button></div>`;
}
function atualizarPlayer(e = TTS.estado()) {
  const b = document.getElementById("p-btn"), pr = document.getElementById("p-prog"), inf = document.getElementById("p-info");
  if (!b) return;
  b.innerHTML = e.tocando ? PAUSA : PLAY; b.setAttribute("aria-label", e.tocando ? "Pause" : "Play");
  if (pr) pr.style.width = Math.round((e.total ? e.idx / e.total : 0) * 100) + "%";
  if (inf) inf.textContent = e.total && (e.tocando || e.idx > 0) ? `Sentence ${Math.min(e.idx + 1, e.total)} of ${e.total}${e.tocando ? "" : e.idx >= e.total ? " · finished" : " · paused"}` : "Press play to listen";
}
function ligarPlayer() {
  document.getElementById("p-btn")?.addEventListener("click", () => { const e = TTS.estado(); if (e.tocando) TTS.pausar(); else TTS.tocar(); });
  document.getElementById("p-back")?.addEventListener("click", () => TTS.voltarFrase());
  document.getElementById("p-restart")?.addEventListener("click", () => { TTS.parar(); });
  document.querySelectorAll("[data-rate]").forEach(b => b.addEventListener("click", () => {
    rate = Number(b.dataset.rate); rateAplicada = rate; TTS.definirVelocidade(rate);
    document.querySelectorAll("[data-rate]").forEach(x => x.setAttribute("aria-pressed", String(Number(x.dataset.rate) === rate)));
  }));
  atualizarPlayer();
}
const ol = (itens, inicio = 1) => `<ol start="${inicio}">${itens.map(i => `<li>${esc(i)}</li>`).join("")}</ol>`;

// ----- Modo 2: listening independente -----
async function modoOuvir(id, r) {
  rate = r || 1;
  document.title = "Listening — English class";
  let banco;
  try { banco = await carregarBanco("banco/"); } catch { raiz.innerHTML = `<div class="aguardando">Could not load the text. Check your connection.</div>`; return; }
  const tx = banco.textosPorId[id];
  if (!tx) { raiz.innerHTML = `<div class="aguardando">Text not found. Ask your teacher for a new link.</div>`; return; }
  const desenhar = () => {
    raiz.innerHTML = `
      <header class="tela-cab"><span class="marca-sup">Gutierrez Ferreira · Listening</span></header>
      <div class="blocos">
        <section class="bloco"><h2>${esc(tx.nivel)} · listening</h2><div style="font-size:28px;font-weight:700">${esc(tx.titulo)}</div>
          ${player(tx.texto)}
          <p class="mini" style="margin:0">Listen carefully. Your teacher will ask you some questions.</p></section>
      </div>`;
    ligarPlayer();
  };
  TTS.aoCarregarVozes(() => {});
  desenhar();
}

// ----- Modo 1: espelho da aula -----
function modoEspelho() {
  document.title = "Aula — Tela do aluno";
  let canal;
  try { canal = new BroadcastChannel("ca2-tela"); } catch {
    raiz.innerHTML = `<div class="aguardando">Este navegador não permite a tela espelhada. Use o Chrome ou o Edge.</div>`; return;
  }
  raiz.innerHTML = `<div class="aguardando"><p style="font-size:20px">Esperando a aula…</p><p class="mini">Deixe esta janela aberta e compartilhe só ela na chamada. Ela acompanha a etapa da aula automaticamente.</p></div>`;
  canal.onmessage = ev => {
    const d = ev.data;
    if (!d || d.tipo !== "estado") return;
    let html = `<header class="tela-cab"><span class="marca-sup">Gutierrez Ferreira · English class</span><span class="tela-etapa">${esc(d.etapa)}</span><span class="flex1"></span><span class="sub">${esc(d.aluno)}</span></header><div class="blocos">`;
    let temPlayer = false;
    d.blocos.forEach(b => {
      if (b.grande) html += `<section class="bloco grande">${b.titulo ? `<h2>${esc(b.titulo)}</h2>` : ""}${b.itens.map(i => `<p>${esc(i)}</p>`).join("")}</section>`;
      else if (b.texto) html += `<section class="bloco texto"><p>${esc(b.itens[0])}</p></section>`;
      else if (b.audio) { temPlayer = true; if (b.rate) rate = b.rate; html += `<section class="bloco grande" style="text-align:left"><h2>Listening</h2><div style="font-size:26px;font-weight:700">${esc(b.titulo)}</div>${player(b.corpo)}</section>`; }
      else html += `<section class="bloco">${b.titulo2 ? `<div style="font-size:24px;font-weight:700">${esc(b.titulo)}</div><h2>${esc(b.titulo2)}</h2>` : b.titulo ? `<h2>${esc(b.titulo)}</h2>` : ""}${ol(b.itens, b.inicio || 1)}</section>`;
    });
    html += `</div>`;
    raiz.innerHTML = html;
    if (temPlayer) ligarPlayer(); else { TTS.parar(); textoAtual = null; }
  };
  canal.postMessage({ tipo: "pedir" });
}

const q = new URLSearchParams(location.search);
if (q.get("t")) modoOuvir(q.get("t"), Number(q.get("v")) || 1); else modoEspelho();
