// Modo aula (roteiro guiado com cronômetro) e pós-aula (registro + homework automático).
import { S, ACOES, CAMPOS, TELA, esc, toast, erro, navegar, config, tagNivel, copiar, linkWhats, ICONES } from "./ctx.js";
import {
  fmtData, fmtDataLonga, diaSemana, DIAS_CURTO, DIFS, DIF_LABEL, hojeISO, aulasDadasDoAluno, sugerirPlano, sugerirTexto,
  gerarHomework, homeworkComoTexto, aulasNoPeriodo, addDays, jaPassou
} from "./regras.js";
import * as TTS from "./tts.js";
import { inserirNoTopo } from "./drive.js";
import { modalFalta, linksDocs, contarDificuldades, modalMensagem } from "./app.js";

// ---------- utilidades ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function hash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function opcoesTopicos(sel) {
  return Object.keys(S.banco.porNivel).map(n => `<optgroup label="${n}">${S.banco.porNivel[n].map(t => `<option value="${esc(t.id)}" ${t.id === sel ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</optgroup>`).join("");
}
function anteriores(aula) {
  return aulasDadasDoAluno(S.store.aulas, aula.alunoId).filter(a => a.id !== aula.id && (a.data + (a.hora || "")) <= (aula.data + (aula.hora || "")));
}

// ===================== MODO AULA =====================
let A = null; // estado da tela de aula

export function renderAula(v, id) {
  const aula = S.store.aula(id);
  if (!aula) { v.innerHTML = `<div class="carregando">Aula não encontrada. <a href="#/semana">Voltar</a></div>`; return; }
  const al = S.store.aluno(aula.alunoId);
  const etapas = config().etapas;
  const kTimer = `ca2_timer_${aula.id}`;
  const timer = LS.get(kTimer, null) || { etapa: 0, seg: etapas.map(() => 0), rodando: false, ultimo: 0 };
  if (timer.seg.length !== etapas.length) timer.seg = etapas.map((_, i) => timer.seg[i] || 0);
  A = { aula, al, etapas, kTimer, timer, resp: false, mostrarTexto: false, aqIdx: 0, maisEx: false, tts: { tocando: false, progresso: 0 }, rate: al.nivel === "A1" ? 0.85 : 1, vozes: [] };

  // Plano automático (salvo na aula na primeira entrada).
  if (!aula.topicoId) {
    const p = sugerirPlano(S.banco, al, S.store.aulas, aula.id);
    aula.topicoId = p.topicoId; aula.nivelMaterial = p.dif; aula.motivoPlano = p.motivo;
  }
  if (!aula.textoId) {
    const usados = new Set(S.store.aulas.filter(a => a.alunoId === al.id && a.id !== aula.id && a.textoId).map(a => a.textoId));
    const t = S.banco.topicos[aula.topicoId];
    const tx = sugerirTexto(S.banco, t ? t.nivel : (al.nivel || "A2"), aula.topicoId, aula.nivelMaterial, usados);
    aula.textoId = tx ? tx.id : null;
  }
  S.store.salvarAula(aula).catch(erro);
  A.aqIdx = hash(aula.id) % 7;

  desenharAula(v);
  const tick = setInterval(() => atualizarRelogio(), 1000);
  TTS.aoCarregarVozes(() => { A && (A.vozes = TTS.vozesIngles()); });
  TELA.limpar = () => {
    clearInterval(tick); salvarTimer(); TTS.parar();
    const atual = S.store.aula(A.aula.id);
    if (atual && (A.aula.notaRapida || "") !== (atual.notaRapida || "")) S.store.salvarAula({ ...atual, notaRapida: A.aula.notaRapida }).catch(erro);
    A = null;
  };
}

function salvarTimer() {
  if (!A) return;
  const t = A.timer;
  if (t.rodando) { const agora = Date.now(); t.seg[t.etapa] += (agora - t.ultimo) / 1000; t.ultimo = agora; }
  LS.set(A.kTimer, t);
}
function atualizarRelogio() {
  if (!A) return;
  salvarTimer();
  const t = A.timer, e = A.etapas[t.etapa];
  const total = t.seg.reduce((s, x) => s + x, 0), meta = A.etapas.reduce((s, x) => s + Number(x.min), 0) * 60;
  const el1 = document.getElementById("cr-etapa"), el2 = document.getElementById("cr-total");
  if (el1) { el1.textContent = mmss(t.seg[t.etapa]); el1.classList.toggle("txt-alerta", t.seg[t.etapa] > e.min * 60); }
  if (el2) el2.textContent = `${mmss(total)} / ${mmss(meta)}`;
  A.etapas.forEach((et, i) => {
    const b = document.getElementById(`et-bar-${i}`), l = document.getElementById(`et-t-${i}`);
    const pct = Math.min(100, (t.seg[i] / (et.min * 60)) * 100);
    if (b) b.style.width = pct + "%";
    if (l) l.textContent = t.seg[i] >= 1 ? `${Math.round(t.seg[i] / 60)}'` : `${et.min}'`;
  });
}

function desenharAula(v = document.getElementById("view")) {
  const { aula, al, etapas, timer } = A;
  const e = etapas[timer.etapa];
  const meta = etapas.reduce((s, x) => s + Number(x.min), 0) * 60;
  const total = timer.seg.reduce((s, x) => s + x, 0);
  const quando = `${DIAS_CURTO[diaSemana(aula.data)]} ${fmtData(aula.data)} · ${esc(aula.hora || "")}`;
  v.innerHTML = `
    <div class="barra">
      <a class="btn" href="#/semana">${ICONES.voltar} Semana</a>
      <div class="linha"><b style="font-size:18px">${esc(al.nome)}</b>${tagNivel(al.nivel)}<span class="sub">${quando}${aula.tipo === "reposicao" ? " · reposição" : ""}</span></div>
      <div class="linha">${al.docAlunoUrl ? `<a class="btn btn-sm" href="${esc(al.docAlunoUrl)}" target="_blank" rel="noopener">Doc do aluno ${ICONES.externo}</a>` : ""}${al.docHomeworkUrl ? `<a class="btn btn-sm" href="${esc(al.docHomeworkUrl)}" target="_blank" rel="noopener">Doc homework ${ICONES.externo}</a>` : ""}</div>
      <span class="flex1"></span>
      <div class="cron"><span class="mini">Etapa</span><span class="grande" id="cr-etapa">${mmss(timer.seg[timer.etapa])}</span><span class="peq">/ ${mmss(e.min * 60)}</span>
        <span style="width:1px;height:20px;background:var(--borda);margin:0 8px;align-self:center"></span><span class="mini">Aula</span><span class="peq" id="cr-total" style="color:var(--texto-2)">${mmss(total)} / ${mmss(meta)}</span></div>
      <div class="linha">
        <button class="btn btn-perigo" data-a="aula-faltou">Aluno faltou</button>
        <button class="btn" data-a="aula-play">${timer.rodando ? `${ICONES.pausa} Pausar` : `${ICONES.play} ${total > 0 ? "Continuar" : "Iniciar"}`}</button>
        <button class="btn" data-a="aula-prox">${timer.etapa === etapas.length - 1 ? "Ir para o pós-aula" : "Próxima etapa"} ${ICONES.prox}</button>
      </div>
    </div>
    <ol class="etapas" style="--netapas:${etapas.length}">
      ${etapas.map((et, i) => `<li><button class="etapa ${i === timer.etapa ? "atual" : ""} ${i < timer.etapa ? "feita" : ""}" data-a="aula-etapa" data-e="${i}">
        <span class="e1"><b>${i + 1} · ${esc(et.nome)}</b><span id="et-t-${i}">${timer.seg[i] >= 1 ? Math.round(timer.seg[i] / 60) : et.min}'</span></span>
        <span class="barra-p"><i id="et-bar-${i}" style="width:${Math.min(100, timer.seg[i] / (et.min * 60) * 100)}%"></i></span></button></li>`).join("")}
    </ol>
    <div class="cols">
      <div class="col-main">${conteudoEtapa(e.id)}${proximaEtapaCard()}</div>
      <aside class="col-side">${ladoAula()}</aside>
    </div>`;
  if (e.id === "listening") atualizarPlayer();
}

function proximaEtapaCard() {
  const i = A.timer.etapa + 1;
  if (i >= A.etapas.length) return "";
  const e = A.etapas[i];
  const t = S.banco.topicos[A.aula.topicoId];
  const tx = A.aula.textoId ? S.banco.textosPorId[A.aula.textoId] : null;
  const desc = { aquecimento: "Pergunta de abertura", homework: "Correção do homework", pratica: t ? `${t.nome} · ${DIF_LABEL[A.aula.nivelMaterial]}` : "", listening: tx ? `“${tx.titulo}” · ${tx.nivel} ${DIF_LABEL[tx.dif]}` : "", fala: "Aplicação oral do tópico", fechamento: "Devolutiva e combinado" }[e.id] || "";
  return `<section class="card"><span class="rotulo">Em seguida · ${esc(e.nome)} · ${e.min}'</span><span>${esc(desc)}</span></section>`;
}

function conteudoEtapa(id) {
  const { aula, al } = A;
  const t = S.banco.topicos[aula.topicoId];
  const nivel = t ? t.nivel : (al.nivel || "A2");
  if (id === "aquecimento") {
    const lista = S.banco.aquecimento[nivel] || S.banco.aquecimento.A2;
    const ant = anteriores(aula)[0];
    return `<section class="card destaque"><span class="rotulo acento">Aquecimento</span>
      <div style="font-size:22px;font-weight:600;line-height:1.35">${esc(lista[A.aqIdx % lista.length])}</div>
      <div><button class="btn btn-sm" data-a="aq-outra">Outra pergunta</button></div></section>
      <section class="card"><span class="rotulo">Retome o combinado da última aula</span>
      ${ant ? `<span class="sub">${fmtDataLonga(ant.data)}${ant.topicoId && S.banco.topicos[ant.topicoId] ? " · " + esc(S.banco.topicos[ant.topicoId].nome) : ""}</span>
        ${ant.observacao ? `<div>${esc(ant.observacao)}</div>` : `<span class="sub">Sem observação registrada.</span>`}
        ${(ant.dificuldades || []).length ? `<div class="chips">${ant.dificuldades.map(d => `<span class="tag">${esc(d)}</span>`).join("")}</div>` : ""}` : `<span class="sub">Primeira aula registrada com este aluno.</span>`}</section>`;
  }
  if (id === "homework") {
    const ant = anteriores(aula).find(a => a.homework);
    if (!ant) return `<section class="card"><span class="rotulo">Homework</span><span class="sub">Nenhum homework enviado na aula anterior. Use o tempo para estender o aquecimento ou revisar as dificuldades da última aula.</span></section>`;
    const hw = ant.homework;
    const r = A.resp;
    const li = (txt, resp) => `<li>${esc(txt)}${r && resp ? `<span class="resp">${esc(resp)}</span>` : ""}</li>`;
    return `<section class="card"><div class="linha"><div class="pilha flex1" style="gap:2px"><span class="rotulo">Correção do homework</span>
        <b style="font-size:18px">${esc(hw.topicoNome)}</b><span class="sub">Enviado em ${fmtDataLonga(ant.data)} · ${DIF_LABEL[hw.dif] || ""}</span></div>
        <button class="btn" data-a="aula-resp" aria-pressed="${r}">${r ? "Esconder gabarito" : "Mostrar gabarito"}</button>
        ${al.docHomeworkUrl ? `<a class="btn" href="${esc(al.docHomeworkUrl)}" target="_blank" rel="noopener">Abrir doc ${ICONES.externo}</a>` : ""}</div>
      ${hw.completar?.length ? `<span class="rotulo">Complete</span><ol class="lista-num">${hw.completar.map(c => li(c[0], c[1])).join("")}</ol>` : ""}
      ${hw.reescrever?.length ? `<span class="rotulo">Reescreva</span><ol class="lista-num">${hw.reescrever.map(c => li(`${c[0]} (${c[1]})`, c[2])).join("")}</ol>` : ""}
      ${hw.traducao?.length ? `<span class="rotulo">Tradução</span><ol class="lista-num">${hw.traducao.map(c => li(c[0], c[1])).join("")}</ol>` : ""}
      ${hw.escrita ? `<span class="rotulo">Escrita</span><div>${esc(hw.escrita)}</div><span class="mini">Peça para o aluno ler o texto em voz alta e corrija 2 ou 3 pontos.</span>` : ""}
      ${hw.texto ? `<span class="rotulo">Texto: ${esc(hw.texto.titulo)}</span><ol class="lista-num">${hw.texto.perguntas.map(p => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    </section>`;
  }
  if (id === "pratica") {
    if (!t) return `<section class="card">Selecione um tópico.</section>`;
    const d = aula.nivelMaterial || "medio", x = t[d], r = A.resp;
    return `<section class="card">
      <div class="linha">
        <div class="pilha flex1" style="gap:4px;min-width:240px"><span class="rotulo acento">Prática</span>
          <label for="sel-top" hidden>Tópico</label><select id="sel-top" data-i="aula-topico" style="max-width:420px">${opcoesTopicos(t.id)}</select>
          ${aula.motivoPlano ? `<span class="mini">${esc(aula.motivoPlano)}</span>` : ""}</div>
        <div class="seg" role="group" aria-label="Dificuldade">${DIFS.map(k => `<button data-a="aula-dif" data-d="${k}" aria-pressed="${k === d}">${DIF_LABEL[k]}</button>`).join("")}</div>
        <button class="btn" data-a="aula-resp" aria-pressed="${r}">${r ? "Esconder respostas" : "Mostrar respostas"}</button>
      </div>
      <span class="sub">Faça as perguntas em ordem. Corrija na hora, curto, focando no erro de gramática.</span>
      <h2 class="rotulo">Perguntas para fazer</h2>
      <ol class="lista-num">${x.p.map(p => `<li>${esc(p)}</li>`).join("")}</ol>
      <div class="sep"></div>
      <h2 class="rotulo">Tradução oral PT → EN</h2>
      <ol class="lista-num" start="${x.p.length + 1}">${x.t.map(p => `<li>${esc(p[0])}${r ? `<span class="resp">${esc(p[1])}</span>` : ""}</li>`).join("")}</ol>
      <div><button class="btn btn-sm" data-a="aula-mais">${A.maisEx ? "Esconder exercícios extras" : "Mais exercícios (completar e reescrever)"}</button></div>
      ${A.maisEx ? `<span class="mini">Estes costumam ir para o homework. Se usar aqui, o homework sorteia outros.</span>
        <h2 class="rotulo">Complete</h2><ol class="lista-num">${x.c.map(p => `<li>${esc(p[0])}${r ? `<span class="resp">${esc(p[1])}</span>` : ""}</li>`).join("")}</ol>
        <h2 class="rotulo">Reescreva</h2><ol class="lista-num">${x.r.map(p => `<li>${esc(p[0])} <span class="mini">(${esc(p[1])})</span>${r ? `<span class="resp">${esc(p[2])}</span>` : ""}</li>`).join("")}</ol>` : ""}
    </section>`;
  }
  if (id === "listening") {
    const tx = aula.textoId ? S.banco.textosPorId[aula.textoId] : null;
    const doNivel = S.banco.textos.filter(x => x.nivel === nivel);
    if (!TTS.suportado()) return `<section class="card">Este navegador não tem leitura em voz alta. Leia o texto você mesmo para o aluno.</section>`;
    if (!tx) return `<section class="card">Nenhum texto disponível para ${nivel}.</section>`;
    const dica = nivel === "A1" || nivel === "A2"
      ? "Níveis iniciais: ouça uma vez em 0.85×, pergunte o que ele entendeu, depois ouça de novo com o texto aberto."
      : "Níveis mais altos: ouça duas vezes sem o texto e faça as perguntas de interpretação antes de mostrar o texto.";
    return `<section class="card">
      <div class="linha"><div class="pilha flex1" style="gap:2px"><span class="rotulo acento">Listening · texto com áudio</span>
        <b style="font-size:20px">${esc(tx.titulo)}</b><span class="mini">${tx.nivel} · ${DIF_LABEL[tx.dif]}</span></div>
        <label for="sel-tx" hidden>Texto</label><select id="sel-tx" data-i="aula-texto" style="max-width:320px">${doNivel.map(x => `<option value="${esc(x.id)}" ${x.id === tx.id ? "selected" : ""}>${esc(x.titulo)} (${DIF_LABEL[x.dif]})</option>`).join("")}</select></div>
      <span class="sub">${dica}</span>
      <div class="card destaque" style="gap:14px">
        <div class="player"><button class="play" data-a="tts-play" id="tts-btn" aria-label="Tocar">${ICONES.play}</button>
          <div class="flex1 pilha" style="gap:6px"><div class="progresso"><i id="tts-prog" style="width:0%"></i></div><span class="mini" id="tts-info">Pronto para tocar</span></div></div>
        <div class="linha">
          <button class="btn btn-sm" data-a="tts-voltar">↺ Frase anterior</button>
          <div class="seg" role="group" aria-label="Velocidade">${[0.75, 0.85, 1, 1.15].map(r => `<button class="btn-sm" data-a="tts-rate" data-r="${r}" aria-pressed="${A.rate === r}">${r}×</button>`).join("")}</div>
          <button class="btn btn-sm" data-a="tts-parar">Recomeçar</button>
        </div>
        <span class="mini">Voz em inglês do próprio navegador. A qualidade varia de aparelho para aparelho.</span>
      </div>
      <details ${A.mostrarTexto ? "open" : ""} data-a="tx-toggle"><summary style="cursor:pointer;font-weight:600">Mostrar texto (depois da 1ª escuta)</summary>
        <p class="texto-leitura" style="margin-top:10px">${esc(tx.texto)}</p></details>
      <h2 class="rotulo">Perguntas de interpretação</h2>
      <ol class="lista-num">${tx.perguntas.map(p => `<li>${esc(p)}</li>`).join("")}</ol>
      <h2 class="rotulo acento">Perguntas pessoais</h2>
      <ol class="lista-num" start="${tx.perguntas.length + 1}">${tx.pessoais.map(p => `<li class="txt-acento">${esc(p)}</li>`).join("")}</ol>
    </section>`;
  }
  if (id === "fala") {
    return `<section class="card destaque"><span class="rotulo acento">Fala · aplicação${t ? " · " + esc(t.nome) : ""}</span>
      <span class="sub">Escolha 1 ou 2. Deixe o aluno falar; anote os erros para devolver no fechamento.</span>
      <ol class="lista-num">${(t ? t.fala : []).map(p => `<li>${esc(p)}</li>`).join("")}</ol>
      <div class="sep"></div>
      <span class="rotulo">Desafios extras</span>
      <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">
        <li>Mudança de perspectiva: defenda o lado oposto por 1 minuto.</li>
        <li>Fale por 60 segundos sem parar sobre o tema.</li>
        <li>Faça 3 perguntas para mim sobre o mesmo assunto.</li></ul></section>`;
  }
  // fechamento
  return `<section class="card destaque"><span class="rotulo acento">Fechamento</span>
    <ol class="lista-num"><li>Devolva as 2 ou 3 correções mais importantes da aula.</li><li>Elogie algo específico que o aluno fez bem.</li><li>Combine o foco da próxima aula e avise sobre o homework.</li></ol>
    <div><button class="btn btn-primario btn-lg" data-a="aula-pos">Ir para o pós-aula ${ICONES.prox}</button></div></section>`;
}

function ladoAula() {
  const { aula, al } = A;
  const t = S.banco.topicos[aula.topicoId];
  const ant = anteriores(aula);
  const dif = contarDificuldades(ant.slice(0, 4));
  return `
    <section class="pilha"><h2 class="rotulo alerta">Fique de ouvido</h2>
      ${t ? t.fique.map(f => `<div class="fique">${esc(f)}</div>`).join("") : ""}
      ${dif.length ? dif.slice(0, 3).map(([d, n]) => `<div class="fique" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(d)}</span><span class="txt-muted">${n} das últimas ${Math.min(4, ant.length)}</span></div>`).join("") : ""}
      ${ant[0] && ant[0].observacao ? `<div class="fique"><span class="mini">Nota da aula passada</span><br>${esc(ant[0].observacao)}</div>` : ""}
    </section>
    <section class="pilha"><h2 class="rotulo">Documentos</h2>${linksDocs(al)}</section>
    <section class="pilha"><label class="rotulo" for="nota-rapida">Nota rápida</label>
      <textarea id="nota-rapida" data-i="nota-rapida" placeholder="Algo para lembrar no pós-aula…" style="min-height:110px">${esc(aula.notaRapida || "")}</textarea>
      <span class="mini">Vai junto para a observação do pós-aula.</span></section>`;
}

// ---------- player ----------
function atualizarPlayer(est = TTS.estado()) {
  const btn = document.getElementById("tts-btn"), prog = document.getElementById("tts-prog"), info = document.getElementById("tts-info");
  if (!btn) return;
  btn.innerHTML = est.tocando ? ICONES.pausa : ICONES.play;
  btn.setAttribute("aria-label", est.tocando ? "Pausar" : "Tocar");
  if (prog) prog.style.width = Math.round((est.total ? est.idx / est.total : 0) * 100) + "%";
  if (info) info.textContent = est.total ? `Frase ${Math.min(est.idx + 1, est.total)} de ${est.total}${est.tocando ? "" : (est.idx >= est.total ? " · fim" : " · pausado")}` : "Pronto para tocar";
}
function prepararTTS() {
  const tx = S.banco.textosPorId[A.aula.textoId];
  if (!tx) return false;
  if (A.ttsTexto !== tx.id) {
    TTS.carregar(tx.texto, atualizarPlayer);
    TTS.definirVelocidade(A.rate);
    A.ttsTexto = tx.id;
  }
  return true;
}

Object.assign(ACOES, {
  "aula-play": () => {
    const t = A.timer;
    if (t.rodando) { salvarTimer(); t.rodando = false; } else { t.rodando = true; t.ultimo = Date.now(); }
    LS.set(A.kTimer, t); desenharAula();
  },
  "aula-prox": () => {
    salvarTimer();
    if (A.timer.etapa >= A.etapas.length - 1) return ACOES["aula-pos"]();
    A.timer.etapa++; A.resp = false; TTS.parar(); A.ttsTexto = null;
    LS.set(A.kTimer, A.timer); desenharAula(); document.querySelector(".col-main")?.scrollTo(0, 0);
  },
  "aula-etapa": el => { salvarTimer(); A.timer.etapa = Number(el.dataset.e); A.resp = false; TTS.parar(); A.ttsTexto = null; LS.set(A.kTimer, A.timer); desenharAula(); },
  "aula-pos": () => { salvarTimer(); A.timer.rodando = false; LS.set(A.kTimer, A.timer); navegar(`#/pos/${A.aula.id}`); },
  "aula-faltou": () => modalFalta(A.aula.id),
  "aula-resp": () => { A.resp = !A.resp; desenharAula(); },
  "aula-mais": () => { A.maisEx = !A.maisEx; desenharAula(); },
  "aq-outra": () => { A.aqIdx++; desenharAula(); },
  "aula-dif": async el => { A.aula.nivelMaterial = el.dataset.d; A.aula.motivoPlano = ""; await S.store.salvarAula(A.aula); desenharAula(); },
  "tts-play": () => { if (!prepararTTS()) return; const e = TTS.estado(); if (e.tocando) TTS.pausar(); else TTS.tocar(); },
  "tts-parar": () => { TTS.parar(); A.ttsTexto = null; prepararTTS(); },
  "tts-voltar": () => { if (prepararTTS()) TTS.voltarFrase(); },
  "tts-rate": el => { A.rate = Number(el.dataset.r); TTS.definirVelocidade(A.rate); document.querySelectorAll('[data-a="tts-rate"]').forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.r) === A.rate))); },
  "tx-toggle": (el, ev) => { setTimeout(() => { A.mostrarTexto = el.open; }, 0); }
});
// <details> precisa abrir normalmente: o handler acima não deve impedir o clique.
ACOES["tx-toggle"].semPrevent = true;

