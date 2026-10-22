// Modo aula (roteiro guiado com cronômetro) e pós-aula (registro + homework automático).
import { S, ACOES, CAMPOS, TELA, esc, toast, erro, navegar, config, tagNivel, copiar, ICONES } from "./ctx.js";
import {
  fmtData, fmtDataLonga, diaSemana, DIAS_CURTO, DIFS, DIF_LABEL, hojeISO, aulasDadasDoAluno, sugerirPlano, sugerirTexto,
  gerarHomework, gerarHomeworkConversa, homeworkComoTexto, aulasNoPeriodo, addDays, jaPassou, modeloDaAula, sugerirTema, MODELOS
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
function opcoesTemas(sel) {
  return S.banco.temas.map(t => `<option value="${esc(t.id)}" ${t.id === sel ? "selected" : ""}>${esc(t.tema)} (${t.niveis.join("–")})</option>`).join("");
}
function anteriores(aula) {
  return aulasDadasDoAluno(S.store.aulas, aula.alunoId).filter(a => a.id !== aula.id && (a.data + (a.hora || "")) <= (aula.data + (aula.hora || "")));
}
function etapasDoModelo(modelo) { const c = config(); return modelo === "conversa" ? c.etapasConversa : c.etapas; }
function vizinha(d) { return d === "facil" ? "medio" : d === "medio" ? "dificil" : "medio"; }
const lista = (itens, inicio = 1, cls = "") => `<ol class="lista-num ${cls}" start="${inicio}">${itens.join("")}</ol>`;
const li = (txt, resp, mostrar) => `<li>${esc(txt)}${mostrar && resp ? `<span class="resp">${esc(resp)}</span>` : ""}</li>`;

// Canal com a "Tela do aluno" (janela separada no mesmo navegador).
let canal = null;
try { canal = new BroadcastChannel("ca2-tela"); } catch {}
if (canal) canal.onmessage = ev => { if (ev.data && ev.data.tipo === "pedir" && A) enviarTela(); };

// ===================== MODO AULA =====================
let A = null; // estado da tela de aula

export function renderAula(v, id) {
  const aula = S.store.aula(id);
  if (!aula) { v.innerHTML = `<div class="carregando">Aula não encontrada. <a href="#/semana">Voltar</a></div>`; return; }
  const al = S.store.aluno(aula.alunoId);
  if (!aula.modelo) aula.modelo = modeloDaAula(al, S.store.aulas, aula.id);
  const etapas = etapasDoModelo(aula.modelo);
  const kTimer = `ca2_timer_${aula.id}`;
  const timer = LS.get(kTimer, null) || { etapa: 0, seg: etapas.map(() => 0), rodando: false, ultimo: 0 };
  if (timer.seg.length !== etapas.length) timer.seg = etapas.map((_, i) => timer.seg[i] || 0);
  if (timer.etapa >= etapas.length) timer.etapa = 0;
  A = { aula, al, etapas, kTimer, timer, resp: false, mostrarTexto: false, aqIdx: hash(aula.id) % 7, maisEx: false, rate: al.nivel === "A1" ? 0.85 : 1 };
  prepararPlano();
  S.store.salvarAula(aula).catch(erro);
  desenharAula(v);
  const tick = setInterval(() => atualizarRelogio(), 1000);
  TELA.limpar = () => {
    clearInterval(tick); salvarTimer(); TTS.parar();
    const atual = S.store.aula(A.aula.id);
    if (atual && (A.aula.notaRapida || "") !== (atual.notaRapida || "")) S.store.salvarAula({ ...atual, notaRapida: A.aula.notaRapida }).catch(erro);
    A = null;
  };
}

// Plano automático (tópico/tema e texto), salvo na aula na primeira entrada.
function prepararPlano() {
  const { aula, al } = A;
  if (aula.modelo === "conversa") {
    if (!aula.temaId) aula.temaId = sugerirTema(S.banco, al, S.store.aulas, aula.id);
    return;
  }
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
  const t = A.timer;
  const total = t.seg.reduce((s, x) => s + x, 0);
  const el2 = document.getElementById("cr-total");
  if (el2) el2.textContent = mmss(total);
  A.etapas.forEach((et, i) => {
    const b = document.getElementById(`et-bar-${i}`), l = document.getElementById(`et-t-${i}`), card = document.getElementById(`et-card-${i}`);
    if (b) b.style.width = Math.min(100, (t.seg[i] / (et.min * 60)) * 100) + "%";
    if (l) l.textContent = mmss(t.seg[i]);
    if (card) card.classList.toggle("estourou", t.seg[i] > et.min * 60);
  });
}

function desenharAula(v = document.getElementById("view")) {
  const { aula, al, etapas, timer } = A;
  const e = etapas[timer.etapa];
  const meta = etapas.reduce((s, x) => s + Number(x.min), 0) * 60;
  const total = timer.seg.reduce((s, x) => s + x, 0);
  const quando = `${DIAS_CURTO[diaSemana(aula.data)]} ${fmtData(aula.data)} · ${esc(aula.hora || "")}`;
  const sc = document.querySelector(".col-main")?.scrollTop || 0;
  v.innerHTML = `
    <div class="barra">
      <a class="btn" href="#/semana">${ICONES.voltar} Semana</a>
      <div class="linha"><b style="font-size:18px">${esc(al.nome)}</b>${tagNivel(al.nivel)}<span class="sub">${quando}${aula.tipo === "reposicao" ? " · reposição" : ""}</span></div>
      <div class="seg" role="group" aria-label="Modelo da aula">${Object.entries(MODELOS).map(([k, r]) => `<button class="btn-sm" data-a="aula-modelo" data-m="${k}" aria-pressed="${aula.modelo === k}">${r}</button>`).join("")}</div>
      <span class="flex1"></span>
      <div class="cron"><span class="mini">Aula</span><span class="grande" id="cr-total">${mmss(total)}</span><span class="peq">/ ${mmss(meta)}</span></div>
      <div class="linha">
        <button class="btn" data-a="aula-tela" title="Abre uma janela só com o conteúdo para o aluno, para compartilhar a tela">Tela do aluno ${ICONES.externo}</button>
        <button class="btn btn-perigo" data-a="aula-faltou">Aluno faltou</button>
        <button class="btn" data-a="aula-play">${timer.rodando ? `${ICONES.pausa} Pausar` : `${ICONES.play} ${total > 0 ? "Continuar" : "Iniciar"}`}</button>
        <button class="btn" data-a="aula-prox">${timer.etapa === etapas.length - 1 ? "Ir para o pós-aula" : "Próxima etapa"} ${ICONES.prox}</button>
      </div>
    </div>
    <ol class="etapas" style="--netapas:${etapas.length}">
      ${etapas.map((et, i) => `<li><button class="etapa ${i === timer.etapa ? "atual" : ""} ${i < timer.etapa ? "feita" : ""} ${timer.seg[i] > et.min * 60 ? "estourou" : ""}" id="et-card-${i}" data-a="aula-etapa" data-e="${i}">
        <span class="e1"><b>${i + 1} · ${esc(et.nome)}</b></span>
        <span class="e2"><span class="mono" id="et-t-${i}">${mmss(timer.seg[i])}</span><span class="mono txt-muted">/ ${mmss(et.min * 60)}</span></span>
        <span class="barra-p"><i id="et-bar-${i}" style="width:${Math.min(100, timer.seg[i] / (et.min * 60) * 100)}%"></i></span></button></li>`).join("")}
    </ol>
    <div class="cols">
      <div class="col-main">${conteudoEtapa(e.id)}${proximaEtapaCard()}</div>
      <aside class="col-side lateral">${ladoAula()}</aside>
    </div>`;
  const cm = document.querySelector(".col-main"); if (cm && sc) cm.scrollTop = sc;
  if (e.id === "listening") atualizarPlayer();
  enviarTela();
}

function proximaEtapaCard() {
  const i = A.timer.etapa + 1;
  if (i >= A.etapas.length) return "";
  const e = A.etapas[i];
  const t = S.banco.topicos[A.aula.topicoId];
  const tema = S.banco.temasPorId[A.aula.temaId];
  const tx = A.aula.textoId ? S.banco.textosPorId[A.aula.textoId] : null;
  const desc = {
    aquecimento: "Pergunta de abertura", homework: "Correção do homework",
    pratica: t ? `${t.nome} · ${DIF_LABEL[A.aula.nivelMaterial]}` : "", listening: tx ? `“${tx.titulo}” · ${tx.nivel} ${DIF_LABEL[tx.dif]}` : "",
    fala: "Aplicação oral do tópico", fechamento: "Devolutiva e combinado",
    tema: tema ? tema.tema : "", discussao: "Perguntas de discussão e aprofundamento", debate: "Debate estruturado ou roleplay", devolutiva: "Erros anotados e combinado"
  }[e.id] || "";
  return `<section class="card"><span class="rotulo">Em seguida · ${esc(e.nome)} · ${e.min}'</span><span>${esc(desc)}</span></section>`;
}

// ---------- conteúdo de cada etapa (sempre em duas colunas) ----------
function conteudoEtapa(id) {
  const { aula, al } = A;
  const t = S.banco.topicos[aula.topicoId];
  const tema = S.banco.temasPorId[aula.temaId];
  const nivel = t ? t.nivel : (al.nivel || "A2");
  const r = A.resp;

  if (id === "aquecimento") {
    const perguntas = S.banco.aquecimento[al.nivel] || S.banco.aquecimento[nivel] || S.banco.aquecimento.A2;
    const ant = anteriores(aula)[0];
    return `<div class="grid-2">
      <section class="card destaque"><span class="rotulo acento">Aquecimento</span>
        <div style="font-size:22px;font-weight:600;line-height:1.35">${esc(perguntas[A.aqIdx % perguntas.length])}</div>
        <div><button class="btn btn-sm" data-a="aq-outra">Outra pergunta</button></div></section>
      <section class="card"><span class="rotulo">Retome o combinado da última aula</span>
        ${ant ? `<span class="sub">${fmtDataLonga(ant.data)}${ant.topicoId && S.banco.topicos[ant.topicoId] ? " · " + esc(S.banco.topicos[ant.topicoId].nome) : ""}${ant.temaId && S.banco.temasPorId[ant.temaId] ? " · " + esc(S.banco.temasPorId[ant.temaId].tema) : ""}</span>
          ${ant.observacao ? `<div>${esc(ant.observacao)}</div>` : `<span class="sub">Sem observação registrada.</span>`}
          ${(ant.dificuldades || []).length ? `<div class="chips">${ant.dificuldades.map(d => `<span class="tag">${esc(d)}</span>`).join("")}</div>` : ""}` : `<span class="sub">Primeira aula registrada com este aluno.</span>`}</section>
    </div>`;
  }

  if (id === "homework") {
    const ant = anteriores(aula).find(a => a.homework);
    if (!ant) return `<section class="card"><span class="rotulo">Homework</span><span class="sub">Nenhum homework enviado na aula anterior. Use o tempo para estender o aquecimento ou revisar as dificuldades da última aula.</span></section>`;
    const hw = ant.homework;
    const cab = `<section class="card"><div class="linha"><div class="pilha flex1" style="gap:2px"><span class="rotulo">Correção do homework</span>
        <b style="font-size:18px">${esc(hw.topicoNome)}</b><span class="sub">Enviado em ${fmtDataLonga(ant.data)}${hw.dif ? " · " + DIF_LABEL[hw.dif] : ""}</span></div>
        <button class="btn" data-a="aula-resp" aria-pressed="${r}">${r ? "Esconder gabarito" : "Mostrar gabarito"}</button>
        ${al.docHomeworkUrl ? `<a class="btn" href="${esc(al.docHomeworkUrl)}" target="_blank" rel="noopener">Abrir doc ${ICONES.externo}</a>` : ""}</div></section>`;
    if (hw.tipo === "conversa") {
      return cab + `<div class="grid-2">
        <section class="card"><h2 class="rotulo">Frases com as expressões</h2>${lista(hw.vocab.map(v => li(v[0], v[1], r)))}</section>
        <section class="card"><h2 class="rotulo">Escrita</h2><div>${esc(hw.escrita)}</div><span class="mini">Peça para o aluno ler em voz alta e corrija 2 ou 3 pontos.</span>
          <h2 class="rotulo">Preparação para a conversa</h2>${lista(hw.preparar.map(p => li(p)))}</section></div>`;
    }
    return cab + `<div class="grid-2">
      <section class="card">
        ${hw.completar?.length ? `<h2 class="rotulo">Complete</h2>${lista(hw.completar.map(c => li(c[0], c[1], r)))}` : ""}
        ${hw.reescrever?.length ? `<h2 class="rotulo">Reescreva</h2>${lista(hw.reescrever.map(c => li(`${c[0]} (${c[1]})`, c[2], r)))}` : ""}
      </section>
      <section class="card">
        ${hw.traducao?.length ? `<h2 class="rotulo">Tradução</h2>${lista(hw.traducao.map(c => li(c[0], c[1], r)))}` : ""}
        ${hw.escrita ? `<h2 class="rotulo">Escrita</h2><div>${esc(hw.escrita)}</div><span class="mini">Peça para o aluno ler em voz alta e corrija 2 ou 3 pontos.</span>` : ""}
        ${hw.texto ? `<h2 class="rotulo">Texto: ${esc(hw.texto.titulo)}</h2>${lista(hw.texto.perguntas.map(p => li(p)))}` : ""}
      </section></div>`;
  }

  if (id === "pratica") {
    if (!t) return `<section class="card">Selecione um tópico.</section>`;
    const d = aula.nivelMaterial || "medio", x = t[d], dv = vizinha(d), y = t[dv];
    return `<section class="card">
      <div class="linha">
        <div class="pilha flex1" style="gap:4px;min-width:240px"><span class="rotulo acento">Prática</span>
          <label for="sel-top" hidden>Tópico</label><select id="sel-top" data-i="aula-topico" style="max-width:420px">${opcoesTopicos(t.id)}</select>
          ${aula.motivoPlano ? `<span class="mini">${esc(aula.motivoPlano)}</span>` : ""}</div>
        <div class="seg" role="group" aria-label="Dificuldade">${DIFS.map(k => `<button data-a="aula-dif" data-d="${k}" aria-pressed="${k === d}">${DIF_LABEL[k]}</button>`).join("")}</div>
        <button class="btn" data-a="aula-resp" aria-pressed="${r}">${r ? "Esconder respostas" : "Mostrar respostas"}</button>
      </div>
      <span class="sub">Faça as perguntas em ordem. Corrija na hora, curto, focando no erro de gramática.</span></section>
    <div class="grid-2">
      <section class="card"><h2 class="rotulo">Perguntas para fazer · ${DIF_LABEL[d]}</h2>${lista(x.p.map(p => li(p)))}
        <h2 class="rotulo txt-muted">Se sobrar tempo · ${DIF_LABEL[dv]}</h2>${lista(y.p.map(p => li(p)), x.p.length + 1, "lista-extra")}</section>
      <section class="card"><h2 class="rotulo">Tradução oral PT → EN · ${DIF_LABEL[d]}</h2>${lista(x.t.map(p => li(p[0], p[1], r)))}
        <h2 class="rotulo txt-muted">Se sobrar tempo · ${DIF_LABEL[dv]}</h2>${lista(y.t.map(p => li(p[0], p[1], r)), x.t.length + 1, "lista-extra")}</section>
    </div>
    <div><button class="btn btn-sm" data-a="aula-mais">${A.maisEx ? "Esconder exercícios extras" : "Mais exercícios (completar e reescrever)"}</button>
      ${A.maisEx ? `<span class="mini" style="margin-left:8px">Estes costumam ir para o homework. Se usar aqui, sorteie outro no pós-aula.</span>` : ""}</div>
    ${A.maisEx ? `<div class="grid-2">
      <section class="card"><h2 class="rotulo">Complete</h2>${lista(x.c.map(p => li(p[0], p[1], r)))}</section>
      <section class="card"><h2 class="rotulo">Reescreva</h2>${lista(x.r.map(p => li(`${p[0]} (${p[1]})`, p[2], r)))}</section></div>` : ""}`;
  }

  if (id === "listening") {
    const tx = aula.textoId ? S.banco.textosPorId[aula.textoId] : null;
    const doNivel = S.banco.textos.filter(x => x.nivel === nivel);
    if (!tx) return `<section class="card">Nenhum texto disponível para ${nivel}.</section>`;
    const dica = nivel === "A1" || nivel === "A2"
      ? "Níveis iniciais: ouça uma vez em 0.85×, pergunte o que ele entendeu, depois ouça de novo com o texto aberto."
      : "Níveis mais altos: ouça duas vezes sem o texto e faça as perguntas de interpretação antes de mostrar o texto.";
    return `<div class="grid-2">
      <section class="card">
        <div class="pilha" style="gap:4px"><span class="rotulo acento">Listening · texto com áudio</span>
          <b style="font-size:20px">${esc(tx.titulo)}</b><span class="mini">${tx.nivel} · ${DIF_LABEL[tx.dif]}</span>
          <label for="sel-tx" hidden>Texto</label><select id="sel-tx" data-i="aula-texto">${doNivel.map(x => `<option value="${esc(x.id)}" ${x.id === tx.id ? "selected" : ""}>${esc(x.titulo)} (${DIF_LABEL[x.dif]})</option>`).join("")}</select></div>
        <span class="sub">${dica}</span>
        ${TTS.suportado() ? `<div class="card destaque" style="gap:12px">
          <div class="player"><button class="play" data-a="tts-play" id="tts-btn" aria-label="Tocar">${ICONES.play}</button>
            <div class="flex1 pilha" style="gap:6px"><div class="progresso"><i id="tts-prog" style="width:0%"></i></div><span class="mini" id="tts-info">Pronto para tocar</span></div></div>
          <div class="linha">
            <button class="btn btn-sm" data-a="tts-voltar">↺ Frase anterior</button>
            <div class="seg" role="group" aria-label="Velocidade">${[0.75, 0.85, 1, 1.15].map(v => `<button class="btn-sm" data-a="tts-rate" data-r="${v}" aria-pressed="${A.rate === v}">${v}×</button>`).join("")}</div>
            <button class="btn btn-sm" data-a="tts-parar">Recomeçar</button></div></div>` : `<div class="item">Este navegador não tem leitura em voz alta. Use o link para o aluno ou leia o texto você mesmo.</div>`}
        <div class="card" style="gap:8px;padding:12px 14px"><b style="font-size:13px">Para o aluno ouvir</b>
          <span class="mini">Melhor opção: mande o link, e o áudio toca no aparelho dele, com qualidade, sem depender do compartilhamento de tela. Se for compartilhar a sua tela, use “Tela do aluno” e ative o áudio do sistema no Meet ou no Zoom.</span>
          <div class="linha"><button class="btn btn-sm" data-a="tts-link">Copiar link para o aluno</button><button class="btn btn-sm" data-a="aula-tela">Tela do aluno</button></div></div>
        <div class="linha"><button class="btn btn-sm" data-a="tx-mostrar" aria-pressed="${A.mostrarTexto}">${A.mostrarTexto ? "Esconder texto" : "Mostrar texto (depois da 1ª escuta)"}</button></div>
        ${A.mostrarTexto ? `<p class="texto-leitura" style="margin:0">${esc(tx.texto)}</p>` : ""}
      </section>
      <section class="card"><h2 class="rotulo">Perguntas de interpretação</h2>${lista(tx.perguntas.map(p => li(p)))}
        <h2 class="rotulo acento">Perguntas pessoais</h2>${lista(tx.pessoais.map(p => `<li class="txt-acento">${esc(p)}</li>`), tx.perguntas.length + 1)}</section>
    </div>`;
  }

  if (id === "fala") {
    return `<div class="grid-2">
      <section class="card destaque"><span class="rotulo acento">Fala · aplicação${t ? " · " + esc(t.nome) : ""}</span>
        <span class="sub">Escolha 1 ou 2. Deixe o aluno falar e anote os erros para devolver no fechamento.</span>
        ${lista((t ? t.fala : []).map(p => li(p)))}</section>
      <section class="card"><span class="rotulo">Desafios extras</span>
        ${lista(["Mudança de perspectiva: defenda o lado oposto por 1 minuto.", "Fale por 60 segundos sem parar sobre o tema.", "Faça 3 perguntas para mim sobre o mesmo assunto.", "Conte uma história real usando a estrutura do dia."].map(p => li(p)))}</section></div>`;
  }

  if (id === "fechamento" || id === "devolutiva") {
    const conv = id === "devolutiva";
    return `<div class="grid-2">
      <section class="card destaque"><span class="rotulo acento">${conv ? "Devolutiva" : "Fechamento"}</span>
        ${lista((conv
          ? ["Leia 3 a 5 erros que você anotou e peça para o aluno reformular cada frase.", "Reforce 2 expressões novas que ele usou bem.", "Elogie algo específico da conversa.", "Combine o tema da próxima aula e avise sobre o homework."]
          : ["Devolva as 2 ou 3 correções mais importantes da aula.", "Elogie algo específico que o aluno fez bem.", "Combine o foco da próxima aula e avise sobre o homework."]).map(p => li(p)))}
        <div><button class="btn btn-primario btn-lg" data-a="aula-pos">Ir para o pós-aula ${ICONES.prox}</button></div></section>
      <section class="card"><span class="rotulo">Suas anotações desta aula</span>
        ${aula.notaRapida ? `<div style="white-space:pre-line">${esc(aula.notaRapida)}</div>` : `<span class="sub">Nada anotado na nota rápida.</span>`}</section></div>`;
  }

  // ----- Conversação -----
  if (!tema) return `<section class="card">Selecione um tema.</section>`;
  const avancado = ["B2", "C1", "C2"].includes(al.nivel);
  if (id === "tema") {
    return `<section class="card"><div class="linha"><div class="pilha flex1" style="gap:4px;min-width:240px"><span class="rotulo acento">Tema da conversa</span>
        <label for="sel-tema" hidden>Tema</label><select id="sel-tema" data-i="aula-tema" style="max-width:520px">${opcoesTemas(tema.id)}</select></div>
        <button class="btn" data-a="aula-resp" aria-pressed="${r}">${r ? "Esconder tradução" : "Mostrar tradução"}</button></div>
      <span class="sub">Apresente o vocabulário, peça um exemplo pessoal para cada expressão e abra com as primeiras perguntas.</span></section>
    <div class="grid-2">
      <section class="card"><h2 class="rotulo">Vocabulário útil</h2>${lista(tema.vocab.map(v => `<li><button class="btn-link" data-a="falar" data-txt="${esc(v[0])}" title="Ouvir">${esc(v[0])}</button>${r ? `<span class="resp">${esc(v[1])}</span>` : ""}</li>`))}<span class="mini">Toque numa expressão para ouvir a pronúncia.</span></section>
      <section class="card"><h2 class="rotulo">Perguntas de abertura</h2>${lista(tema.perguntas.slice(0, 4).map(p => li(p)))}</section></div>`;
  }
  if (id === "discussao") {
    return `<div class="grid-2">
      <section class="card"><h2 class="rotulo">Discussão · ${esc(tema.tema)}</h2>${lista(tema.perguntas.slice(4).map(p => li(p)), 5)}</section>
      <section class="card ${avancado ? "destaque" : ""}"><h2 class="rotulo ${avancado ? "acento" : ""}">Aprofundar${avancado ? "" : " (se o aluno estiver confortável)"}</h2>${lista(tema.aprofundar.map(p => li(p)), tema.perguntas.length + 1)}
        <span class="mini">Peça sempre: um motivo, um exemplo e uma consequência.</span></section></div>`;
  }
  if (id === "debate") {
    return `<div class="grid-2">
      <section class="card destaque"><span class="rotulo acento">Debate</span>
        ${tema.debate.map(d => `<div style="font-size:18px;font-weight:600">“${esc(d)}”</div>`).join("")}
        ${lista(["Aluno escolhe um lado: posição em 1 minuto, com 2 motivos e 1 exemplo.", "Você contra-argumenta; ele responde (2 minutos).", "Mudança de perspectiva: ele defende o lado oposto por 1 minuto.", "Conclusão em 30 segundos: “To sum up…”"].map(p => li(p)))}</section>
      <section class="card"><span class="rotulo">Roleplay</span>
        ${tema.roleplay.map(rp => `<div class="pilha" style="gap:4px"><b>${esc(rp.titulo)}</b><span>${esc(rp.situacao)}</span><span class="mini">${esc(rp.papeis)}</span></div>`).join('<div class="sep"></div>')}</section></div>`;
  }
  return `<section class="card">Etapa sem conteúdo.</section>`;
}

function ladoAula() {
  const { aula, al } = A;
  const t = aula.modelo === "conversa" ? null : S.banco.topicos[aula.topicoId];
  const ant = anteriores(aula);
  const dif = contarDificuldades(ant.slice(0, 4));
  return `
    <section class="card"><h2 class="rotulo alerta">Fique de ouvido</h2>
      ${t ? t.fique.map(f => `<div class="fique">${esc(f)}</div>`).join("") : ""}
      ${dif.length ? dif.slice(0, 3).map(([d, n]) => `<div class="fique" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(d)}</span><span class="txt-muted">${n} das últimas ${Math.min(4, ant.length)}</span></div>`).join("") : ""}
      ${ant[0] && ant[0].observacao ? `<div class="fique"><span class="mini">Nota da aula passada</span><br>${esc(ant[0].observacao)}</div>` : ""}
      ${!t && !dif.length && !(ant[0] && ant[0].observacao) ? `<span class="sub">Nada registrado ainda.</span>` : ""}
    </section>
    <section class="card"><h2 class="rotulo">Documentos</h2>${linksDocs(al)}</section>
    <section class="card"><label class="rotulo" for="nota-rapida">Nota rápida</label>
      <textarea id="nota-rapida" data-i="nota-rapida" placeholder="Erros e observações para a devolutiva…" style="min-height:120px">${esc(aula.notaRapida || "")}</textarea>
      <span class="mini">Vai junto para a observação do pós-aula.</span></section>`;
}

