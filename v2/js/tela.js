// Tela do aluno. Três modos:
//  ?s=ID  → link ao vivo no aparelho do aluno (Firestore, sem conta): acompanha a aula e envia respostas;
//  ?t=ID  → listening avulso (só o áudio de um texto);
//  (nada) → janela no computador do professor, para compartilhar a tela (BroadcastChannel).
import * as TTS from "./tts.js";
import { carregarBanco } from "./banco.js";
import { FIREBASE_CONFIG } from "../config.js";

const raiz = document.getElementById("tela");
const esc = v => (v ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PLAY = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>`;
const PAUSA = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>`;
try { if (localStorage.getItem("ca2_tema") === "claro") document.documentElement.dataset.tema = "claro"; } catch {}

let rate = 1, rateAplicada = null, textoAtual = null;

// ---------- player ----------
function player(corpo) {
  if (!TTS.suportado()) return `<p class="sub">This browser can't play the audio. Try Chrome or Edge, or ask your teacher.</p>`;
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
  document.getElementById("p-restart")?.addEventListener("click", () => TTS.parar());
  document.querySelectorAll("[data-rate]").forEach(b => b.addEventListener("click", () => {
    rate = Number(b.dataset.rate); rateAplicada = rate; TTS.definirVelocidade(rate);
    document.querySelectorAll("[data-rate]").forEach(x => x.setAttribute("aria-pressed", String(Number(x.dataset.rate) === rate)));
  }));
  atualizarPlayer();
}
const ol = (itens, inicio = 1) => `<ol start="${inicio}">${itens.map(i => `<li>${esc(i)}</li>`).join("")}</ol>`;

// ---------- correção ----------
function normalizar(s) { return (s || "").toLowerCase().replace(/[’']/g, "'").replace(/\([^)]*\)/g, "").replace(/[.,!?;:"]/g, "").replace(/\s+/g, " ").trim(); }
// Com 2+ lacunas, "are / doing" é a sequência das lacunas; com 1 lacuna, "/" separa alternativas.
function confere(resposta, gabarito, enunciado = "") {
  const r = normalizar((resposta || "").replace(/\s*[/,]\s*/g, " "));
  if (!r) return false;
  const lacunas = (enunciado.match(/_{2,}/g) || []).length;
  const opcoes = lacunas >= 2 ? [gabarito.split("/").map(x => x.trim()).join(" ")] : gabarito.split("/");
  const exp = x => x.replace(/'s\b/g, " is").replace(/n't\b/g, " not").replace(/'m\b/g, " am").replace(/'re\b/g, " are");
  return opcoes.map(normalizar).some(g => g && (g === r || exp(g) === exp(r)));
}

// ---------- tela da aula (modos espelho e ao vivo) ----------
const rascunho = {};   // exercicioId -> [valores]
const enviados = {};   // exercicioId -> true
let estadoAtual = null, transporte = null, relogio = null;

function desenharEstado(d) {
  estadoAtual = d;
  const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.campo : null;
  const sel = foco && document.activeElement.selectionStart;
  let html = `<header class="tela-cab"><span class="marca-sup">Gutierrez Ferreira · English class</span><span class="tela-etapa">${esc(d.etapa)}</span><span class="flex1"></span><span class="sub">${esc(d.aluno || "")}</span></header>`;
  let temPlayer = false;

  // Um exercício por vez: enquanto houver um aberto, ele ocupa a tela sozinho.
  if (d.exercicio) {
    html += `<div class="palco"><div class="principal">${blocoExercicio(d.exercicio, d.modo)}</div></div>`;
  } else {
    let principal = "", lado = "";
    if (d.homework) {
      const h = d.homework;
      principal += `<div class="hw"><section class="bloco"><h2>Structure we practiced</h2><div class="hw-titulo">${esc(h.titulo)}</div>
        ${h.forma ? `<p style="margin:0;font-size:15px;line-height:1.5">${esc(h.forma)}</p>` : ""}${h.exemplo ? `<p class="txt-acento" style="margin:0;font-size:15px">e.g. ${esc(h.exemplo)}</p>` : ""}</section>
        <section class="bloco"><h2>Your homework</h2>${h.texto ? `<p style="margin:0;font-size:16px;line-height:1.7;white-space:pre-line">${esc(h.texto)}</p>` : `<p class="sub" style="margin:0">Your teacher will paste your homework here.</p>`}</section></div>`;
    }
    d.blocos.forEach(b => {
      if (b.grande) principal += `<section class="bloco grande">${b.titulo ? `<h2>${esc(b.titulo)}</h2>` : ""}${b.itens.map(i => `<p>${esc(i)}</p>`).join("")}</section>`;
      else if (b.texto) principal += `<section class="bloco texto"><p>${esc(b.itens[0])}</p></section>`;
      else if (b.audio) { temPlayer = true; if (b.rate) rate = b.rate; principal += `<section class="bloco grande" style="text-align:left"><h2>Listening</h2><div style="font-size:20px;font-weight:700">${esc(b.titulo)}</div>${player(b.corpo)}</section>`; }
      else principal += `<section class="bloco">${b.titulo2 ? `<div style="font-size:18px;font-weight:700">${esc(b.titulo)}</div><h2>${esc(b.titulo2)}</h2>` : b.titulo ? `<h2>${esc(b.titulo)}</h2>` : ""}${ol(b.itens, b.inicio || 1)}</section>`;
    });
    if (d.dicas) {
      lado += `<section class="bloco dicas"><h2>Algumas dicas abaixo</h2>
        ${d.dicas.mostrar ? `${d.dicas.forma ? `<p><b>${esc(d.dicas.forma)}</b></p>` : ""}${d.dicas.exemplo ? `<p class="txt-acento">e.g. ${esc(d.dicas.exemplo)}</p>` : ""}${d.dicas.itens && d.dicas.itens.length ? `<ul>${d.dicas.itens.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}`
          : `<p class="sub">Se precisar de ajuda, peça para o professor liberar algumas dicas.</p>`}</section>`;
    }
    if (d.correcoes && d.correcoes.length) lado += `<section class="bloco"><h2>Today's corrections</h2>${ol(d.correcoes)}</section>`;
    html += `<div class="palco${lado ? " com-lado" : ""}"><div class="principal">${principal}</div>${lado ? `<aside class="lado">${lado}</aside>` : ""}</div>`;
  }
  raiz.innerHTML = html;

  if (temPlayer) ligarPlayer(); else { TTS.parar(); textoAtual = null; }
  ligarExercicio();
  if (foco) { const f = document.querySelector(`[data-campo="${foco}"]`); if (f) { f.focus(); try { f.setSelectionRange(sel, sel); } catch {} } }
}

function blocoExercicio(ex, modo) {
  const r = rascunho[ex.id] || (rascunho[ex.id] = ex.itens.map(() => ""));
  const corr = ex.correcao;
  const escrita = ex.tipo === "escrita";
  let campos;
  if (escrita) {
    campos = `<div class="ex-escrita"><div class="pilha" style="gap:8px"><p class="ex-tema">${esc(ex.itens[0])}</p>
        ${corr && ex.correcao.comentario ? `<div class="item"><b>Teacher's comment</b><br>${esc(ex.correcao.comentario)}</div>` : ""}</div>
      <div class="pilha" style="gap:4px"><label for="ex-0" class="mini">Your text</label>
      <textarea id="ex-0" data-campo="ex-0" data-i="0" ${corr ? "readonly" : ""}>${esc(r[0])}</textarea></div></div>`;
  } else {
    campos = `<ol class="ex-lista">${ex.itens.map((it, i) => {
      let marca = "";
      if (corr) {
        const g = corr.gabarito[i] || "";
        const ok = corr.comparar ? confere(r[i], g, it) : null;
        marca = `<div class="ex-gab ${ok === true ? "txt-ok" : ok === false ? "txt-perigo" : "txt-acento"}">${ok === true ? "✓ " : ok === false ? "✗ " : ""}${esc(g)}</div>`;
      }
      return `<li><label for="ex-${i}" class="ex-enun">${esc(it)}</label>
        <input type="text" id="ex-${i}" data-campo="ex-${i}" data-i="${i}" value="${esc(r[i])}" autocomplete="off" autocapitalize="off" spellcheck="false" ${corr ? "readonly" : ""}>${marca}</li>`;
    }).join("")}</ol>`;
  }
  const podeEnviar = modo !== "espelho-sem-envio" && !corr;
  return `<section class="bloco exercicio">
    <div class="ex-cab"><h2>${esc(ex.titulo)}</h2><span class="sub flex1">${esc(ex.instrucao)}</span>${escrita && ex.minutos ? `<span class="mono" id="ex-relogio"></span>` : ""}</div>
    ${campos}
    ${corr ? `<p class="mini" style="margin:0">Correction released by your teacher.</p>` : podeEnviar ? `<div class="linha"><button class="btn btn-primario" id="ex-enviar">${enviados[ex.id] ? "Send again" : "Send to my teacher"}</button>${enviados[ex.id] ? `<span class="txt-ok">✓ Sent. You can still edit and send again.</span>` : ""}</div>` : ""}
  </section>`;
}

function ligarExercicio() {
  const ex = estadoAtual && estadoAtual.exercicio;
  clearInterval(relogio);
  if (!ex) return;
  document.querySelectorAll("[data-campo^='ex-']").forEach(el => el.addEventListener("input", () => { rascunho[ex.id][Number(el.dataset.i)] = el.value; }));
  const b = document.getElementById("ex-enviar");
  if (b) b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      const itens = rascunho[ex.id].slice();
      await transporte.enviar({ exercicioId: ex.id, itens, texto: ex.tipo === "escrita" ? itens[0] : "" });
      enviados[ex.id] = true; desenharEstado(estadoAtual);
    } catch (e) { b.disabled = false; alert("Could not send. Check your connection and try again."); }
  });
  if (ex.tipo === "escrita" && ex.minutos && ex.inicio) {
    const tick = () => {
      const el = document.getElementById("ex-relogio"); if (!el) return;
      const resta = Math.round((ex.inicio + ex.minutos * 60000 - Date.now()) / 1000);
      el.textContent = resta > 0 ? `${String(Math.floor(resta / 60)).padStart(2, "0")}:${String(resta % 60).padStart(2, "0")}` : "Time's up!";
      el.className = "mono " + (resta <= 60 ? "txt-alerta" : "");
    };
    tick(); relogio = setInterval(tick, 1000);
  }
}

// ---------- modo espelho (janela local) ----------
function modoEspelho() {
  document.title = "Aula — Tela do aluno";
  let canal;
  try { canal = new BroadcastChannel("ca2-tela"); } catch {
    raiz.innerHTML = `<div class="aguardando">Este navegador não permite a tela espelhada. Use o Chrome ou o Edge.</div>`; return;
  }
  transporte = { enviar: async r => canal.postMessage({ tipo: "resposta", ...r, enviadoEm: Date.now() }) };
  raiz.innerHTML = `<div class="aguardando"><p style="font-size:20px">Esperando a aula…</p><p class="mini">Deixe esta janela aberta e compartilhe só ela na chamada. Ela acompanha a etapa da aula automaticamente.</p></div>`;
  canal.onmessage = ev => { const d = ev.data; if (d && d.tipo === "estado") desenharEstado(d); };
  canal.postMessage({ tipo: "pedir" });
}

// ---------- modo ao vivo (aparelho do aluno) ----------
async function modoAoVivo(sid) {
  document.title = "English class — live";
  raiz.innerHTML = `<div class="aguardando"><p style="font-size:20px">Connecting to your class…</p></div>`;
  if (!FIREBASE_CONFIG) { raiz.innerHTML = `<div class="aguardando">This link isn't available yet. Ask your teacher.</div>`; return; }
  let fb;
  try {
    const { iniciarFirebaseAluno } = await import("./firebase.js");
    fb = await iniciarFirebaseAluno(FIREBASE_CONFIG);
  } catch (e) {
    raiz.innerHTML = `<div class="aguardando">Could not connect (${esc(e.code || e.message)}). Check your internet and reload the page.</div>`; return;
  }
  const { doc, setDoc, onSnapshot, db } = fb;
  transporte = { enviar: r => setDoc(doc(db, "sessoes", sid, "respostas", r.exercicioId), { itens: r.itens, texto: r.texto || "", enviadoEm: Date.now() }) };
  const presenca = () => setDoc(doc(db, "sessoes", sid, "respostas", "presenca"), { visto: Date.now() }).catch(() => {});
  presenca(); setInterval(presenca, 60000);
  onSnapshot(doc(db, "sessoes", sid), snap => {
    if (!snap.exists()) { raiz.innerHTML = `<div class="aguardando">This class link has expired. Ask your teacher for a new one.</div>`; return; }
    const d = snap.data();
    if (d.expiraEm && d.expiraEm.toMillis() < Date.now()) { raiz.innerHTML = `<div class="aguardando">This class link has expired. Ask your teacher for a new one.</div>`; return; }
    if (!d.estado) { raiz.innerHTML = `<div class="aguardando"><p style="font-size:20px">Hi${d.aluno ? ", " + esc(d.aluno) : ""}! Your class will start soon.</p><p class="mini">Keep this page open.</p></div>`; return; }
    desenharEstado({ ...d.estado, modo: "aovivo" });
  }, () => { raiz.innerHTML = `<div class="aguardando">Could not open this class. Ask your teacher for a new link.</div>`; });
}

// ---------- modo listening avulso ----------
async function modoOuvir(id, r) {
  rate = r || 1;
  document.title = "Listening — English class";
  let banco;
  try { banco = await carregarBanco("banco/"); } catch { raiz.innerHTML = `<div class="aguardando">Could not load the audio. Check your connection.</div>`; return; }
  const tx = banco.textosPorId[id];
  if (!tx) { raiz.innerHTML = `<div class="aguardando">Audio not found. Ask your teacher for a new link.</div>`; return; }
  raiz.innerHTML = `
    <header class="tela-cab"><span class="marca-sup">Gutierrez Ferreira · Listening</span></header>
    <div class="blocos"><section class="bloco"><h2>${esc(tx.nivel)} · listening</h2><div style="font-size:28px;font-weight:700">${esc(tx.titulo)}</div>
      ${player(tx.texto)}<p class="mini" style="margin:0">Listen carefully. Your teacher will ask you some questions.</p></section></div>`;
  ligarPlayer();
}

const q = new URLSearchParams(location.search);
if (q.get("s")) modoAoVivo(q.get("s"));
else if (q.get("t")) modoOuvir(q.get("t"), Number(q.get("v")) || 1);
else modoEspelho();