Object.assign(CAMPOS, {
  "aula-topico": async el => {
    if (!A || el.value === A.aula.topicoId) return;
    A.aula.topicoId = el.value; A.aula.motivoPlano = "";
    const t = S.banco.topicos[el.value];
    const usados = new Set(S.store.aulas.filter(a => a.alunoId === A.al.id && a.id !== A.aula.id && a.textoId).map(a => a.textoId));
    const tx = sugerirTexto(S.banco, t.nivel, t.id, A.aula.nivelMaterial, usados);
    if (tx) A.aula.textoId = tx.id;
    await S.store.salvarAula(A.aula); desenharAula();
  },
  "aula-texto": async el => { if (!A) return; A.aula.textoId = el.value; TTS.parar(); A.ttsTexto = null; await S.store.salvarAula(A.aula); desenharAula(); },
  // Salva só o campo da nota, sobre a versão mais recente da aula (nunca sobrescreve o pós-aula).
  "nota-rapida": (() => { let t; return el => {
    if (!A) return; const id = A.aula.id, valor = el.value; A.aula.notaRapida = valor;
    clearTimeout(t);
    t = setTimeout(() => { const atual = S.store.aula(id); if (atual && atual.notaRapida !== valor) S.store.salvarAula({ ...atual, notaRapida: valor }).catch(erro); }, 500);
  }; })()
});