// ---------- Tela do aluno ----------
function estadoAluno() {
  if (!A) return null;
  const { aula, al } = A;
  const e = A.etapas[A.timer.etapa];
  const t = S.banco.topicos[aula.topicoId];
  const tema = S.banco.temasPorId[aula.temaId];
  const blocos = [];
  const B = (titulo, itens, extra = {}) => blocos.push({ titulo, itens, ...extra });
  if (e.id === "aquecimento") {
    const perguntas = S.banco.aquecimento[al.nivel] || S.banco.aquecimento[t ? t.nivel : "A2"] || S.banco.aquecimento.A2;
    B("", [perguntas[A.aqIdx % perguntas.length]], { grande: true });
  } else if (e.id === "homework") {
    const ant = anteriores(aula).find(a => a.homework);
    const hw = ant && ant.homework;
    if (!hw) B("", ["Let's talk about your week!"], { grande: true });
    else if (hw.tipo === "conversa") { B("Expressions", hw.vocab.map(v => v[0])); B("Writing", [hw.escrita]); B("Prepare", hw.preparar); }
    else { B("Complete", hw.completar.map(c => c[0])); B("Rewrite", hw.reescrever.map(c => `${c[0]} (${c[1]})`)); B("Translate", hw.traducao.map(c => c[0])); B("Writing", [hw.escrita]); }
  } else if (e.id === "pratica" && t) {
    const d = aula.nivelMaterial || "medio", dv = vizinha(d);
    B("Questions", [...t[d].p, ...t[dv].p]);
    B("Translate into English", [...t[d].t, ...t[dv].t].map(x => x[0]), { inicio: t[d].p.length + t[dv].p.length + 1 });
    if (A.maisEx) { B("Complete", t[d].c.map(x => x[0])); B("Rewrite", t[d].r.map(x => `${x[0]} (${x[1]})`)); }
  } else if (e.id === "listening") {
    const tx = S.banco.textosPorId[aula.textoId];
    if (tx) {
      B(tx.titulo, [], { audio: true, link: linkOuvir(tx.id), corpo: tx.texto, rate: A.rate });
      if (A.mostrarTexto) B("", [tx.texto], { texto: true });
      B("Questions", tx.perguntas); B("About you", tx.pessoais, { inicio: tx.perguntas.length + 1 });
    }
  } else if (e.id === "fala" && t) {
    B("Let's talk", t.fala);
  } else if (e.id === "tema" && tema) {
    B(tema.tema, tema.vocab.map(v => v[0]), { titulo2: "Useful expressions" });
    B("Questions", tema.perguntas.slice(0, 4));
  } else if (e.id === "discussao" && tema) {
    B("Questions", tema.perguntas.slice(4), { inicio: 5 });
    if (["B2", "C1", "C2"].includes(al.nivel)) B("Going deeper", tema.aprofundar, { inicio: tema.perguntas.length + 1 });
  } else if (e.id === "debate" && tema) {
    B("Debate", tema.debate.map(d => `“${d}”`), { grande: true });
    tema.roleplay.forEach(rp => B(`Role-play: ${rp.titulo}`, [rp.situacao]));
  } else {
    B("", ["Great class! See you next time."], { grande: true });
  }
  const EN = { aquecimento: "Warm-up", homework: "Homework check", pratica: "Practice", listening: "Listening", fala: "Speaking", fechamento: "Wrap-up", tema: "Today's topic", discussao: "Discussion", debate: "Debate & role-play", devolutiva: "Feedback" };
  return { tipo: "estado", aulaId: aula.id, aluno: al.nome.split(" ")[0], etapa: EN[e.id] || e.nome, blocos };
}
function enviarTela() { if (canal && A) { try { canal.postMessage(estadoAluno()); } catch {} } }
function linkOuvir(textoId) {
  const base = location.href.split("#")[0].split("?")[0].replace(/index\.html$/, "");
  return `${base}aluno.html?t=${encodeURIComponent(textoId)}&v=${A ? A.rate : 1}`;
}

// ---------- player ----------
function atualizarPlayer(est = TTS.estado()) {
  const btn = document.getElementById("tts-btn"), prog = document.getElementById("tts-prog"), info = document.getElementById("tts-info");
  if (!btn) return;
  btn.innerHTML = est.tocando ? ICONES.pausa : ICONES.play;
  btn.setAttribute("aria-label", est.tocando ? "Pausar" : "Tocar");
  if (prog) prog.style.width = Math.round((est.total ? est.idx / est.total : 0) * 100) + "%";
  if (info) info.textContent = est.total && (est.tocando || est.idx > 0) ? `Frase ${Math.min(est.idx + 1, est.total)} de ${est.total}${est.tocando ? "" : (est.idx >= est.total ? " · fim" : " · pausado")}` : "Pronto para tocar";
}
function prepararTTS() {
  const tx = S.banco.textosPorId[A.aula.textoId];
  if (!tx) return false;
  if (A.ttsTexto !== tx.id) { TTS.carregar(tx.texto, atualizarPlayer); TTS.definirVelocidade(A.rate); A.ttsTexto = tx.id; }
  return true;
}

function trocarEtapa(i) {
  salvarTimer(); A.timer.etapa = i; A.resp = false; TTS.parar(); A.ttsTexto = null;
  LS.set(A.kTimer, A.timer); desenharAula(); const cm = document.querySelector(".col-main"); if (cm) cm.scrollTop = 0;
}