// ===================== PÓS-AULA =====================
let P = null;

export function renderPos(v, id) {
  const aula = S.store.aula(id);
  if (!aula) { v.innerHTML = `<div class="carregando">Aula não encontrada. <a href="#/semana">Voltar</a></div>`; return; }
  const al = S.store.aluno(aula.alunoId);
  let topicoId = aula.topicoId, dif = aula.nivelMaterial;
  if (!topicoId) { const p = sugerirPlano(S.banco, al, S.store.aulas, aula.id); topicoId = p.topicoId; dif = p.dif; }
  const temHwAnterior = anteriores(aula).some(a => a.homework);
  P = {
    aula, al,
    dificuldades: [...(aula.dificuldades || [])],
    avaliacao: aula.avaliacaoMaterial || "adequado",
    hwFeito: aula.homeworkFeito || (temHwAnterior ? "" : "sem"),
    obs: aula.observacao || aula.notaRapida || "",
    topicoId, dif: dif || "medio",
    hw: aula.homework || null,
    enviarDrive: !!(S.fb && al.docHomeworkId),
    jaRegistrada: aula.status === "dada"
  };
  if (!P.hw) P.hw = gerarHomework(S.banco, P.topicoId, P.dif, P.avaliacao, aula.textoId);
  desenharPos(v);
  TELA.limpar = () => { P = null; };
}