Object.assign(ACOES, {
  "aula-play": () => {
    const t = A.timer;
    if (t.rodando) { salvarTimer(); t.rodando = false; } else { t.rodando = true; t.ultimo = Date.now(); }
    LS.set(A.kTimer, t); desenharAula();
  },
  "aula-prox": () => { if (A.timer.etapa >= A.etapas.length - 1) return ACOES["aula-pos"](); trocarEtapa(A.timer.etapa + 1); },
  "aula-etapa": el => trocarEtapa(Number(el.dataset.e)),
  "aula-pos": () => { salvarTimer(); A.timer.rodando = false; LS.set(A.kTimer, A.timer); navegar(`#/pos/${A.aula.id}`); },
  "aula-faltou": () => modalFalta(A.aula.id),
  "aula-resp": () => { A.resp = !A.resp; desenharAula(); },
  "aula-mais": () => { A.maisEx = !A.maisEx; desenharAula(); },
  "aq-outra": () => { A.aqIdx++; desenharAula(); },
  "aula-dif": async el => { A.aula.nivelMaterial = el.dataset.d; A.aula.motivoPlano = ""; await S.store.salvarAula(A.aula); desenharAula(); },
  "aula-modelo": async el => {
    const m = el.dataset.m;
    if (m === A.aula.modelo) return;
    const usado = A.timer.seg.some(s => s >= 1);
    if (usado && !confirm("Trocar o modelo reinicia o cronômetro das etapas. Continuar?")) return;
    A.aula.modelo = m;
    prepararPlano();
    A.etapas = etapasDoModelo(m);
    A.timer = { etapa: 0, seg: A.etapas.map(() => 0), rodando: A.timer.rodando, ultimo: Date.now() };
    LS.set(A.kTimer, A.timer);
    await S.store.salvarAula(A.aula); desenharAula();
  },
  "aula-tela": () => {
    const base = location.href.split("#")[0].split("?")[0].replace(/index\.html$/, "");
    const w = window.open(`${base}aluno.html`, "ca2-tela-aluno", "width=1100,height=760");
    if (!w) toast("O navegador bloqueou a janela. Permita pop-ups para este site.");
    setTimeout(enviarTela, 800);
  },
  "tx-mostrar": () => { A.mostrarTexto = !A.mostrarTexto; desenharAula(); },
  "tts-play": () => { if (!prepararTTS()) return; const e = TTS.estado(); if (e.tocando) TTS.pausar(); else TTS.tocar(); },
  "tts-parar": () => { TTS.parar(); A.ttsTexto = null; prepararTTS(); },
  "tts-voltar": () => { if (prepararTTS()) TTS.voltarFrase(); },
  "tts-rate": el => { A.rate = Number(el.dataset.r); TTS.definirVelocidade(A.rate); document.querySelectorAll('[data-a="tts-rate"]').forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.r) === A.rate))); },
  "tts-link": () => copiar(linkOuvir(A.aula.textoId)),
  "falar": el => TTS.falarUma(el.dataset.txt, 0.9)
});

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
  "aula-tema": async el => { if (!A || el.value === A.aula.temaId) return; A.aula.temaId = el.value; await S.store.salvarAula(A.aula); desenharAula(); },
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
  const modelo = aula.modelo || modeloDaAula(al, S.store.aulas, aula.id);
  let topicoId = aula.topicoId, dif = aula.nivelMaterial, temaId = aula.temaId;
  if (modelo === "conversa") { if (!temaId) temaId = sugerirTema(S.banco, al, S.store.aulas, aula.id); }
  else if (!topicoId) { const p = sugerirPlano(S.banco, al, S.store.aulas, aula.id); topicoId = p.topicoId; dif = p.dif; }
  const temHwAnterior = anteriores(aula).some(a => a.homework);
  P = {
    aula, al, modelo,
    dificuldades: [...(aula.dificuldades || [])],
    avaliacao: aula.avaliacaoMaterial || "adequado",
    hwFeito: aula.homeworkFeito || (temHwAnterior ? "" : "sem"),
    obs: aula.observacao || aula.notaRapida || "",
    topicoId, temaId, dif: dif || "medio",
    hw: aula.homework || null,
    enviarDrive: !!(S.fb && al.docHomeworkId)
  };
  if (!P.hw) regenerar();
  desenharPos(v);
  TELA.limpar = () => { P = null; };
}

function regenerar(difHw) {
  if (P.modelo === "conversa") P.hw = gerarHomeworkConversa(S.banco, P.temaId, P.al.nivel);
  else P.hw = gerarHomework(S.banco, P.topicoId, difHw || P.dif, P.avaliacao, P.aula.textoId);
}

function desenharPos(v = document.getElementById("view")) {
  const { aula, al } = P;
  const cfg = config();
  const conv = P.modelo === "conversa";
  const extras = P.dificuldades.filter(d => !cfg.dificuldades.includes(d));
  const chips = [...cfg.dificuldades, ...extras].map(d => `<button class="chip" data-a="pos-dif" data-d="${esc(d)}" aria-pressed="${P.dificuldades.includes(d)}">${P.dificuldades.includes(d) ? "✓ " : ""}${esc(d)}</button>`).join("");
  const seg = (nome, opcoes, atual) => `<div class="seg bloco" role="group" aria-label="${esc(nome)}">${opcoes.map(([v, r]) => `<button data-a="pos-seg" data-campo="${esc(nome)}" data-v="${v}" aria-pressed="${atual === v}">${r}</button>`).join("")}</div>`;
  const hw = P.hw;
  const proxima = proximaAulaDoAluno();
  const sug = sugestaoProxima();
  const destinoHw = al.docHomeworkId && S.fb ? `Ao salvar, entra no topo do documento <b>“Homework — ${esc(al.nome)}”</b> no Drive, com a data da aula. O gabarito fica só no app, para a correção na próxima aula.`
    : al.docHomeworkUrl ? `O doc de homework deste aluno foi colado à mão, então o app não consegue escrever nele. Use “Copiar homework” e cole no documento.`
    : `Este aluno ainda não tem documento de homework. ${S.fb ? `Crie no <a href="#/aluno/${esc(al.id)}">cadastro</a> (botão “Criar no Drive”).` : `Use “Copiar homework” e cole no documento do aluno.`}`;
  const resumoHw = !hw ? `<span class="sub">Escolha ${conv ? "um tema" : "um tópico"}.</span>` : hw.tipo === "conversa"
    ? `<ol class="lista-num" style="font-size:13px;gap:8px"><li><b>Frases com ${hw.vocab.length} expressões:</b> ${esc(hw.vocab.map(x => x[0]).join(", "))}</li><li><b>Escrita:</b> ${esc(hw.escrita)}</li><li><b>Preparar:</b> ${esc(hw.preparar.join(" / "))}</li></ol>`
    : `<ol class="lista-num" style="font-size:13px;gap:8px">
        <li><b>Complete (${hw.completar.length}):</b> ${esc(hw.completar.map(c => c[0]).slice(0, 2).join(" / "))}…</li>
        <li><b>Reescreva (${hw.reescrever.length}):</b> ${esc(hw.reescrever[0] ? hw.reescrever[0][0] + " (" + hw.reescrever[0][1] + ")" : "")}…</li>
        <li><b>Traduza (${hw.traducao.length}):</b> ${esc(hw.traducao.map(c => c[0]).slice(0, 2).join(" / "))}…</li>
        <li><b>Escrita:</b> ${esc(hw.escrita)}</li>
        ${hw.texto ? `<li><b>Texto:</b> reler “${esc(hw.texto.titulo)}” e responder ${hw.texto.perguntas.length} perguntas</li>` : ""}</ol>`;
  v.innerHTML = `
    <div class="barra">
      <a class="btn" href="#/aula/${esc(aula.id)}">${ICONES.voltar} Voltar à aula</a>
      <div class="linha"><b style="font-size:18px">Pós-aula · ${esc(al.nome)}</b>${tagNivel(al.nivel)}<span class="sub">${DIAS_CURTO[diaSemana(aula.data)]} ${fmtDataLonga(aula.data)} · ${esc(aula.hora || "")} · ${MODELOS[P.modelo]}</span></div>
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
          <div class="campo"><label for="pos-assunto">${conv ? "Tema da conversa" : "Tópico trabalhado"}</label>
            ${conv ? `<select id="pos-assunto" data-i="pos-tema">${opcoesTemas(P.temaId)}</select>`
                   : `<select id="pos-assunto" data-i="pos-topico">${opcoesTopicos(P.topicoId)}</select><span class="mini">Nível usado na aula: ${DIF_LABEL[P.dif]}</span>`}</div>
          <div class="pilha"><h2 class="rotulo">O material de hoje estava…</h2>${seg("avaliacao", [["facil_demais", "Fácil demais"], ["adequado", "Adequado"], ["dificil_demais", "Difícil demais"]], P.avaliacao)}</div>
          <div class="pilha"><h2 class="rotulo">Fez o homework da aula anterior?</h2>${seg("hwFeito", [["sim", "Sim"], ["parcial", "Parcial"], ["nao", "Não"], ["sem", "Não tinha"]], P.hwFeito)}</div>
          <div class="campo"><label for="pos-obs">Observação (opcional)</label><textarea id="pos-obs" data-i="pos-obs">${esc(P.obs)}</textarea></div>
        </section>
      </div>
      <div class="pilha-16">
        <section class="card destaque">
          <div class="linha"><h2 class="card-titulo flex1">Homework gerado</h2><span class="mini">${hw ? esc(hw.topicoNome) + (hw.dif ? " · " + DIF_LABEL[hw.dif] : "") : ""}</span></div>
          ${resumoHw}
          <div class="linha"><button class="btn btn-sm" data-a="pos-hw" data-o="sortear">Sortear de novo</button>${conv ? "" : `<button class="btn btn-sm" data-a="pos-hw" data-o="facil">Mais fácil</button><button class="btn btn-sm" data-a="pos-hw" data-o="dificil">Mais difícil</button>`}<button class="btn btn-sm" data-a="pos-hw" data-o="copiar">Copiar homework</button><button class="btn btn-sm" data-a="pos-hw" data-o="ver">Ver completo</button></div>
          <div class="item" style="font-size:12px">${destinoHw}</div>
          ${S.fb && al.docHomeworkId ? `<label class="check"><input type="checkbox" data-i="pos-drive" ${P.enviarDrive ? "checked" : ""}>Enviar para o documento do aluno ao salvar</label>` : ""}
          ${aula.homeworkEnviadoEm ? `<span class="mini txt-ok">✓ Homework enviado em ${new Date(aula.homeworkEnviadoEm).toLocaleString("pt-BR")}</span>` : ""}
        </section>
        <section class="card"><h2 class="rotulo">Próxima aula${proxima ? ` · ${DIAS_CURTO[diaSemana(proxima.data)]} ${fmtData(proxima.data)}, ${esc(proxima.hora || "")}` : ""}</h2>
          <div class="pilha" style="font-size:13px">
            <div><span class="txt-muted">Modelo:</span> ${MODELOS[sug.modelo]}</div>
            <div><span class="txt-muted">Corrigir:</span> este homework</div>
            <div><span class="txt-muted">${sug.modelo === "conversa" ? "Tema" : "Tópico"} sugerido:</span> ${esc(sug.nome || "—")}</div>
            ${sug.motivo ? `<div class="mini">${esc(sug.motivo)}</div>` : ""}
          </div><span class="mini">Você pode trocar dentro da aula.</span></section>
      </div>
    </div></div>`;
}