function desenharPos(v = document.getElementById("view")) {
  const { aula, al } = P;
  const cfg = config();
  const extras = P.dificuldades.filter(d => !cfg.dificuldades.includes(d));
  const chips = [...cfg.dificuldades, ...extras].map(d => `<button class="chip" data-a="pos-dif" data-d="${esc(d)}" aria-pressed="${P.dificuldades.includes(d)}">${P.dificuldades.includes(d) ? "✓ " : ""}${esc(d)}</button>`).join("");
  const seg = (nome, opcoes, atual) => `<div class="seg bloco" role="group" aria-label="${esc(nome)}">${opcoes.map(([v, r]) => `<button data-a="pos-seg" data-campo="${esc(nome)}" data-v="${v}" aria-pressed="${atual === v}">${r}</button>`).join("")}</div>`;
  const hw = P.hw;
  const proxima = proximaAulaDoAluno();
  const sug = sugestaoProxima();
  const tSug = sug ? S.banco.topicos[sug.topicoId] : null;
  const destinoHw = al.docHomeworkId && S.fb ? `Ao salvar, entra no topo do documento <b>“Homework — ${esc(al.nome)}”</b> no Drive, com a data da aula. O gabarito fica só no app, para a correção na próxima aula.`
    : al.docHomeworkUrl ? `O doc de homework deste aluno foi colado à mão, então o app não consegue escrever nele. Use “Copiar homework” e cole no documento.`
    : `Este aluno ainda não tem documento de homework. ${S.fb ? `Crie no <a href="#/aluno/${esc(al.id)}">cadastro</a> (botão “Criar no Drive”).` : `Use “Copiar homework” e cole no documento do aluno.`}`;
  v.innerHTML = `
    <div class="barra">
      <a class="btn" href="#/aula/${esc(aula.id)}">${ICONES.voltar} Voltar à aula</a>
      <div class="linha"><b style="font-size:18px">Pós-aula · ${esc(al.nome)}</b>${tagNivel(al.nivel)}<span class="sub">${DIAS_CURTO[diaSemana(aula.data)]} ${fmtDataLonga(aula.data)} · ${esc(aula.hora || "")}</span></div>
      <span class="flex1"></span>
      <button class="btn" data-a="pos-whats">Resumo para WhatsApp</button>
      <button class="btn" data-a="pos-salvar" id="btn-salvar-pos">${P.enviarDrive ? "Salvar e enviar homework" : "Salvar registro"}</button>
    </div>
    <div class="rolavel"><div class="grid-2">
      <div class="pilha-16">
        <section class="card"><h2 class="card-titulo">Dificuldades observadas</h2>
          <span class="mini">Toque no que apareceu hoje. Isso alimenta o “Fique de ouvido” e o tema das próximas aulas.</span>
          <div class="chips">${chips}<button class="chip" data-a="pos-outra" style="border-style:dashed">${ICONES.mais} Outra</button></div></section>
        <section class="card">
          <div class="pilha"><h2 class="rotulo">O material de hoje estava…</h2>${seg("avaliacao", [["facil_demais", "Fácil demais"], ["adequado", "Adequado"], ["dificil_demais", "Difícil demais"]], P.avaliacao)}</div>
          <div class="pilha"><h2 class="rotulo">Fez o homework da aula anterior?</h2>${seg("hwFeito", [["sim", "Sim"], ["parcial", "Parcial"], ["nao", "Não"], ["sem", "Não tinha"]], P.hwFeito)}</div>
          <div class="campo"><label for="pos-obs">Observação (opcional)</label><textarea id="pos-obs" data-i="pos-obs">${esc(P.obs)}</textarea></div>
        </section>
        <section class="card"><h2 class="card-titulo">O que foi trabalhado</h2>
          <div class="campo"><label for="pos-top">Tópico</label><select id="pos-top" data-i="pos-topico">${opcoesTopicos(P.topicoId)}</select></div>
          <div class="pilha"><span class="rotulo">Dificuldade usada</span>${seg("dif", DIFS.map(d => [d, DIF_LABEL[d]]), P.dif)}</div>
        </section>
      </div>
      <div class="pilha-16">
        <section class="card destaque">
          <div class="linha"><h2 class="card-titulo flex1">Homework gerado</h2><span class="mini">${hw ? esc(hw.topicoNome) + " · " + DIF_LABEL[hw.dif] : ""}</span></div>
          ${hw ? `<ol class="lista-num" style="font-size:13px;gap:8px">
            <li><b>Complete (${hw.completar.length}):</b> ${esc(hw.completar.map(c => c[0]).slice(0, 2).join(" / "))}…</li>
            <li><b>Reescreva (${hw.reescrever.length}):</b> ${esc(hw.reescrever[0] ? hw.reescrever[0][0] + " (" + hw.reescrever[0][1] + ")" : "")}…</li>
            <li><b>Traduza (${hw.traducao.length}):</b> ${esc(hw.traducao.map(c => c[0]).slice(0, 2).join(" / "))}…</li>
            <li><b>Escrita:</b> ${esc(hw.escrita)}</li>
            ${hw.texto ? `<li><b>Texto:</b> reler “${esc(hw.texto.titulo)}” e responder ${hw.texto.perguntas.length} perguntas</li>` : ""}</ol>` : `<span class="sub">Escolha um tópico.</span>`}
          <div class="linha"><button class="btn btn-sm" data-a="pos-hw" data-o="sortear">Sortear de novo</button><button class="btn btn-sm" data-a="pos-hw" data-o="facil">Mais fácil</button><button class="btn btn-sm" data-a="pos-hw" data-o="dificil">Mais difícil</button><button class="btn btn-sm" data-a="pos-hw" data-o="copiar">Copiar homework</button><button class="btn btn-sm" data-a="pos-hw" data-o="ver">Ver completo</button></div>
          <div class="item" style="font-size:12px">${destinoHw}</div>
          ${S.fb && al.docHomeworkId ? `<label class="check"><input type="checkbox" data-i="pos-drive" ${P.enviarDrive ? "checked" : ""}>Enviar para o documento do aluno ao salvar</label>` : ""}
          ${aula.homeworkEnviadoEm ? `<span class="mini txt-ok">✓ Homework enviado em ${new Date(aula.homeworkEnviadoEm).toLocaleString("pt-BR")}</span>` : ""}
        </section>
        <section class="card"><h2 class="rotulo">Próxima aula${proxima ? ` · ${DIAS_CURTO[diaSemana(proxima.data)]} ${fmtData(proxima.data)}, ${esc(proxima.hora || "")}` : ""}</h2>
          <div class="pilha" style="font-size:13px">
            <div><span class="txt-muted">Corrigir:</span> este homework</div>
            <div><span class="txt-muted">Tema sugerido:</span> ${tSug ? `${esc(tSug.nome)} · ${DIF_LABEL[sug.dif]}` : "—"}</div>
            ${sug && sug.motivo ? `<div class="mini">${esc(sug.motivo)}</div>` : ""}
          </div><span class="mini">Você pode trocar o tema dentro da aula.</span></section>
      </div>
    </div></div>`;
}