function proximaAulaDoAluno() {
  const hoje = hojeISO();
  return aulasNoPeriodo(S.store.alunos, S.store.aulas, hoje, addDays(hoje, 21))
    .find(a => a.alunoId === P.al.id && a.status === "agendada" && a.key !== P.aula.id && !jaPassou(a)) || null;
}
function sugestaoProxima() {
  const simulada = { ...P.aula, status: "dada", modelo: P.modelo, topicoId: P.modelo === "conversa" ? P.aula.topicoId : P.topicoId, temaId: P.temaId, nivelMaterial: P.dif, avaliacaoMaterial: P.avaliacao };
  const aulas = S.store.aulas.map(a => a.id === simulada.id ? simulada : a);
  const modelo = modeloDaAula(P.al, aulas, "__nenhuma__");
  if (modelo === "conversa") {
    const id = sugerirTema(S.banco, P.al, aulas, "__nenhuma__");
    return { modelo, nome: S.banco.temasPorId[id]?.tema, motivo: "Próximo tema ainda não conversado" };
  }
  const p = sugerirPlano(S.banco, P.al, aulas, "__nenhuma__");
  const t = S.banco.topicos[p.topicoId];
  return { modelo, nome: t ? `${t.nome} · ${DIF_LABEL[p.dif]}` : "", motivo: p.motivo };
}

Object.assign(ACOES, {
  "pos-dif": el => { const d = el.dataset.d; P.dificuldades = P.dificuldades.includes(d) ? P.dificuldades.filter(x => x !== d) : [...P.dificuldades, d]; desenharPos(); },
  "pos-outra": () => { const d = (prompt("Qual dificuldade?") || "").trim(); if (d && !P.dificuldades.includes(d)) { P.dificuldades.push(d); desenharPos(); } },
  "pos-seg": el => {
    const c = el.dataset.campo, val = el.dataset.v;
    if (c === "avaliacao") { P.avaliacao = val; regenerar(); }
    if (c === "hwFeito") P.hwFeito = val;
    desenharPos();
  },
  "pos-hw": async el => {
    const o = el.dataset.o;
    const idx = DIFS.indexOf(P.hw && P.hw.dif ? P.hw.dif : P.dif);
    if (o === "sortear") regenerar(P.hw && P.hw.dif);
    if (o === "facil") regenerar(DIFS[Math.max(0, idx - 1)]);
    if (o === "dificil") regenerar(DIFS[Math.min(2, idx + 1)]);
    if (o === "copiar") return copiar(homeworkComoTexto(P.hw, P.al, P.aula.data));
    if (o === "ver") return modalMensagem(P.al, homeworkComoTexto(P.hw, P.al, P.aula.data, true), "Homework completo (com gabarito)");
    desenharPos();
  },
  "pos-whats": () => {
    const nomeAssunto = P.modelo === "conversa" ? S.banco.temasPorId[P.temaId]?.tema : S.banco.topicos[P.topicoId]?.nome;
    const nome = P.al.nome.split(" ")[0];
    const linhas = [`Oi, ${nome}! Resumo da aula de hoje:`, ``, `Tema: ${nomeAssunto || "—"}`];
    if (P.dificuldades.length) linhas.push(`Para treinar: ${P.dificuldades.join(", ").toLowerCase()}.`);
    if (P.obs.trim()) linhas.push(P.obs.trim());
    linhas.push(``, P.al.docHomeworkUrl ? `O homework já está no seu documento: ${P.al.docHomeworkUrl}` : `Vou te mandar o homework em seguida.`, ``, `Até a próxima aula!`);
    modalMensagem(P.al, linhas.join("\n"), "Resumo para o aluno");
  },
  "pos-salvar": async el => {
    const { al } = P;
    const aula = { ...S.store.aula(P.aula.id) };
    Object.assign(aula, {
      status: "dada", modelo: P.modelo, dificuldades: P.dificuldades, avaliacaoMaterial: P.avaliacao, homeworkFeito: P.hwFeito || null,
      observacao: P.obs.trim(), homework: P.hw
    });
    if (P.modelo === "conversa") aula.temaId = P.temaId; else { aula.topicoId = P.topicoId; aula.nivelMaterial = P.dif; }
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
  "pos-tema": el => { if (!P || el.value === P.temaId) return; P.temaId = el.value; regenerar(); desenharPos(); },
  "pos-drive": el => { if (!P) return; P.enviarDrive = el.checked; const b = document.getElementById("btn-salvar-pos"); if (b) b.textContent = P.enviarDrive ? "Salvar e enviar homework" : "Salvar registro"; }
});