function proximaAulaDoAluno() {
  const hoje = hojeISO();
  return aulasNoPeriodo(S.store.alunos, S.store.aulas, hoje, addDays(hoje, 21))
    .find(a => a.alunoId === P.al.id && a.status === "agendada" && a.key !== P.aula.id && !jaPassou(a)) || null;
}
function sugestaoProxima() {
  const simulada = { ...P.aula, status: "dada", topicoId: P.topicoId, nivelMaterial: P.dif, avaliacaoMaterial: P.avaliacao };
  const aulas = S.store.aulas.map(a => a.id === simulada.id ? simulada : a);
  return sugerirPlano(S.banco, P.al, aulas, "__nenhuma__");
}

function regenerar(dif) {
  P.hw = gerarHomework(S.banco, P.topicoId, dif || P.dif, P.avaliacao, P.aula.textoId);
}

Object.assign(ACOES, {
  "pos-dif": el => { const d = el.dataset.d; P.dificuldades = P.dificuldades.includes(d) ? P.dificuldades.filter(x => x !== d) : [...P.dificuldades, d]; desenharPos(); },
  "pos-outra": () => { const d = (prompt("Qual dificuldade?") || "").trim(); if (d && !P.dificuldades.includes(d)) { P.dificuldades.push(d); desenharPos(); } },
  "pos-seg": el => {
    const c = el.dataset.campo, val = el.dataset.v;
    if (c === "avaliacao") { P.avaliacao = val; regenerar(); }
    if (c === "hwFeito") P.hwFeito = val;
    if (c === "dif") { P.dif = val; regenerar(); }
    desenharPos();
  },
  "pos-hw": async el => {
    const o = el.dataset.o;
    const idx = DIFS.indexOf(P.hw ? P.hw.dif : P.dif);
    if (o === "sortear") regenerar(P.hw ? P.hw.dif : P.dif);
    if (o === "facil") regenerar(DIFS[Math.max(0, idx - 1)]);
    if (o === "dificil") regenerar(DIFS[Math.min(2, idx + 1)]);
    if (o === "copiar") return copiar(homeworkComoTexto(P.hw, P.al, P.aula.data));
    if (o === "ver") {
      const txt = homeworkComoTexto(P.hw, P.al, P.aula.data, true);
      return modalMensagem(P.al, txt, "Homework completo (com gabarito)");
    }
    desenharPos();
  },
  "pos-whats": () => {
    const t = S.banco.topicos[P.topicoId];
    const nome = P.al.nome.split(" ")[0];
    const linhas = [`Oi, ${nome}! Resumo da aula de hoje:`, ``, `Tema: ${t ? t.nome : "—"}`];
    if (P.dificuldades.length) linhas.push(`Para treinar: ${P.dificuldades.join(", ").toLowerCase()}.`);
    if (P.obs.trim()) linhas.push(P.obs.trim());
    linhas.push(``, P.al.docHomeworkUrl ? `O homework já está no seu documento: ${P.al.docHomeworkUrl}` : `Vou te mandar o homework em seguida.`, ``, `Até a próxima aula!`);
    modalMensagem(P.al, linhas.join("\n"), "Resumo para o aluno");
  },
  "pos-salvar": async el => {
    const { al } = P;
    const aula = { ...S.store.aula(P.aula.id) };
    Object.assign(aula, {
      status: "dada", dificuldades: P.dificuldades, avaliacaoMaterial: P.avaliacao, homeworkFeito: P.hwFeito || null,
      observacao: P.obs.trim(), topicoId: P.topicoId, nivelMaterial: P.dif, homework: P.hw
    });
    ["faltaTipo", "abonada"].forEach(k => delete aula[k]);
    el.disabled = true;
    try {
      await S.store.salvarAula(aula);
      LS.del(`ca2_timer_${aula.id}`);
      if (P.enviarDrive && S.fb && al.docHomeworkId && P.hw) {
        el.textContent = "Enviando para o Drive…";
        try {
          const token = await S.fb.tokenGoogle();
          await inserirNoTopo(token, al.docHomeworkId, homeworkComoTexto(P.hw, al, aula.data) + "\n────────────────────────\n\n");
          aula.homeworkEnviadoEm = new Date().toISOString();
          await S.store.salvarAula(aula);
          toast("Aula registrada e homework enviado para o Drive.");
        } catch (e) {
          erro(new Error("A aula foi salva, mas o envio para o Drive falhou: " + e.message + ". Use “Copiar homework”."));
          el.disabled = false; el.textContent = "Salvar e enviar homework";
          P.aula = aula; return;
        }
      } else toast("Aula registrada.");
      navegar("#/semana");
    } catch (e) { el.disabled = false; erro(e); }
  }
});

Object.assign(CAMPOS, {
  "pos-obs": el => { if (P) P.obs = el.value; },
  "pos-topico": el => { if (!P || el.value === P.topicoId) return; P.topicoId = el.value; regenerar(); desenharPos(); },
  "pos-drive": el => { if (!P) return; P.enviarDrive = el.checked; const b = document.getElementById("btn-salvar-pos"); if (b) b.textContent = P.enviarDrive ? "Salvar e enviar homework" : "Salvar registro"; }
});
